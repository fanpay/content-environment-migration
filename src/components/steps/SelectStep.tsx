import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import type { ContentType, ItemPreview, ItemSelection, MigrationMethod, MigrationSetup } from '../../types';
import { listContentTypes, fetchItemsForBrowse } from '../../services/kontentService';
import { BrowseTree } from './BrowseTree';

type SelectMethod = MigrationMethod | 'browse' | 'pageTree';

interface Props {
  readonly setup: MigrationSetup;
  readonly onSubmit: (selection: ItemSelection) => void;
  readonly onBack: () => void;
  readonly isLoading: boolean;
  readonly error: string | null;
}

export function SelectStep({ setup, onSubmit, onBack, isLoading, error }: Props) {
  // Shared
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [method, setMethod] = useState<SelectMethod>('codenames');

  // By Codenames
  const [codenamesText, setCodenamesText] = useState('');

  // By Content Type
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [limit, setLimit] = useState(100);

  // Browse
  const [browseItems, setBrowseItems] = useState<ItemPreview[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoaded, setBrowseLoaded] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseSelected, setBrowseSelected] = useState<Set<string>>(new Set());

  const pageItems = useMemo(() => {
    const isPageType = (typeCodename: string) => {
      const normalized = typeCodename.toLowerCase();
      return (
        normalized === 'page' ||
        normalized === 'pages' ||
        normalized.endsWith('_page') ||
        normalized.endsWith('_pages')
      );
    };

    return browseItems.filter((item) => isPageType(item.typeCodename));
  }, [browseItems]);

  const browseContextKey = `source:${setup.sourceEnv.environmentId}`;

  useEffect(() => {
    listContentTypes(setup.sourceEnv.environmentId, setup.sourceEnv.managementApiKey)
      .then(setContentTypes)
      .catch(() => setContentTypes([]))
      .finally(() => setLoadingTypes(false));
  }, [setup]);

  useEffect(() => {
    setBrowseLoaded(false);
    setBrowseItems([]);
    setBrowseSelected(new Set());
  }, [browseContextKey]);

  useEffect(() => {
    if ((method === 'browse' || method === 'pageTree') && !browseLoaded && !browseLoading) {
      setBrowseLoading(true);
      setBrowseError(null);
      const env = setup.sourceEnv;
      fetchItemsForBrowse(env.environmentId, env.managementApiKey)
        .then((items) => {
          setBrowseItems(items);
          setBrowseLoaded(true);
        })
        .catch((err) =>
          setBrowseError(err instanceof Error ? err.message : 'Failed to load items'),
        )
        .finally(() => setBrowseLoading(false));
    }
  }, [method, browseLoaded, browseLoading, setup]);

  const toggleType = (codename: string) => {
    setSelectedTypes((prev) =>
      prev.includes(codename) ? prev.filter((c) => c !== codename) : [...prev, codename],
    );
  };

  const toggleBrowseItem = (codename: string) => {
    setBrowseSelected((prev) => {
      const next = new Set(prev);
      if (next.has(codename)) next.delete(codename);
      else next.add(codename);
      return next;
    });
  };

  const toggleBrowseAll = (codenames: string[], allSelected: boolean) => {
    setBrowseSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) codenames.forEach((c) => next.delete(c));
      else codenames.forEach((c) => next.add(c));
      return next;
    });
  };

  const isValid =
    (method === 'codenames' && codenamesText.trim().length > 0) ||
    (method === 'byType' && selectedTypes.length > 0) ||
    method === 'all' ||
    ((method === 'browse' || method === 'pageTree') && browseSelected.size > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    if (method === 'browse' || method === 'pageTree') {
      onSubmit({
        method: 'codenames',
        codenames: Array.from(browseSelected),
        typeCodenames: [],
        limit: browseSelected.size,
      });
      return;
    }

    const codenames =
      method === 'codenames'
        ? codenamesText
            .split(/[\n,]+/)
            .map((c) => c.trim())
            .filter(Boolean)
        : [];

    onSubmit({ method, codenames, typeCodenames: selectedTypes, limit });
  };

  const tabs: { value: SelectMethod; label: string }[] = [
    { value: 'codenames', label: 'By Codenames' },
    { value: 'byType', label: 'By Content Type' },
    { value: 'all', label: 'All Items' },
    { value: 'browse', label: 'Browse' },
    { value: 'pageTree', label: 'Pages' },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Select Items</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose which content items to migrate from the source environment.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Method tabs */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Migration method</p>
          <div className="grid grid-cols-5 rounded-lg border border-gray-200 overflow-hidden">
            {tabs.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMethod(value)}
                className={`py-2 text-sm font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
                  method === value
                    ? 'bg-kontent-primary text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Method-specific inputs */}
        {method === 'codenames' && (
          <div>
            <label htmlFor="codenames-input" className="block text-sm font-medium text-gray-700 mb-1">
              Item codenames{' '}
              <span className="text-gray-400 font-normal">(one per line or comma-separated)</span>
            </label>
            <textarea
              id="codenames-input"
              value={codenamesText}
              onChange={(e) => setCodenamesText(e.target.value)}
              rows={6}
              placeholder={'hero_banner\nproduct_page_overview\nfaq_section'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-kontent-primary focus:border-transparent resize-y"
            />
          </div>
        )}

        {method === 'byType' && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Content types</p>
            {loadingTypes ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading types…
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {contentTypes.map((ct) => (
                  <label
                    key={ct.codename}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(ct.codename)}
                      onChange={() => toggleType(ct.codename)}
                      className="accent-kontent-primary"
                    />
                    <span className="text-sm text-gray-800">{ct.name}</span>
                    <span className="text-xs text-gray-400 font-mono ml-auto">{ct.codename}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3">
              <label htmlFor="limit-bytype" className="block text-sm font-medium text-gray-700 mb-1">
                Max items <span className="text-gray-400 font-normal">(limit)</span>
              </label>
              <input
                id="limit-bytype"
                type="number"
                value={limit}
                min={1}
                max={2000}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kontent-primary focus:border-transparent"
              />
            </div>
          </div>
        )}

        {method === 'all' && (
          <div>
            <label htmlFor="limit-all" className="block text-sm font-medium text-gray-700 mb-1">
              Max items <span className="text-gray-400 font-normal">(limit)</span>
            </label>
            <input
              id="limit-all"
              type="number"
              value={limit}
              min={1}
              max={2000}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kontent-primary focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400">
              Fetches all items from the source environment (up to the limit).
            </p>
          </div>
        )}

        {(method === 'browse' || method === 'pageTree') && (
          <div>
            {browseLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-kontent-primary" />
                Loading items from source environment…
              </div>
            )}
            {!browseLoading && browseError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {browseError}
              </div>
            )}
            {!browseLoading && !browseError && (
              <div className="space-y-4">
                {method === 'pageTree' && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">
                      Showing root items where content type codename is <span className="font-mono">page</span> or ends with <span className="font-mono">_page</span>.
                      Data source: <span className="font-medium">Source environment</span> selected in Setup.
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                      <div className="font-medium mb-1">💡 Smart Selection with Children:</div>
                      <p>When you select a page (root item), <strong>all its linked children down to depth 8 will be automatically selected</strong>. You can also manually expand nodes to see nested items.</p>
                    </div>
                  </div>
                )}
                <BrowseTree
                  items={method === 'pageTree' ? pageItems : browseItems}
                  selected={browseSelected}
                  onToggle={toggleBrowseItem}
                  onToggleAll={toggleBrowseAll}
                  environmentId={setup.sourceEnv.environmentId}
                  apiKey={setup.sourceEnv.managementApiKey}
                  language={setup.language}
                  maxDepth={method === 'pageTree' ? 8 : undefined}
                />

                {/* Selected codenames textarea */}
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    {browseSelected.size > 0 ? (
                      <>{browseSelected.size} {browseSelected.size === 1 ? 'item' : 'items'} selected</>
                    ) : (
                      <>No items selected — check items in the tree above</>
                    )}
                  </p>
                  <textarea
                    readOnly
                    value={Array.from(browseSelected).join(', ')}
                    rows={3}
                    placeholder="Selected codenames will appear here…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 text-gray-700 resize-none focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

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
            type="submit"
            disabled={!isValid || isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-kontent-primary text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading preview…
              </>
            ) : (
              <>
                Load Preview
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
