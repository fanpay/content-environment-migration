import { createManagementClient } from '@kontent-ai/management-sdk';
import type { LogEntry, MigrationResult } from '../types';

const typeCodenameByEnvironment = new Map<string, Map<string, string>>();
const collectionCodenameByEnvironment = new Map<string, Map<string, string>>();
const RETRY_DELAYS_MS = [250, 500, 1000, 2000];

function makeLogEntry(level: LogEntry['level'], message: string): LogEntry {
  return { id: `${Date.now()}-${Math.random()}`, timestamp: new Date(), level, message };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e['message'] === 'string') return e['message'];
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }
  return String(error);
}

function getErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    errorCode?: unknown;
    originalError?: { response?: { status?: unknown } };
  };
  if (typeof candidate.errorCode === 'number') return candidate.errorCode;
  const status = candidate.originalError?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withRetryOnStatus<T>(
  operation: () => Promise<T>,
  retryStatuses: number[],
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const code = getErrorCode(error);
      if (!code || !retryStatuses.includes(code) || attempt === RETRY_DELAYS_MS.length) {
        throw error;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

async function getTypeCodenameById(
  environmentId: string,
  apiKey: string,
  typeId: string,
): Promise<string | undefined> {
  let cache = typeCodenameByEnvironment.get(environmentId);
  if (!cache) {
    const client = createManagementClient({ environmentId, apiKey });
    const response = await client.listContentTypes().toAllPromise();
    cache = new Map<string, string>();
    for (const contentType of response.data.items) {
      cache.set(contentType.id, contentType.codename);
    }
    typeCodenameByEnvironment.set(environmentId, cache);
  }
  return cache.get(typeId);
}

async function getCollectionCodenameById(
  environmentId: string,
  apiKey: string,
  collectionId: string,
): Promise<string | undefined> {
  let cache = collectionCodenameByEnvironment.get(environmentId);
  if (!cache) {
    const client = createManagementClient({ environmentId, apiKey });
    const response = await client.listCollections().toPromise();
    cache = new Map<string, string>();
    for (const collection of response.data.collections ?? []) {
      cache.set(collection.id, collection.codename);
    }
    collectionCodenameByEnvironment.set(environmentId, cache);
  }
  return cache.get(collectionId);
}

interface MigrateItemOpts {
  sourceEnvironmentId: string;
  sourceApiKey: string;
  targetEnvironmentId: string;
  targetApiKey: string;
  codename: string;
  language: string;
  onLog: (entry: LogEntry) => void;
}

/**
 * Migrates a single content item (content item record + language variant) from
 * source to target environment using the Management SDK v8.
 *
 * Strategy:
 * 1. Read the content item metadata from source and upsert it in target (by ID references).
 * 2. Read the source language variant raw elements and upsert them in target.
 *    If the variant is published in target, a new draft version is created first.
 *
 * Limitations:
 * - Linked item references must already exist in target with the same codenames.
 * - Assets are project-scoped; cross-project asset migration is out of scope.
 */
async function migrateItem({
  sourceEnvironmentId,
  sourceApiKey,
  targetEnvironmentId,
  targetApiKey,
  codename,
  language,
  onLog,
}: MigrateItemOpts): Promise<boolean> {
  const src = createManagementClient({ environmentId: sourceEnvironmentId, apiKey: sourceApiKey });
  const tgt = createManagementClient({ environmentId: targetEnvironmentId, apiKey: targetApiKey });

  try {
    // 1. Fetch source content item — use _raw to get codename-based references
    const sourceItemResp = await src.viewContentItem().byItemCodename(codename).toPromise();
    const raw = sourceItemResp.data._raw as {
      name: string;
      type: { id?: string; codename?: string };
      collection?: { id?: string; codename?: string };
      external_id?: string;
    };

    const typeCodename = raw.type.codename
      ?? (raw.type.id
        ? await getTypeCodenameById(sourceEnvironmentId, sourceApiKey, raw.type.id)
        : undefined);

    if (!typeCodename) {
      throw new Error(`Cannot resolve content type codename for "${codename}"`);
    }

    const collectionCodename = raw.collection?.codename
      ?? (raw.collection?.id
        ? await getCollectionCodenameById(sourceEnvironmentId, sourceApiKey, raw.collection.id)
        : undefined);

    const itemData = {
      name: raw.name,
      type: { codename: typeCodename },
      ...(collectionCodename ? { collection: { codename: collectionCodename } } : {}),
      ...(raw.external_id ? { external_id: raw.external_id } : {}),
    };

    // 2. Ensure the content item exists in target. Upsert-by-codename can return 404
    //    when the item doesn't exist, so create first and only then update.
    let targetItemExists = false;
    try {
      await tgt.viewContentItem().byItemCodename(codename).toPromise();
      targetItemExists = true;
    } catch (error) {
      const code = getErrorCode(error);
      if (code && code !== 404) throw error;
    }

    if (targetItemExists) {
      await tgt
        .upsertContentItem()
        .byItemCodename(codename)
        .withData(itemData)
        .toPromise();
    } else {
      await tgt
        .addContentItem()
        .withData({
          ...itemData,
          codename,
        })
        .toPromise();
    }

    // Newly created items can take a moment to become readable via variant endpoints.
    await withRetryOnStatus(
      () => tgt.viewContentItem().byItemCodename(codename).toPromise(),
      [404],
    );

    // 3. Fetch source language variant
    const sourceVariant = await src
      .viewLanguageVariant()
      .byItemCodename(codename)
      .byLanguageCodename(language)
      .toPromise();

    // 4. If variant is published in target, create a new draft version first
    try {
      await withRetryOnStatus(
        () =>
          tgt
            .createNewVersionOfLanguageVariant()
            .byItemCodename(codename)
            .byLanguageCodename(language)
            .toPromise(),
        [429],
      );
    } catch {
      // Not published — no action needed
    }

    // 5. Upsert language variant elements using the builder pattern required by SDK v8.
    //    We pass the raw elements directly since we're doing a 1:1 copy.
    const rawElements = sourceVariant.data._raw.elements;
    await withRetryOnStatus(
      () =>
        tgt
          .upsertLanguageVariant()
          .byItemCodename(codename)
          .byLanguageCodename(language)
          .withData((_builder) => ({
            elements: rawElements,
          }))
          .toPromise(),
      [404, 429],
    );

    onLog(makeLogEntry('success', `Migrated "${codename}"`));
    return true;
  } catch (error) {
    onLog(makeLogEntry('error', `Failed "${codename}": ${getErrorMessage(error)}`));
    return false;
  }
}

export interface MigrateItemsOpts {
  sourceEnvironmentId: string;
  sourceApiKey: string;
  targetEnvironmentId: string;
  targetApiKey: string;
  codenames: string[];
  language: string;
  onProgress: (completed: number, failed: number, currentItem: string, log: LogEntry[]) => void;
  concurrency?: number;
}

/**
 * Migrates a list of content items with controlled concurrency.
 */
export async function migrateItems({
  sourceEnvironmentId,
  sourceApiKey,
  targetEnvironmentId,
  targetApiKey,
  codenames,
  language,
  onProgress,
  concurrency = 3,
}: MigrateItemsOpts): Promise<MigrationResult> {
  const startMs = Date.now();
  const succeeded: string[] = [];
  const failed: Array<{ codename: string; error: string }> = [];
  const log: LogEntry[] = [];

  const addLog = (entry: LogEntry) => log.push(entry);

  for (let i = 0; i < codenames.length; i += concurrency) {
    const batch = codenames.slice(i, i + concurrency);
    onProgress(succeeded.length + failed.length, failed.length, batch[0], [...log]);

    const results = await Promise.allSettled(
      batch.map((codename) =>
        migrateItem({
          sourceEnvironmentId,
          sourceApiKey,
          targetEnvironmentId,
          targetApiKey,
          codename,
          language,
          onLog: addLog,
        }).then((ok) => ({ codename, ok })),
      ),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.ok) {
          succeeded.push(r.value.codename);
        } else {
          const lastError = [...log]
            .reverse()
            .find((e) => e.level === 'error' && e.message.includes(r.value.codename));
          failed.push({
            codename: r.value.codename,
            error: lastError?.message ?? 'Unknown error',
          });
        }
      } else {
        const codename = batch[results.indexOf(r)];
        failed.push({ codename, error: getErrorMessage(r.reason) });
      }
    }

    onProgress(succeeded.length + failed.length, failed.length, '', [...log]);
  }

  return { succeeded, failed, durationMs: Date.now() - startMs };
}
