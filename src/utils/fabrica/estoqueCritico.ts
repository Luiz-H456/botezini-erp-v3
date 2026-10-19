/** "Estoque crítico" como filtro (spec S4 §6.2). Mesmo critério do indicador de hoje. */
export const ehCritico = (i: { current_stock: number; min_stock: number }) =>
    (i.min_stock || 0) > 0 && i.current_stock <= i.min_stock;

export function filtrarCriticos<T extends { name: string; category?: string | null; current_stock: number; min_stock: number }>(
    itens: T[], busca: string, categoria: string, semCategoria: string,
): T[] {
    const b = busca.trim().toLowerCase();
    return itens.filter(i =>
        ehCritico(i)
        && (!b || i.name.toLowerCase().includes(b) || (i.category || '').toLowerCase().includes(b))
        && (!categoria || ((i.category || '').trim() || semCategoria) === categoria));
}
