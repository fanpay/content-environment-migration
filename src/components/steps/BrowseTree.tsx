import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import type { ItemPreview } from '../../types';
import {
  fetchLinkedChildCodenames,
  fetchRootItemStatuses,
} from '../../services/kontentService';
import type { LinkedChildInfo } from '../../services/kontentService';

// ─── Indeterminate checkbox ───────────────────────────────────────────────────

interface IndeterminateCheckboxProps {
  readonly indeterminate: boolean;
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly className?: string;
}

function IndeterminateCheckbox({
  indeterminate,
  checked,
  onChange,
  className,
}: IndeterminateCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={className}
    />
  );
}

function formatContentTypeLabel(typeName?: string, fallbackCodename?: string): string | null {
  const humanizeCodename = (codename: string) =>
    codename
      .trim()
      .replace(/^_+/, '')
      .split(/[_\-\s]+/)
      .filter(Boolean)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
      .join(' ');

  const normalizedTypeName = typeName?.trim();
  const normalizedFallbackCodename = fallbackCodename?.trim();
  let rawLabel: string | null = null;
  if (normalizedTypeName && normalizedTypeName.length > 0) {
    rawLabel = normalizedTypeName;
  } else if (normalizedFallbackCodename) {
    rawLabel = humanizeCodename(normalizedFallbackCodename);
  }
  if (!rawLabel) return null;

  return `${rawLabel}`;
}

// ─── Tree node ────────────────────────────────────────────────────────────────

type NodeState = 'collapsed' | 'loading' | 'expanded' | 'leaf';

interface TreeNodeProps {
  readonly codename: string;
  readonly depth: number;
  readonly maxDepth?: number;
  readonly ancestors: ReadonlySet<string>;
  readonly itemsMap: ReadonlyMap<string, ItemPreview>;
  readonly selected: ReadonlySet<string>;
  readonly childInfoMap: ReadonlyMap<string, LinkedChildInfo>;
  readonly nodeStates: ReadonlyMap<string, NodeState>;
  readonly childrenMap: ReadonlyMap<string, string[]>;
  readonly onToggle: (codename: string) => void;
  readonly onExpand: (codename: string, depth: number) => void;
  readonly onSelectWithChildren?: (codename: string, selected: boolean) => Promise<void>;
}

function TreeNode({
  codename,
  depth,
  maxDepth,
  ancestors,
  itemsMap,
  selected,
  childInfoMap,
  nodeStates,
  childrenMap,
  onToggle,
  onExpand,
  onSelectWithChildren,
}: TreeNodeProps) {
  const [isSelectingWithChildren, setIsSelectingWithChildren] = useState(false);

  if (ancestors.has(codename)) return null;

  const item = itemsMap.get(codename);
  const nodeState = nodeStates.get(codename) ?? 'collapsed';
  const isExpanded = nodeState === 'expanded';
  const isLoading = nodeState === 'loading';
  const isLeaf = nodeState === 'leaf';
  const atDepthLimit = typeof maxDepth === 'number' && depth >= maxDepth;
  const canExpand = !isLeaf && !atDepthLimit;
  const children = childrenMap.get(codename) ?? [];
  const newAncestors = new Set(ancestors).add(codename);
  const displayName = item?.name ?? codename;
  const childInfo = childInfoMap.get(codename);
  const typeLabel = formatContentTypeLabel(
    childInfo?.contentTypeName ?? item?.typeName,
    childInfo?.contentTypeCodename ?? item?.typeCodename,
  );
  
  // Debug logging for type badge
  if (depth === 0 && !childInfo?.contentTypeCodename && !item?.typeCodename) {
    console.warn(`[TreeNode] Missing type for root item ${codename}:`, {
      itemTypeCodename: item?.typeCodename,
      childInfoContentType: childInfo?.contentTypeCodename,
      itemExists: !!item,
      childInfoExists: !!childInfo,
    });
  }

  const handleCheckboxChange = async () => {
    if (depth === 0 && onSelectWithChildren && !selected.has(codename)) {
      // Root-level item being selected - use recursive selection
      setIsSelectingWithChildren(true);
      await onSelectWithChildren(codename, true);
      setIsSelectingWithChildren(false);
    } else if (depth === 0 && onSelectWithChildren && selected.has(codename)) {
      // Root-level item being deselected - deselect recursively
      setIsSelectingWithChildren(true);
      await onSelectWithChildren(codename, false);
      setIsSelectingWithChildren(false);
    } else {
      // Regular toggle for nested items
      onToggle(codename);
    }
  };

  const renderStatusBadge = () => {
    if (!childInfo) return null;

    if (childInfo.workflowState === 'unknown') return null;

    let label = childInfo.workflowStep ?? '';
    let className = 'bg-gray-100 text-gray-700 border-gray-200';

    switch (childInfo.workflowState) {
      case 'published':
        label = 'Published';
        className = 'bg-emerald-100 text-emerald-700 border-emerald-200';
        break;
      case 'archived':
        label = 'Archived';
        className = 'bg-slate-200 text-slate-700 border-slate-300';
        break;
      case 'draft':
        label = 'Draft';
        className = 'bg-blue-100 text-blue-700 border-blue-200';
        break;
      default:
        break;
    }

        if (!label) return null;

    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${className}`}>
        {label}
      </span>
    );
  };

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 pr-3 hover:bg-white border-t border-gray-100 first:border-t-0"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          type="button"
          onClick={() => onExpand(codename, depth)}
          disabled={!canExpand}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 disabled:opacity-0"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {!isLoading && isExpanded && <ChevronDown className="w-3.5 h-3.5" />}
          {!isLoading && !isExpanded && <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <input
          type="checkbox"
          checked={selected.has(codename)}
          onChange={handleCheckboxChange}
          disabled={isSelectingWithChildren}
          className="accent-kontent-primary flex-shrink-0 disabled:opacity-50"
        />

        <button
          type="button"
          onClick={() => onExpand(codename, depth)}
          disabled={!canExpand}
          className="flex min-w-0 flex-1 items-center gap-2 text-sm text-left text-gray-800 disabled:cursor-default"
        >
          <span className="min-w-0 truncate">{displayName}</span>
          <span className="shrink-0 text-gray-400 font-mono text-xs">({codename})</span>
          {typeLabel && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700 font-mono">
              {typeLabel}
            </span>
          )}
          <span className="shrink-0">{renderStatusBadge()}</span>
        </button>
      </div>

      {isExpanded &&
        children.map((childCodename) => (
          <TreeNode
            key={childCodename}
            codename={childCodename}
            depth={depth + 1}
            maxDepth={maxDepth}
            ancestors={newAncestors}
            itemsMap={itemsMap}
            selected={selected}
            childInfoMap={childInfoMap}
            nodeStates={nodeStates}
            childrenMap={childrenMap}
            onToggle={onToggle}
            onExpand={onExpand}
          />
        ))}
    </div>
  );
}

// ─── Type group ───────────────────────────────────────────────────────────────

interface TypeGroupProps {
  readonly typeName: string;
  readonly typeCodename: string;
  readonly maxDepth?: number;
  readonly items: ItemPreview[];
  readonly itemsMap: ReadonlyMap<string, ItemPreview>;
  readonly selected: ReadonlySet<string>;
  readonly childInfoMap: ReadonlyMap<string, LinkedChildInfo>;
  readonly nodeStates: ReadonlyMap<string, NodeState>;
  readonly childrenMap: ReadonlyMap<string, string[]>;
  readonly onToggle: (codename: string) => void;
  readonly onToggleGroup: (codenames: string[], allSelected: boolean) => void;
  readonly onExpand: (codename: string, depth: number) => void;
  readonly onSelectWithChildren?: (codename: string, selected: boolean) => Promise<void>;
}

function TypeGroup({
  typeName,
  typeCodename,
  maxDepth,
  items,
  itemsMap,
  selected,
  childInfoMap,
  nodeStates,
  childrenMap,
  onToggle,
  onToggleGroup,
  onExpand,
  onSelectWithChildren,
}: TypeGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const groupCodenames = items.map((item) => item.codename);
  const allSelected = groupCodenames.length > 0 && groupCodenames.every((c) => selected.has(c));
  const someSelected = groupCodenames.some((c) => selected.has(c));

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* Group header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
          aria-label={isOpen ? 'Collapse group' : 'Expand group'}
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <IndeterminateCheckbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onChange={() => onToggleGroup(groupCodenames, allSelected)}
          className="accent-kontent-primary flex-shrink-0"
        />

        <span className="text-sm font-semibold text-gray-700 truncate flex-1">{typeName}</span>
        <span className="text-xs text-gray-400 font-mono flex-shrink-0">{typeCodename}</span>
        <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
          ({items.length})
        </span>
      </div>

      {/* Items */}
      {isOpen && (
        <div>
          {items.map((item) => (
            <TreeNode
              key={item.codename}
              codename={item.codename}
              depth={0}
              maxDepth={maxDepth}
              ancestors={new Set<string>()}
              itemsMap={itemsMap}
              selected={selected}
              childInfoMap={childInfoMap}
              nodeStates={nodeStates}
              childrenMap={childrenMap}
              onToggle={onToggle}
              onExpand={onExpand}
              onSelectWithChildren={onSelectWithChildren}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BrowseTree ───────────────────────────────────────────────────────────────

interface Props {
  readonly items: ItemPreview[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (codename: string) => void;
  readonly onToggleAll: (codenames: string[], allSelected: boolean) => void;
  readonly environmentId: string;
  readonly apiKey: string;
  readonly language: string;
  readonly maxDepth?: number;
}

export function BrowseTree({
  items,
  selected,
  onToggle,
  onToggleAll,
  environmentId,
  apiKey,
  language,
  maxDepth,
}: Props) {
  const trace = (message: string, data?: unknown) => {
    if (data === undefined) {
      console.info(`[BrowseTree] ${message}`);
      return;
    }
    console.info(`[BrowseTree] ${message}`, data);
  };

  const [filter, setFilter] = useState('');
  const [nodeStates, setNodeStates] = useState<Map<string, NodeState>>(new Map());
  const [childrenMap, setChildrenMap] = useState<Map<string, string[]>>(new Map());
  const [childInfoMap, setChildInfoMap] = useState<Map<string, LinkedChildInfo>>(new Map());

  const nodeStatesRef = useRef(nodeStates);
  nodeStatesRef.current = nodeStates;
  const childrenMapRef = useRef(childrenMap);
  childrenMapRef.current = childrenMap;

  useEffect(() => {
    let cancelled = false;

    const preloadRootStatuses = async () => {
      const rootCodenames = items.map((item) => item.codename);
      if (rootCodenames.length === 0) return;

      trace(`Preloading root status for ${rootCodenames.length} items`);
      try {
        const info = await fetchRootItemStatuses(
          environmentId,
          apiKey,
          rootCodenames,
          language,
        );

        if (cancelled) return;
        setChildInfoMap((prev) => {
          const next = new Map(prev);
          for (const [codename, value] of Object.entries(info)) {
            next.set(codename, value);
            trace(`Preloaded root info for ${codename}:`, {
              contentTypeCodename: value.contentTypeCodename,
              workflowState: value.workflowState,
            });
          }
          return next;
        });
      } catch (error) {
        trace('Root status preload failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void preloadRootStatuses();

    return () => {
      cancelled = true;
    };
  }, [items, environmentId, apiKey, language]);

  // Recursive descendant collection function
  const collectDescendants = async (
    codename: string,
    currentDepth: number,
    descendants: Set<string>,
    nodeStatesMap: Map<string, NodeState>,
    childrenMapData: Map<string, string[]>,
    childInfoMapData: Map<string, LinkedChildInfo>
  ): Promise<void> => {
    if (typeof maxDepth === 'number' && currentDepth >= maxDepth) {
      trace(`Depth limit reached at ${codename}, depth=${currentDepth}`);
      return;
    }

    // Get or fetch children
    let children = childrenMapData.get(codename);
    if (!children) {
      trace(`Fetching children for ${codename} during recursive selection...`);
      const result = await fetchLinkedChildCodenames(environmentId, apiKey, codename, language, {
        onDebug: (msg, data) => trace(msg, data),
      });
      children = result.codenames;
      childrenMapData.set(codename, children);
      
      // Update childInfoMap
      for (const [childCodename, info] of Object.entries(result.infoByCodename)) {
        childInfoMapData.set(childCodename, info);
        trace(`Added child info for ${childCodename}:`, {
          contentTypeCodename: info.contentTypeCodename,
          workflowState: info.workflowState,
        });
      }
    }

    // Mark as expanded
    nodeStatesMap.set(codename, children.length > 0 ? 'expanded' : 'leaf');

    // Add all children to descendants
    for (const child of children) {
      if (!descendants.has(child)) {
        descendants.add(child);
        // Recursively collect descendants
        await collectDescendants(child, currentDepth + 1, descendants, nodeStatesMap, childrenMapData, childInfoMapData);
      }
    }
  };

  const itemsMap = useMemo(() => {
    const map = new Map<string, ItemPreview>();
    items.forEach((item) => map.set(item.codename, item));
    return map;
  }, [items]);

  // typeCodename → display name (from item.typeName, set by fetchItemsForBrowse)
  const typeNamesMap = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      if (!map.has(item.typeCodename)) {
        map.set(item.typeCodename, item.typeName ?? item.typeCodename);
      }
    });
    return map;
  }, [items]);

  // Group items by content type, sorted by type name then item name
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ItemPreview[]>();
    [...items]
      .sort((a, b) => {
        const nameA = typeNamesMap.get(a.typeCodename) ?? a.typeCodename;
        const nameB = typeNamesMap.get(b.typeCodename) ?? b.typeCodename;
        return nameA.localeCompare(nameB) || a.name.localeCompare(b.name);
      })
      .forEach((item) => {
        const existing = groups.get(item.typeCodename) ?? [];
        existing.push(item);
        groups.set(item.typeCodename, existing);
      });
    return [...groups.entries()];
  }, [items, typeNamesMap]);

  const visibleGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return groupedItems;
    return groupedItems
      .map(([typeCodename, groupItems]) => [
        typeCodename,
        groupItems.filter(
          (item) =>
            item.name.toLowerCase().includes(q) || item.codename.toLowerCase().includes(q),
        ),
      ] as const)
      .filter(([, groupItems]) => groupItems.length > 0);
  }, [filter, groupedItems]);

  const filteredCodenames = visibleGroups.flatMap(([, groupItems]) =>
    groupItems.map((item) => item.codename),
  );
  const allSelected =
    filteredCodenames.length > 0 && filteredCodenames.every((c) => selected.has(c));
  const someSelected = filteredCodenames.some((c) => selected.has(c));

  const handleToggleGroup = (codenames: string[], groupAllSelected: boolean) => {
    onToggleAll(codenames, groupAllSelected);
  };

  const handleExpand = async (codename: string, depth: number) => {
    trace(`Expand click codename=${codename} depth=${depth} maxDepth=${maxDepth ?? 'none'}`);

    if (typeof maxDepth === 'number' && depth >= maxDepth) {
      trace(`Depth limit reached for ${codename}; skipping fetch`);
      return;
    }

    const currentState = nodeStatesRef.current.get(codename) ?? 'collapsed';
    if (currentState === 'expanded') {
      trace(`Collapsing ${codename}`);
      setNodeStates((prev) => new Map(prev).set(codename, 'collapsed'));
      return;
    }
    if (currentState === 'loading' || currentState === 'leaf') {
      trace(`Skipping expand for ${codename}; currentState=${currentState}`);
      return;
    }

    if (childrenMapRef.current.has(codename)) {
      const children = childrenMapRef.current.get(codename) ?? [];
      trace(`Using cached children for ${codename}; count=${children.length}`);
      setNodeStates((prev) =>
        new Map(prev).set(codename, children.length > 0 ? 'expanded' : 'leaf'),
      );
      return;
    }

    trace(`Fetching children for ${codename}...`);
    setNodeStates((prev) => new Map(prev).set(codename, 'loading'));
    const result = await fetchLinkedChildCodenames(environmentId, apiKey, codename, language, {
      onDebug: (msg, data) => trace(msg, data),
    });
    const children = result.codenames;
    trace(`Children fetch done for ${codename}; count=${children.length}`, children);
    setChildrenMap((prev) => new Map(prev).set(codename, children));
    setChildInfoMap((prev) => {
      const next = new Map(prev);
      for (const [childCodename, info] of Object.entries(result.infoByCodename)) {
        next.set(childCodename, info);
      }
      return next;
    });
    setNodeStates((prev) =>
      new Map(prev).set(codename, children.length > 0 ? 'expanded' : 'leaf'),
    );
  };

  const handleSelectWithChildren = async (codename: string, shouldSelect: boolean) => {
    trace(`Starting recursive ${shouldSelect ? 'select' : 'deselect'} for ${codename}`);
    
    try {
      // Create mutable copies for recursive operations
      const newNodeStates = new Map(nodeStatesRef.current);
      const newChildrenMap = new Map(childrenMapRef.current);
      const newChildInfoMap = new Map(childInfoMap);

      // Collect all descendants
      const descendants = new Set<string>();
      descendants.add(codename);
      await collectDescendants(codename, 0, descendants, newNodeStates, newChildrenMap, newChildInfoMap);

      // Update UI state with all loaded data
      setNodeStates(newNodeStates);
      setChildrenMap(newChildrenMap);
      setChildInfoMap(newChildInfoMap);

      // Select or deselect all descendants
      trace(`${shouldSelect ? 'Selecting' : 'Deselecting'} ${descendants.size} items (including root)`, Array.from(descendants));
      onToggleAll(Array.from(descendants), !shouldSelect);
    } catch (error) {
      trace(`Error in recursive selection: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Fallback: just toggle the root item
      onToggle(codename);
    }
  };

  let headerLabel: string;
  if (filter.trim()) {
    const n = filteredCodenames.length;
    headerLabel = `${n} ${n === 1 ? 'result' : 'results'}`;
  } else {
    const n = items.length;
    const t = groupedItems.length;
    headerLabel = `${n} ${n === 1 ? 'item' : 'items'} in ${t} ${t === 1 ? 'type' : 'types'}`;
  }

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or codename…"
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kontent-primary focus:border-transparent"
        />
      </div>

      {/* Tree */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Global header */}
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-100 border-b border-gray-200">
          <IndeterminateCheckbox
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onChange={() => onToggleAll(filteredCodenames, allSelected)}
            className="accent-kontent-primary"
          />
          <span className="text-xs font-medium text-gray-500">{headerLabel}</span>
          <span className="text-xs text-gray-400 ml-auto">
            Click <ChevronRight className="inline w-3 h-3" /> to expand linked items
          </span>
        </div>

        {/* Groups */}
        <div className="max-h-80 overflow-y-auto">
          {visibleGroups.length === 0 ? (
            <p className="text-sm text-gray-400 p-4 text-center">No items found</p>
          ) : (
            visibleGroups.map(([typeCodename, groupItems]) => (
              <TypeGroup
                key={typeCodename}
                typeName={typeNamesMap.get(typeCodename) ?? typeCodename}
                typeCodename={typeCodename}
                maxDepth={maxDepth}
                items={groupItems}
                itemsMap={itemsMap}
                selected={selected}
                childInfoMap={childInfoMap}
                nodeStates={nodeStates}
                childrenMap={childrenMap}
                onToggle={onToggle}
                onToggleGroup={handleToggleGroup}
                onExpand={handleExpand}
                onSelectWithChildren={handleSelectWithChildren}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
