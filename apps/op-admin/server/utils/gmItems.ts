import gmItemConfig from '../config/gmItemConfig.json';

export type GmItemCategory = 'item' | 'equipment' | 'stone' | 'partner_fragment' | 'equipment_fragment';

export interface GmItem {
  id: string;
  name: string;
  category: GmItemCategory;
}

// This catalog is specific to new_gmtools. It must not fall back to itemConfig,
// whose numeric IDs describe a different game.
const items: GmItem[] = Object.entries(gmItemConfig)
  .map(([id, value]) => Object.freeze({ id, name: value.name, category: value.category as GmItemCategory }))
  .sort((left, right) => Number(left.id) - Number(right.id));
const itemById = new Map(items.map(item => [item.id, item]));
const searchableItems = items.map(item => ({ item, name: item.name.toLowerCase() }));

export function getGmItem(id: string | number): GmItem | null {
  const key = typeof id === 'number'
    ? (Number.isSafeInteger(id) && id > 0 ? String(id) : '')
    : (typeof id === 'string' ? id.trim() : '');
  return itemById.get(key) || null;
}

export function searchGmItems(search: string, limit: number = 100): { items: GmItem[]; total: number } {
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.trunc(limit))) : 100;
  const query = String(search ?? '').trim().toLowerCase();
  if (!query) return { items: items.slice(0, count), total: items.length };

  const matches = searchableItems
    .filter(entry => entry.item.id.includes(query) || entry.name.includes(query))
    .map(entry => ({
      item: entry.item,
      rank: entry.item.id === query ? 0
        : entry.name === query ? 1
          : entry.item.id.startsWith(query) ? 2
            : entry.name.startsWith(query) ? 3 : 4,
    }))
    .sort((left, right) => left.rank - right.rank || Number(left.item.id) - Number(right.item.id));
  return { items: matches.slice(0, count).map(entry => entry.item), total: matches.length };
}
