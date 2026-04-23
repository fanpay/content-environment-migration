import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { loadAppConfig } from './config/appConfig';
import { useMigration } from './hooks/useMigration';
import { StepIndicator } from './components/StepIndicator';
import { SetupStep } from './components/steps/SetupStep';
import { SelectStep } from './components/steps/SelectStep';
import { PreviewStep } from './components/steps/PreviewStep';
import { MigrateStep } from './components/steps/MigrateStep';
import { ResultsStep } from './components/steps/ResultsStep';
import type { AppConfig } from './types';

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    loadAppConfig()
      .then(setConfig)
      .catch((err) => setInitError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (initError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-red-200 p-6">
          <div className="flex items-center gap-3 text-red-600 mb-3">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <h2 className="text-lg font-semibold">Configuration error</h2>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{initError}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin text-kontent-primary" />
          <span className="text-sm">Loading configuration…</span>
        </div>
      </div>
    );
  }

  return <MigrationWizard config={config} />;
}

function MigrationWizard({ config }: { readonly config: AppConfig }) {
  const { state, submitSetup, goBack, loadPreview, startMigration, reset } = useMigration(config);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 px-3 lg:px-6">
      <div className="mx-auto w-full max-w-screen-2xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Content Environment Migration</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Migrate content items between Kontent.ai environments
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
          <StepIndicator current={state.step} />

          {state.step === 'setup' && (
            <SetupStep onSubmit={submitSetup} />
          )}

          {state.step === 'select' && state.setup && (
            <SelectStep
              setup={state.setup}
              onSubmit={loadPreview}
              onBack={() => goBack('setup')}
              isLoading={state.isLoading}
              error={state.error}
            />
          )}

          {state.step === 'preview' && state.setup && (
            <PreviewStep
              setup={state.setup}
              items={state.previewItems}
              onConfirm={startMigration}
              onBack={() => goBack('select')}
            />
          )}

          {state.step === 'migrate' && state.setup && (
            <MigrateStep setup={state.setup} progress={state.progress} />
          )}

          {state.step === 'results' && state.setup && state.result && (
            <ResultsStep
              setup={state.setup}
              result={state.result}
              onMigrateAgain={startMigration}
              onNewMigration={reset}
            />
          )}
        </div>
      </div>
    </div>
  );
}
