import { Loader2 } from 'lucide-react';
import type { MigrationProgress, MigrationSetup } from '../../types';

interface Props {
  setup: MigrationSetup;
  progress: MigrationProgress;
}

export function MigrateStep({ setup, progress }: Props) {
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        {!progress.done && <Loader2 className="w-5 h-5 animate-spin text-kontent-primary" />}
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {progress.done ? 'Migration complete' : 'Migrating…'}
          </h2>
          <p className="text-sm text-gray-500">
            Target: <span className="font-medium">{setup.targetEnv.name}</span> · Language:{' '}
            <span className="font-mono font-medium">{setup.language}</span>
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>
            {progress.completed} / {progress.total} items
          </span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="h-2.5 rounded-full bg-kontent-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {progress.failed > 0 && (
          <p className="mt-1 text-xs text-red-600">{progress.failed} failed</p>
        )}
      </div>

      {progress.currentItem && (
        <p className="text-xs text-gray-400 font-mono mb-4">
          Processing: {progress.currentItem}
        </p>
      )}

      {/* Log */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          Log
        </div>
        <div className="bg-gray-950 max-h-72 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
          {progress.log.length === 0 ? (
            <p className="text-gray-500">Waiting…</p>
          ) : (
            [...progress.log].reverse().map((entry) => (
              <p
                key={entry.id}
                className={
                  entry.level === 'success'
                    ? 'text-green-400'
                    : entry.level === 'error'
                      ? 'text-red-400'
                      : entry.level === 'warning'
                        ? 'text-yellow-400'
                        : 'text-gray-400'
                }
              >
                <span className="text-gray-600 mr-2">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
                {entry.message}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
