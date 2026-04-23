import { useState } from 'react';
import { ArrowRight, Loader2, CheckCircle2, ArrowRightIcon } from 'lucide-react';
import type { EnvironmentCredentials, Language, MigrationSetup } from '../../types';
import { listLanguages, resolveEnvironmentName } from '../../services/kontentService';

interface Props {
  readonly onSubmit: (setup: MigrationSetup) => void;
}

interface EnvForm {
  environmentId: string;
  managementApiKey: string;
}

type VerifyState = 'idle' | 'verifying' | 'verified' | 'error';

export function SetupStep({ onSubmit }: Props) {
  const [source, setSource] = useState<EnvForm>({
    environmentId: import.meta.env.VITE_SOURCE_ENVIRONMENT_ID ?? '',
    managementApiKey: import.meta.env.VITE_SOURCE_MANAGEMENT_API_KEY ?? '',
  });
  const [target, setTarget] = useState<EnvForm>({
    environmentId: import.meta.env.VITE_TARGET_ENVIRONMENT_ID ?? '',
    managementApiKey: import.meta.env.VITE_TARGET_MANAGEMENT_API_KEY ?? '',
  });

  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [sourceEnv, setSourceEnv] = useState<EnvironmentCredentials | null>(null);
  const [targetEnv, setTargetEnv] = useState<EnvironmentCredentials | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('');

  const resetVerification = () => {
    if (verifyState !== 'idle') {
      setVerifyState('idle');
      setVerifyError(null);
      setSourceEnv(null);
      setTargetEnv(null);
      setLanguages([]);
      setSelectedLanguage('');
    }
  };

  const canVerify =
    source.environmentId.trim() &&
    source.managementApiKey.trim() &&
    target.environmentId.trim() &&
    target.managementApiKey.trim();

  const handleVerify = async () => {
    if (!canVerify) return;
    setVerifyState('verifying');
    setVerifyError(null);

    try {
      const [sourceName, targetName, langs] = await Promise.all([
        resolveEnvironmentName(source.environmentId.trim(), source.managementApiKey.trim()),
        resolveEnvironmentName(target.environmentId.trim(), target.managementApiKey.trim()),
        listLanguages(source.environmentId.trim(), source.managementApiKey.trim()),
      ]);

      setSourceEnv({ ...source, environmentId: source.environmentId.trim(), managementApiKey: source.managementApiKey.trim(), name: sourceName });
      setTargetEnv({ ...target, environmentId: target.environmentId.trim(), managementApiKey: target.managementApiKey.trim(), name: targetName });
      setLanguages(langs);
      if (langs.length > 0) setSelectedLanguage(langs[0].codename);
      setVerifyState('verified');
    } catch (err) {
      setVerifyError(
        err instanceof Error
          ? err.message
          : 'Could not connect to one or both environments. Check your credentials.',
      );
      setVerifyState('error');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceEnv || !targetEnv || !selectedLanguage) return;
    onSubmit({ sourceEnv, targetEnv, language: selectedLanguage });
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Migration Setup</h2>
      <p className="text-sm text-gray-500 mb-6">
        Enter the credentials for the source and target environments.
      </p>

      <div className="space-y-5">
        {/* Source environment */}
        <fieldset className="border border-gray-200 rounded-lg p-4">
          <legend className="text-sm font-semibold text-gray-700 px-1">Source environment</legend>
          <div className="space-y-3 mt-1">
            <div>
              <label htmlFor="source-env-id" className="block text-xs font-medium text-gray-600 mb-1">Environment ID</label>
              <input
                id="source-env-id"
                type="text"
                value={source.environmentId}
                onChange={(e) => { setSource((s) => ({ ...s, environmentId: e.target.value })); resetVerification(); }}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kontent-primary focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="source-api-key" className="block text-xs font-medium text-gray-600 mb-1">Management API Key</label>
              <input
                id="source-api-key"
                type="password"
                value={source.managementApiKey}
                onChange={(e) => { setSource((s) => ({ ...s, managementApiKey: e.target.value })); resetVerification(); }}
                placeholder="ey…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kontent-primary focus:border-transparent"
              />
            </div>
          </div>
        </fieldset>

        {/* Target environment */}
        <fieldset className="border border-gray-200 rounded-lg p-4">
          <legend className="text-sm font-semibold text-gray-700 px-1">Target environment</legend>
          <div className="space-y-3 mt-1">
            <div>
              <label htmlFor="target-env-id" className="block text-xs font-medium text-gray-600 mb-1">Environment ID</label>
              <input
                id="target-env-id"
                type="text"
                value={target.environmentId}
                onChange={(e) => { setTarget((s) => ({ ...s, environmentId: e.target.value })); resetVerification(); }}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kontent-primary focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="target-api-key" className="block text-xs font-medium text-gray-600 mb-1">Management API Key</label>
              <input
                id="target-api-key"
                type="password"
                value={target.managementApiKey}
                onChange={(e) => { setTarget((s) => ({ ...s, managementApiKey: e.target.value })); resetVerification(); }}
                placeholder="ey…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kontent-primary focus:border-transparent"
              />
            </div>
          </div>
        </fieldset>

        {/* Verify button */}
        {verifyState !== 'verified' && (
          <button
            type="button"
            onClick={handleVerify}
            disabled={!canVerify || verifyState === 'verifying'}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-kontent-primary text-kontent-primary rounded-lg font-medium text-sm hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {verifyState === 'verifying' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying…
              </>
            ) : (
              'Verify environments'
            )}
          </button>
        )}

        {/* Error */}
        {verifyState === 'error' && verifyError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {verifyError}
          </div>
        )}

        {/* Overview + language (shown after successful verify) */}
        {verifyState === 'verified' && sourceEnv && targetEnv && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Migration overview */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 mb-3 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                Environments verified
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                <div className="min-w-0 bg-white border border-gray-200 rounded-lg px-4 py-3 text-left">
                  <p className="text-xs text-gray-500 mb-0.5">FROM</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">{sourceEnv.name}</p>
                  <p className="text-xs text-gray-400 font-mono break-all">{sourceEnv.environmentId}</p>
                </div>
                <ArrowRightIcon className="hidden md:block w-5 h-5 text-gray-400 flex-shrink-0 justify-self-center" />
                <div className="min-w-0 bg-white border border-gray-200 rounded-lg px-4 py-3 text-left">
                  <p className="text-xs text-gray-500 mb-0.5">TO</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">{targetEnv.name}</p>
                  <p className="text-xs text-gray-400 font-mono break-all">{targetEnv.environmentId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetVerification}
                className="mt-3 text-xs text-green-700 underline hover:no-underline"
              >
                Change environments
              </button>
            </div>

            {/* Language */}
            <div>
              <label htmlFor="language-select" className="block text-sm font-medium text-gray-700 mb-1">Language</label>
              <select
                id="language-select"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kontent-primary focus:border-transparent"
              >
                {languages.map((l) => (
                  <option key={l.codename} value={l.codename}>
                    {l.name} ({l.codename})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={!selectedLanguage}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-kontent-primary text-white rounded-lg font-medium text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next: Select Items
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
