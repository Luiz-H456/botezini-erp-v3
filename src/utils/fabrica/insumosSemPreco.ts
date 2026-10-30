/**
 * Recorte "Sem preço" das Tabelas de custo (30/10): os insumos que entram no custo do pedido com
 * valor zero. Olha o cadastro inteiro (a lista normal é paginada no servidor) e respeita a busca e a
 * categoria já escolhidas. Preço, na ordem do lucro por pedido: tabela do fornecedor, depois custo médio.
 * Puro, sem import do app.
 */
export interface InsumoParaPreco { id: string; name: string; category?: string | null; average_unit_cost?: number | null }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function insumosSemPreco<T extends InsumoParaPreco>(
    insumos: T[], referencia: Map<string, number>, busca: string, categoria: string, semCategoria: string,
): T[] {
    const termo = semAcento(busca.trim());
    return insumos.filter(i => {
        if ((referencia.get(i.id) ?? 0) > 0 || Number(i.average_unit_cost) > 0) return false;
        const cat = (i.category || '').trim();
        if (categoria && (categoria === semCategoria ? cat !== '' : cat !== categoria)) return false;
        return !termo || semAcento(i.name).includes(termo) || semAcento(cat).includes(termo);
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
