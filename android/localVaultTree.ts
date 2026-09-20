import type { LocalVaultItem } from './localVaultCore';

export type BrowserRow = { item: LocalVaultItem; depth: number; searchResult: boolean };

export function expandPath(previous: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(previous);
  const parts = path.split('/').filter(Boolean);
  for (let index = 1; index <= parts.length; index += 1) next.add(parts.slice(0, index).join('/'));
  return next;
}

const compareNames = (left: LocalVaultItem, right: LocalVaultItem) => {
  if (left.kind !== right.kind) {
    const rank = { folder: 0, note: 1, image: 2 } as const;
    return rank[left.kind] - rank[right.kind];
  }
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true });
};

export function buildBrowserRows(items: LocalVaultItem[], expanded: ReadonlySet<string>, query: string): BrowserRow[] {
  const search = query.trim().toLocaleLowerCase();
  if (search) {
    return items.filter((item) => (item.kind === 'note' || item.kind === 'image') && item.path.toLocaleLowerCase().includes(search))
      .sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: 'base', numeric: true }))
      .map((item) => ({ item, depth: 0, searchResult: true }));
  }

  const children = new Map<string, LocalVaultItem[]>();
  for (const item of items) {
    const siblings = children.get(item.parentPath) ?? [];
    siblings.push(item);
    children.set(item.parentPath, siblings);
  }
  const rows: BrowserRow[] = [];
  const visit = (parentPath: string, depth: number) => {
    for (const item of (children.get(parentPath) ?? []).sort(compareNames)) {
      rows.push({ item, depth, searchResult: false });
      if (item.kind === 'folder' && expanded.has(item.path)) visit(item.path, depth + 1);
    }
  };
  visit('', 0);
  return rows;
}
