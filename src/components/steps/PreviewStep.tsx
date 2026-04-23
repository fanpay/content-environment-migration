import { ArrowLeft, AlertTriangle, ArrowRight } from 'lucide-react';
import type { ItemPreview, MigrationSetup } from '../../types';

interface Props {
  setup: MigrationSetup;
  items: ItemPreview[];
  onConfirm: () => void;
  onBack: () => void;
}

export function PreviewStep({ setup, items, onConfirm, onBack }: Props) {
  const newCount = items.filter((i) => !i.existsInTarget).length;
  const overwriteCount = items.filter((i) => i.existsInTarget).length;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Migration Preview</h2>
      <p className="text-sm text-gray-500 mb-4">
        Review the items that will be migrated to{' '}
        <span className="font-medium text-gray-700">{setup.targetEnv.name}</span> in language{' '}
        <span className="font-medium font-mono text-gray-700">{setup.language}</span>.
      </p>

      {/* Summary badges */}
      <div className="flex gap-3 mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">
          {items.length} total
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
          {newCount} new
        </span>
        {overwriteCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-medium">
            {overwriteCount} will be overwritten
          </span>
        )}
      </div>

      {/* Overwrite warning */}
      {overwriteCount > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">
              {overwriteCount} item{overwriteCount > 1 ? 's' : ''} already exist in{' '}
              {setup.targetEnv.name}.
            </p>
            <p className="mt-0.5 text-amber-700">
              Their language variants will be updated. Published variants will have a new draft
              created automatically.
            </p>
          </div>
        </div>
      )}

      {/* Items table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
        <div className="bg-gray-50 px-4 py-2 grid grid-cols-12 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div className="col-span-4">Codename</div>
          <div className="col-span-3">Name</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Workflow</div>
        </div>
        <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.codename}
              className="px-4 py-2.5 grid grid-cols-12 text-sm items-center hover:bg-gray-50"
            >
              <div className="col-span-4 font-mono text-xs text-gray-600 truncate pr-2">
                {item.codename}
              </div>
              <div className="col-span-3 text-gray-800 truncate pr-2">{item.name}</div>
              <div className="col-span-2 text-xs text-gray-500 font-mono truncate pr-2">
                {item.typeCodename}
              </div>
              <div className="col-span-2">
                {item.existsInTarget ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                    Overwrite
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                    New
                  </span>
                )}
              </div>
              <div className="col-span-1 text-xs text-gray-400 truncate">
                {item.targetWorkflowStep ?? '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-kontent-primary text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          Start Migration
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
