import { CheckCircle2, XCircle, RefreshCw, Plus } from 'lucide-react';
import type { MigrationResult, MigrationSetup } from '../../types';

interface Props {
  setup: MigrationSetup;
  result: MigrationResult;
  onMigrateAgain: () => void;
  onNewMigration: () => void;
}

export function ResultsStep({ setup, result, onMigrateAgain, onNewMigration }: Props) {
  const totalSeconds = (result.durationMs / 1000).toFixed(1);
  const allSucceeded = result.failed.length === 0;

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Migration Results</h2>
      <p className="text-sm text-gray-500 mb-6">
        Migrated to <span className="font-medium">{setup.targetEnv.name}</span> in {totalSeconds}s.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">
            {result.succeeded.length + result.failed.length}
          </p>
          <p className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Total</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-green-700">{result.succeeded.length}</p>
          <p className="text-xs text-green-600 mt-1 font-medium uppercase tracking-wide">
            Succeeded
          </p>
        </div>
        <div
          className={`border rounded-lg p-4 text-center ${
            result.failed.length > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-gray-50 border-gray-200'
          }`}
        >
          <p
            className={`text-3xl font-bold ${
              result.failed.length > 0 ? 'text-red-700' : 'text-gray-400'
            }`}
          >
            {result.failed.length}
          </p>
          <p
            className={`text-xs mt-1 font-medium uppercase tracking-wide ${
              result.failed.length > 0 ? 'text-red-600' : 'text-gray-400'
            }`}
          >
            Failed
          </p>
        </div>
      </div>

      {/* Status */}
      {allSucceeded ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800 font-medium">
            All {result.succeeded.length} items migrated successfully.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-medium mb-2">
              {result.failed.length} item{result.failed.length > 1 ? 's' : ''} failed to migrate:
            </p>
            <ul className="space-y-1">
              {result.failed.map(({ codename, error }) => (
                <li key={codename}>
                  <span className="font-mono font-medium">{codename}</span>
                  <span className="text-red-600 ml-2">— {error}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Succeeded list (collapsed when long) */}
      {result.succeeded.length > 0 && (
        <details className="mb-6">
          <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800 select-none">
            View {result.succeeded.length} succeeded items
          </summary>
          <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
            {result.succeeded.map((codename) => (
              <div
                key={codename}
                className="px-4 py-2 text-xs font-mono text-gray-700 border-b last:border-b-0 border-gray-100"
              >
                ✓ {codename}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onMigrateAgain}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Migrate same items again
        </button>
        <button
          type="button"
          onClick={onNewMigration}
          className="flex items-center gap-2 px-4 py-2.5 bg-kontent-primary text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New migration
        </button>
      </div>
    </div>
  );
}
