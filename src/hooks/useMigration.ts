import { useState, useCallback } from 'react';
import type {
  StepId,
  AppConfig,
  MigrationSetup,
  ItemSelection,
  ItemPreview,
  MigrationProgress,
  MigrationResult,
} from '../types';
import {
  fetchItemsByCodenames,
  fetchItemsByTypes,
  fetchAllItems,
  checkTargetItems,
} from '../services/kontentService';
import { migrateItems } from '../services/migrationService';

export interface MigrationState {
  step: StepId;
  setup: MigrationSetup | null;
  selection: ItemSelection | null;
  previewItems: ItemPreview[];
  progress: MigrationProgress;
  result: MigrationResult | null;
  error: string | null;
  isLoading: boolean;
}

const defaultProgress: MigrationProgress = {
  total: 0,
  completed: 0,
  failed: 0,
  log: [],
  done: false,
};

export function useMigration(_config: AppConfig) {
  const [state, setState] = useState<MigrationState>({
    step: 'setup',
    setup: null,
    selection: null,
    previewItems: [],
    progress: defaultProgress,
    result: null,
    error: null,
    isLoading: false,
  });

  const submitSetup = useCallback((setup: MigrationSetup) => {
    setState((s) => ({ ...s, setup, step: 'select', error: null }));
  }, []);

  const goBack = useCallback((toStep: StepId) => {
    setState((s) => ({ ...s, step: toStep, error: null }));
  }, []);

  const loadPreview = useCallback(
    async (selection: ItemSelection) => {
      if (!state.setup) return;
      const { sourceEnv, targetEnv, language } = state.setup;

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        let items: ItemPreview[];

        if (selection.method === 'codenames') {
          items = await fetchItemsByCodenames(
            sourceEnv.environmentId,
            sourceEnv.managementApiKey,
            selection.codenames,
          );
        } else if (selection.method === 'byType') {
          items = await fetchItemsByTypes(
            sourceEnv.environmentId,
            sourceEnv.managementApiKey,
            selection.typeCodenames,
            selection.limit,
          );
        } else {
          items = await fetchAllItems(
            sourceEnv.environmentId,
            sourceEnv.managementApiKey,
            selection.limit,
          );
        }

        if (items.length === 0) {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: 'No items found with the selected criteria.',
          }));
          return;
        }

        const targetStatus = await checkTargetItems(
          targetEnv.environmentId,
          targetEnv.managementApiKey,
          items.map((i) => i.codename),
          language,
        );

        const enriched = items.map((item) => ({
          ...item,
          ...(targetStatus.get(item.codename) ?? { existsInTarget: false }),
        }));

        setState((s) => ({
          ...s,
          selection,
          previewItems: enriched,
          step: 'preview',
          isLoading: false,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [state.setup],
  );

  const startMigration = useCallback(async () => {
    if (!state.setup) return;
    const { sourceEnv, targetEnv, language } = state.setup;

    const codenames = state.previewItems.map((i) => i.codename);

    setState((s) => ({
      ...s,
      step: 'migrate',
      progress: { total: codenames.length, completed: 0, failed: 0, log: [], done: false },
      result: null,
      error: null,
    }));

    const result = await migrateItems({
      sourceEnvironmentId: sourceEnv.environmentId,
      sourceApiKey: sourceEnv.managementApiKey,
      targetEnvironmentId: targetEnv.environmentId,
      targetApiKey: targetEnv.managementApiKey,
      codenames,
      language,
      onProgress: (completed, failed, currentItem, log) => {
        setState((s) => ({
          ...s,
          progress: { ...s.progress, completed, failed, currentItem, log },
        }));
      },
    });

    setState((s) => ({
      ...s,
      step: 'results',
      progress: { ...s.progress, done: true },
      result,
    }));
  }, [state.setup, state.previewItems]);

  const reset = useCallback(() => {
    setState({
      step: 'setup',
      setup: null,
      selection: null,
      previewItems: [],
      progress: defaultProgress,
      result: null,
      error: null,
      isLoading: false,
    });
  }, []);

  return { state, submitSetup, goBack, loadPreview, startMigration, reset };
}
