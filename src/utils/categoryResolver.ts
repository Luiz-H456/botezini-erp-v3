import type { GlobalCategory } from '../types';

export interface CategoryResolvable {
  category?: string | null;
  global_category_id?: string | null;
}

export type CategoryLookup = GlobalCategory[] | Map<string, GlobalCategory>;

export const UNCATEGORIZED_LABEL = 'Sem categoria';

export function normalizeCategoryName(value?: string | null): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildGlobalCategoryMap(categories: GlobalCategory[]): Map<string, GlobalCategory> {
  return new Map(categories.map(category => [category.id, category]));
}

function toCategoryMap(lookup: CategoryLookup): Map<string, GlobalCategory> {
  return lookup instanceof Map ? lookup : buildGlobalCategoryMap(lookup);
}

export function resolveGlobalCategory(
  record: CategoryResolvable,
  lookup: CategoryLookup
): GlobalCategory | null {
  if (!record.global_category_id) return null;
  return toCategoryMap(lookup).get(record.global_category_id) ?? null;
}

export function resolveCategoryName(
  record: CategoryResolvable,
  lookup: CategoryLookup,
  fallback = UNCATEGORIZED_LABEL
): string {
  const globalCategory = resolveGlobalCategory(record, lookup);
  const legacyCategory = record.category?.trim();
  return globalCategory?.name ?? legacyCategory ?? fallback;
}

export function categoryMatchesFilter(
  record: CategoryResolvable,
  filter: string,
  lookup: CategoryLookup
): boolean {
  if (!filter) return true;
  if (record.global_category_id === filter) return true;

  const normalizedFilter = normalizeCategoryName(filter);
  return (
    normalizeCategoryName(resolveCategoryName(record, lookup, '')) === normalizedFilter ||
    normalizeCategoryName(record.category) === normalizedFilter
  );
}

export function hasCategoryConflict(record: CategoryResolvable, lookup: CategoryLookup): boolean {
  const globalCategory = resolveGlobalCategory(record, lookup);
  if (!globalCategory || !record.category?.trim()) return false;
  return normalizeCategoryName(globalCategory.name) !== normalizeCategoryName(record.category);
}
