import { createDeliveryClient } from '@kontent-ai/delivery-sdk';
import { createManagementClient } from '@kontent-ai/management-sdk';
import type { ContentType, Language, ItemPreview } from '../types';

export interface LinkedChildInfo {
  codename: string;
  availability: 'ok' | 'missing-variant' | 'invalid-reference' | 'verification-error';
  contentTypeCodename?: string;
  contentTypeName?: string;
  workflowStep?: string;
  workflowState: 'published' | 'draft' | 'archived' | 'unknown';
}

export interface LinkedChildResult {
  codenames: string[];
  infoByCodename: Record<string, LinkedChildInfo>;
}

const LINKED_INFO_BATCH_SIZE = 3;
const RETRY_DELAYS_MS = [250, 500, 1000, 2000];

const linkedInfoCache = new Map<string, LinkedChildInfo>();
const linkedInfoInFlight = new Map<string, Promise<LinkedChildInfo>>();
const contentTypeMapCache = new Map<string, Map<string, { codename: string; name: string }>>();
const workflowStepMapCache = new Map<string, Map<string, string>>();

function makeClient(environmentId: string, apiKey: string) {
  return createManagementClient({ environmentId, apiKey });
}

function makeDeliveryClient(environmentId: string) {
  return createDeliveryClient({ environmentId });
}

function resolveWorkflowState(workflowStep?: string): LinkedChildInfo['workflowState'] {
  if (!workflowStep) return 'unknown';
  const step = workflowStep.toLowerCase();
  if (step.includes('publish')) return 'published';
  if (step.includes('archive')) return 'archived';
  if (step.includes('draft')) return 'draft';
  return 'unknown';
}

function getKontentErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { errorCode?: unknown; originalError?: { response?: { status?: unknown } } };
  if (typeof candidate.errorCode === 'number') return candidate.errorCode;
  const status = candidate.originalError?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function makeLinkedInfoCacheKey(environmentId: string, language: string, codename: string): string {
  return `${environmentId}::${language}::${codename}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runInBatches<T, R>(
  values: readonly T[],
  batchSize: number,
  handler: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((value) => handler(value)));
    results.push(...batchResults);
  }

  return results;
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const errorCode = getKontentErrorCode(error);
      if (errorCode !== 429 || attempt === RETRY_DELAYS_MS.length) {
        throw error;
      }

      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

async function getContentTypeMap(
  client: ReturnType<typeof makeClient>,
  environmentId: string,
): Promise<Map<string, { codename: string; name: string }>> {
  const cached = contentTypeMapCache.get(environmentId);
  if (cached) return cached;

  const typeMap = new Map<string, { codename: string; name: string }>();
  try {
    const response = await withRetry(() => client.listContentTypes().toAllPromise());
    for (const type of response.data.items) {
      typeMap.set(type.id, { codename: type.codename, name: type.name });
    }
  } catch {
    // optional metadata only
  }

  contentTypeMapCache.set(environmentId, typeMap);
  return typeMap;
}

async function getWorkflowStepMap(
  client: ReturnType<typeof makeClient>,
  environmentId: string,
): Promise<Map<string, string>> {
  const cached = workflowStepMapCache.get(environmentId);
  if (cached) return cached;

  const stepMap = new Map<string, string>();
  try {
    const workflows = await withRetry(() => client.listWorkflows().toPromise());
    for (const workflow of workflows.data) {
      for (const step of workflow.steps) stepMap.set(step.id, step.codename);
      if (workflow.publishedStep) stepMap.set(workflow.publishedStep.id, workflow.publishedStep.codename);
      if (workflow.archivedStep) stepMap.set(workflow.archivedStep.id, workflow.archivedStep.codename);
      if (workflow.scheduledStep) stepMap.set(workflow.scheduledStep.id, workflow.scheduledStep.codename);
    }
  } catch {
    // optional metadata only
  }

  workflowStepMapCache.set(environmentId, stepMap);
  return stepMap;
}

async function getLinkedChildInfo(
  environmentId: string,
  apiKey: string,
  codename: string,
  language: string,
  typeMap: Map<string, { codename: string; name: string }>,
  stepMap: Map<string, string>,
): Promise<LinkedChildInfo> {
  const cacheKey = makeLinkedInfoCacheKey(environmentId, language, codename);
  const cached = linkedInfoCache.get(cacheKey);
  if (cached) return cached;

  const inFlight = linkedInfoInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = (async (): Promise<LinkedChildInfo> => {
    const client = makeClient(environmentId, apiKey);

    let itemExists = false;
    let variantExists = false;
    let contentTypeCodename: string | undefined;
    let contentTypeName: string | undefined;
    let workflowStep: string | undefined;

    try {
      const item = await withRetry(() => client.viewContentItem().byItemCodename(codename).toPromise());
      const typeId = item.data.type.id;
      const rawTypeCodename = (item.data._raw as { type?: { codename?: string } })?.type?.codename;
      const typeFromMap = typeMap.get(typeId);
      contentTypeCodename = rawTypeCodename ?? typeFromMap?.codename ?? typeId;
      contentTypeName = typeFromMap?.name ?? contentTypeCodename;
      itemExists = true;
    } catch (error) {
      const errorCode = getKontentErrorCode(error);
      if (errorCode && errorCode !== 404) {
        return {
          codename,
          availability: 'verification-error',
          workflowState: 'unknown',
        };
      }
    }

    if (itemExists) {
      try {
        const variant = await withRetry(() =>
          client
            .viewLanguageVariant()
            .byItemCodename(codename)
            .byLanguageCodename(language)
            .toPromise(),
        );
        variantExists = true;
        const stepId = variant.data.workflow?.stepIdentifier?.id;
        workflowStep = stepId ? (stepMap.get(stepId) ?? stepId) : undefined;
      } catch (error) {
        const errorCode = getKontentErrorCode(error);
        if (errorCode && errorCode !== 404) {
          return {
            codename,
            availability: 'verification-error',
            contentTypeCodename,
            contentTypeName,
            workflowState: 'unknown',
          };
        }
      }
    }

    if (!itemExists) {
      return {
        codename,
        availability: 'invalid-reference',
        workflowState: 'unknown',
      };
    }

    if (!variantExists) {
      return {
        codename,
        availability: 'missing-variant',
        contentTypeCodename,
        contentTypeName,
        workflowState: 'unknown',
      };
    }

    return {
      codename,
      availability: 'ok',
      contentTypeCodename,
      contentTypeName,
      workflowStep,
      workflowState: resolveWorkflowState(workflowStep),
    };
  })();

  linkedInfoInFlight.set(cacheKey, request);

  try {
    const info = await request;
    linkedInfoCache.set(cacheKey, info);
    return info;
  } finally {
    linkedInfoInFlight.delete(cacheKey);
  }
}

function collectLinkedCodenamesFromElements(elements: Array<{
  type?: string;
  value?: unknown;
  linkedItems?: Array<{ codename?: string }>;
}>): string[] {
  const linked: string[] = [];

  const pushFromRefs = (refs: Array<{ codename?: string }> | undefined) => {
    for (const ref of refs ?? []) {
      if (ref.codename) linked.push(ref.codename);
    }
  };

  const pushFromHtml = (html: string | undefined) => {
    if (!html) return;
    const regex = /data-item-codename="([^"]+)"/g;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(html)) !== null) {
      linked.push(match[1]);
    }
  };

  for (const el of elements) {
    if (el.type === 'modular_content' || el.type === 'linked_items') {
      pushFromRefs(el.value as Array<{ codename?: string }> | undefined);
    }

    if (el.type !== 'rich_text') continue;

    pushFromRefs(el.linkedItems);

    if (typeof el.value === 'string') {
      pushFromHtml(el.value);
      continue;
    }

    if (Array.isArray(el.value)) {
      pushFromRefs(el.value as Array<{ codename?: string }>);
      continue;
    }

    if (el.value && typeof el.value === 'object') {
      const candidate = el.value as {
        linkedItems?: Array<{ codename?: string }>;
        value?: string;
      };
      pushFromRefs(candidate.linkedItems);
      if (typeof candidate.value === 'string') pushFromHtml(candidate.value);
    }
  }

  return [...new Set(linked)];
}

async function fetchLinkedChildrenViaDelivery(
  environmentId: string,
  apiKey: string,
  itemCodename: string,
  language: string,
  debug: (message: string, data?: unknown) => void,
): Promise<LinkedChildResult> {
  const deliveryClient = makeDeliveryClient(environmentId);

  const fetchByLanguagePreference = async (languageCodename?: string): Promise<string[]> => {
    try {
      let request = deliveryClient.item(itemCodename).depthParameter(1);
      if (languageCodename) {
        request = request.languageParameter(languageCodename);
      }

      debug(
        languageCodename
          ? `Delivery SDK request: item(${itemCodename}).depthParameter(1).languageParameter(${languageCodename})`
          : `Delivery SDK request: item(${itemCodename}).depthParameter(1)`,
      );

      const sdkRes = await request.toPromise();
      const sdkData = sdkRes.data as {
        modularItems?:
          | Array<{ system?: { codename?: string } }>
          | Record<string, { system?: { codename?: string } }>;
        linkedItems?:
          | Array<{ system?: { codename?: string } }>
          | Record<string, { system?: { codename?: string } }>;
        modular_content?: Record<string, unknown>;
      };

      const fromSdk = new Set<string>();

      const collectFromEntity = (
        value:
          | Array<{ system?: { codename?: string } }>
          | Record<string, { system?: { codename?: string } }>
          | undefined,
      ) => {
        if (!value) return;
        if (Array.isArray(value)) {
          for (const item of value) {
            const codename = item.system?.codename;
            if (codename) fromSdk.add(codename);
          }
          return;
        }

        for (const item of Object.values(value)) {
          const codename = item.system?.codename;
          if (codename) fromSdk.add(codename);
        }
      };

      collectFromEntity(sdkData.modularItems);
      collectFromEntity(sdkData.linkedItems);

      for (const codename of Object.keys(sdkData.modular_content ?? {})) {
        fromSdk.add(codename);
      }

      return [...fromSdk];
    } catch (sdkError) {
      debug('Delivery SDK request failed', {
        message: sdkError instanceof Error ? sdkError.message : String(sdkError),
        languageCodename,
      });
      return [];
    }
  };

  const fetchByHttpPreference = async (languageCodename?: string): Promise<string[]> => {
    const baseUrl = `https://deliver.kontent.ai/${environmentId}/items/${itemCodename}?depth=1`;
    const url = languageCodename
      ? `${baseUrl}&language=${encodeURIComponent(languageCodename)}`
      : baseUrl;

    debug(`Delivery HTTP fallback request: GET ${url}`);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      debug(`Delivery HTTP fallback failed with status=${response.status}`);
      return [];
    }

    const data = (await response.json()) as {
      modular_content?: Record<string, unknown>;
    };

    return Object.keys(data.modular_content ?? {});
  };

  const fromDeliverySdk = await fetchByLanguagePreference(language);
  debug(`Delivery SDK resolved children=${fromDeliverySdk.length}`, fromDeliverySdk);
  if (fromDeliverySdk.length > 0) {
    return {
      codenames: fromDeliverySdk,
      infoByCodename: await fetchLinkedItemsInfo(environmentId, apiKey, fromDeliverySdk, language),
    };
  }

  debug('Delivery SDK returned no children for requested language; trying default language');
  const fromDeliverySdkDefault = await fetchByLanguagePreference();
  debug(
    `Delivery SDK (default language) resolved children=${fromDeliverySdkDefault.length}`,
    fromDeliverySdkDefault,
  );
  if (fromDeliverySdkDefault.length > 0) {
    return {
      codenames: fromDeliverySdkDefault,
      infoByCodename: await fetchLinkedItemsInfo(environmentId, apiKey, fromDeliverySdkDefault, language),
    };
  }

  debug('Delivery SDK returned no children; using direct Delivery HTTP fallback');

  const fromModular = await fetchByHttpPreference(language);
  if (fromModular.length > 0) {
    debug(`Delivery HTTP fallback resolved children=${fromModular.length}`, fromModular);
    return {
      codenames: fromModular,
      infoByCodename: await fetchLinkedItemsInfo(environmentId, apiKey, fromModular, language),
    };
  }

  debug('Delivery HTTP fallback returned no children for requested language; trying default language');
  const fromModularDefault = await fetchByHttpPreference();
  debug(
    `Delivery HTTP fallback (default language) resolved children=${fromModularDefault.length}`,
    fromModularDefault,
  );

  return {
    codenames: fromModularDefault,
    infoByCodename: await fetchLinkedItemsInfo(environmentId, apiKey, fromModularDefault, language),
  };
}

export async function fetchLinkedItemsInfo(
  environmentId: string,
  apiKey: string,
  codenames: string[],
  language: string,
): Promise<Record<string, LinkedChildInfo>> {
  const client = makeClient(environmentId, apiKey);
  const infoByCodename: Record<string, LinkedChildInfo> = {};
  if (codenames.length === 0) return infoByCodename;

  const typeMap = await getContentTypeMap(client, environmentId);
  const stepMap = await getWorkflowStepMap(client, environmentId);
  const pending = [...new Set(codenames)];

  for (let index = 0; index < pending.length; index += LINKED_INFO_BATCH_SIZE) {
    const batch = pending.slice(index, index + LINKED_INFO_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((codename) => getLinkedChildInfo(environmentId, apiKey, codename, language, typeMap, stepMap)),
    );

    for (const info of results) {
      infoByCodename[info.codename] = info;
    }
  }

  return infoByCodename;
}

export async function fetchRootItemStatuses(
  environmentId: string,
  apiKey: string,
  codenames: string[],
  language: string,
): Promise<Record<string, LinkedChildInfo>> {
  const client = makeClient(environmentId, apiKey);
  const infoByCodename: Record<string, LinkedChildInfo> = {};
  if (codenames.length === 0) return infoByCodename;

  const typeMap = await getContentTypeMap(client, environmentId);
  const stepMap = await getWorkflowStepMap(client, environmentId);

  await Promise.all(
    codenames.map(async (codename) => {
      let contentTypeCodename: string | undefined;
      let contentTypeName: string | undefined;
      let workflowStep: string | undefined;

      try {
        const item = await withRetry(() => client.viewContentItem().byItemCodename(codename).toPromise());
        const typeId = item.data.type.id;
        const rawTypeCodename = (item.data._raw as { type?: { codename?: string } })?.type?.codename;
        const typeFromMap = typeMap.get(typeId);
        contentTypeCodename = rawTypeCodename ?? typeFromMap?.codename ?? typeId;
        contentTypeName = typeFromMap?.name ?? contentTypeCodename;

        const variant = await withRetry(() =>
          client
            .viewLanguageVariant()
            .byItemCodename(codename)
            .byLanguageCodename(language)
            .toPromise(),
        );
        const stepId = variant.data.workflow?.stepIdentifier?.id;
        workflowStep = stepId ? (stepMap.get(stepId) ?? stepId) : undefined;

        infoByCodename[codename] = {
          codename,
          availability: 'ok',
          contentTypeCodename,
          contentTypeName,
          workflowStep,
          workflowState: resolveWorkflowState(workflowStep),
        };
      } catch {
        infoByCodename[codename] = {
          codename,
          availability: 'verification-error',
          contentTypeCodename,
          contentTypeName,
          workflowState: 'unknown',
        };
      }
    }),
  );

  return infoByCodename;
}

/**
 * Resolves a human-readable name for an environment by calling the Management API.
 * Falls back to the environmentId if the name cannot be determined.
 */
export async function resolveEnvironmentName(
  environmentId: string,
  apiKey: string,
): Promise<string> {
  try {
    const res = await fetch(`https://manage.kontent.ai/v2/projects/${environmentId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return environmentId;
    const data = (await res.json()) as {
      name?: string;
      environment?: string;
      project?: { name?: string };
    };

    return data.environment?.trim() || data.name?.trim() || data.project?.name?.trim() || environmentId;
  } catch {
    return environmentId;
  }
}

/**
 * Fetches the codenames of all linked items (modular_content elements) from
 * a specific item's language variant. Returns [] if the variant does not exist.
 */
export async function fetchLinkedChildCodenames(
  environmentId: string,
  apiKey: string,
  itemCodename: string,
  language: string,
  options?: {
    onDebug?: (message: string, data?: unknown) => void;
  },
): Promise<LinkedChildResult> {
  const debug = options?.onDebug ?? (() => undefined);
  const client = makeClient(environmentId, apiKey);

  try {
    debug(
      `SDK request: viewLanguageVariant().byItemCodename(${itemCodename}).byLanguageCodename(${language})`,
      { environmentId, itemCodename, language },
    );

    const variant = await client
      .viewLanguageVariant()
      .byItemCodename(itemCodename)
      .byLanguageCodename(language)
      .toPromise();

    const elements = variant.data._raw.elements as Array<{
      type?: string;
      value?: unknown;
      linkedItems?: Array<{ codename?: string }>;
    }>;

    debug(`Variant loaded for ${itemCodename}; elements=${elements.length}`);

    const unique = collectLinkedCodenamesFromElements(elements);
    debug(`Child resolution done for ${itemCodename}; uniqueChildren=${unique.length}`, unique);

    if (unique.length === 0) {
      debug(`No children via Management API for ${itemCodename}; trying Delivery fallback`);
      return fetchLinkedChildrenViaDelivery(environmentId, apiKey, itemCodename, language, debug);
    }

    return {
      codenames: unique,
      infoByCodename: await fetchLinkedItemsInfo(environmentId, apiKey, unique, language),
    };
  } catch (error) {
    debug(`Error resolving children for ${itemCodename}`, {
      message: error instanceof Error ? error.message : String(error),
    });

    try {
      return await fetchLinkedChildrenViaDelivery(environmentId, apiKey, itemCodename, language, debug);
    } catch (fallbackError) {
      debug(`Delivery fallback also failed for ${itemCodename}`, {
        message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      return { codenames: [], infoByCodename: {} };
    }
  }
}

/**
 * Fetches all content items from an environment for the browse tree (no limit).
 * Also resolves type codenames via the content types list so grouping works
 * even when _raw.type.codename is absent (SDK v8).
 */
export async function fetchItemsForBrowse(
  environmentId: string,
  apiKey: string,
): Promise<ItemPreview[]> {
  const client = makeClient(environmentId, apiKey);

  // Fetch items and content types in parallel
  const [itemsRes, typesRes] = await Promise.all([
    client.listContentItems().toAllPromise(),
    client.listContentTypes().toAllPromise(),
  ]);

  // Build id → { codename, name } map for reliable type resolution
  const typeIdMap = new Map<string, { codename: string; name: string }>();
  for (const ct of typesRes.data.items) {
    typeIdMap.set(ct.id, { codename: ct.codename, name: ct.name });
  }

  const resolveType = (item: { type: { id: string }; _raw: unknown }) => {
    const rawCodename = (item._raw as { type?: { codename?: string } }).type?.codename;
    const entry = typeIdMap.get(item.type.id);
    return {
      typeCodename: rawCodename ?? entry?.codename ?? item.type.id,
      typeName: entry?.name ?? rawCodename ?? item.type.id,
    };
  };

  return itemsRes.data.items.map((item) => ({
    codename: item.codename,
    name: item.name,
    ...resolveType(item),
    existsInTarget: false,
  }));
}

export async function listContentTypes(
  environmentId: string,
  apiKey: string,
): Promise<ContentType[]> {
  const client = makeClient(environmentId, apiKey);
  const res = await client.listContentTypes().toAllPromise();
  return res.data.items.map((t) => ({ codename: t.codename, name: t.name }));
}

export async function listLanguages(
  environmentId: string,
  apiKey: string,
): Promise<Language[]> {
  const client = makeClient(environmentId, apiKey);
  const res = await client.listLanguages().toAllPromise();
  return res.data.items.map((l) => ({ codename: l.codename, name: l.name }));
}

export async function fetchItemsByCodenames(
  environmentId: string,
  apiKey: string,
  codenames: string[],
): Promise<ItemPreview[]> {
  const client = makeClient(environmentId, apiKey);
  const results = await runInBatches(codenames, 3, async (codename) => {
    try {
      const response = await withRetry(() =>
        client.viewContentItem().byItemCodename(codename).toPromise(),
      );
      const item = response.data;
      const typeCodename = (item._raw as { type?: { codename?: string } }).type?.codename ?? item.type.id;
      return {
        codename: item.codename,
        name: item.name,
        typeCodename,
        existsInTarget: false,
      };
    } catch {
      return null;
    }
  });

  return results.filter((item): item is ItemPreview => item !== null);
}

export async function fetchItemsByTypes(
  environmentId: string,
  apiKey: string,
  typeCodenames: string[],
  limit: number,
): Promise<ItemPreview[]> {
  const client = makeClient(environmentId, apiKey);
  const res = await client.listContentItems().toAllPromise();
  return res.data.items
    .filter((item) => {
      const typeCodename = (item._raw as { type?: { codename?: string } }).type?.codename ?? '';
      return typeCodenames.includes(typeCodename);
    })
    .slice(0, limit)
    .map((item) => {
      const typeCodename = (item._raw as { type?: { codename?: string } }).type?.codename ?? item.type.id;
      return {
        codename: item.codename,
        name: item.name,
        typeCodename,
        existsInTarget: false,
      };
    });
}

export async function fetchAllItems(
  environmentId: string,
  apiKey: string,
  limit: number,
): Promise<ItemPreview[]> {
  const client = makeClient(environmentId, apiKey);
  const res = await client.listContentItems().toAllPromise();
  return res.data.items.slice(0, limit).map((item) => {
    const typeCodename = (item._raw as { type?: { codename?: string } }).type?.codename ?? item.type.id;
    return {
      codename: item.codename,
      name: item.name,
      typeCodename,
      existsInTarget: false,
    };
  });
}

/**
 * For each codename, checks if a language variant exists in the target environment
 * and returns its last-modified date and workflow step.
 */
export async function checkTargetItems(
  environmentId: string,
  apiKey: string,
  codenames: string[],
  languageCodename: string,
): Promise<Map<string, Pick<ItemPreview, 'existsInTarget' | 'targetLastModified' | 'targetWorkflowStep'>>> {
  const client = makeClient(environmentId, apiKey);
  const result = new Map<string, Pick<ItemPreview, 'existsInTarget' | 'targetLastModified' | 'targetWorkflowStep'>>();

  // Build workflow step ID → codename map
  const stepMap = new Map<string, string>();
  try {
    const workflows = await client.listWorkflows().toPromise();
    for (const wf of workflows.data) {
      for (const step of wf.steps) {
        stepMap.set(step.id, step.codename);
      }
      if (wf.publishedStep) stepMap.set(wf.publishedStep.id, wf.publishedStep.codename);
      if (wf.archivedStep) stepMap.set(wf.archivedStep.id, wf.archivedStep.codename);
      if (wf.scheduledStep) stepMap.set(wf.scheduledStep.id, wf.scheduledStep.codename);
    }
  } catch {
    // Ignore — step info is purely informational
  }

  // Resolve language codename → ID
  let targetLangId: string | null = null;
  try {
    const langs = await client.listLanguages().toAllPromise();
    targetLangId = langs.data.items.find((l) => l.codename === languageCodename)?.id ?? null;
  } catch {
    // Ignore
  }

  // Batch lookups
  const BATCH = 3;
  for (let i = 0; i < codenames.length; i += BATCH) {
    await Promise.all(
      codenames.slice(i, i + BATCH).map(async (codename) => {
        try {
          const variants = await client
            .listLanguageVariantsOfItem()
            .byItemCodename(codename)
            .toPromise();

          const variant = targetLangId
            ? variants.data.items.find((v) => v.language.id === targetLangId)
            : variants.data.items[0];

          if (variant) {
            const stepId = variant.workflow?.stepIdentifier?.id;
            result.set(codename, {
              existsInTarget: true,
              targetLastModified: variant.lastModified
                ? new Date(variant.lastModified).toISOString()
                : undefined,
              targetWorkflowStep: stepId ? (stepMap.get(stepId) ?? stepId) : undefined,
            });
          } else {
            result.set(codename, { existsInTarget: false });
          }
        } catch {
          result.set(codename, { existsInTarget: false });
        }
      }),
    );
  }

  return result;
}
