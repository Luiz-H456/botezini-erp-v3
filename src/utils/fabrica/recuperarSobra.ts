/** Janela da recuperação: pedidos entregues há mais que isto não voltam à fila de "sobra a apurar". */
export const DIAS_DE_RECUPERACAO = 90;

/** Data (AAAA-MM-DD) 90 dias antes de `hoje` — o corte de `delivered_at` / `updated_at`. */
export function desdeDaRecuperacao(hoje: string, dias = DIAS_DE_RECUPERACAO): string {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString().slice(0, 10);
}

interface Entregue { id: string; delivered_at?: string | null; updated_at?: string | null }

/** Dia da entrega; sem `delivered_at` (entrega antiga), cai no `updated_at`. */
export const diaDaEntrega = (o: Entregue): string => (o.delivered_at || o.updated_at || '').slice(0, 10);

/** Entregues com algo vinculado e sem sobra apurada, dentro da janela, da mais recente para a mais antiga. */
export function entreguesSemSobra<T extends Entregue>(
    entregues: T[], comVinculo: Set<string>, apuradas: Set<string>, desde: string,
): T[] {
    return entregues
        .filter(o => comVinculo.has(o.id) && !apuradas.has(o.id) && diaDaEntrega(o) >= desde)
        .sort((a, b) => diaDaEntrega(b).localeCompare(diaDaEntrega(a)) || a.id.localeCompare(b.id));
}

/**
 * Ficha por produto a partir das linhas JÁ lidas com sucesso. Produto sem linha entra com lista
 * vazia = "sem ficha" de verdade. Só chame depois de uma leitura completa: com a leitura falha,
 * a lista vazia leria como "sem ficha" e a sobra do pedido seria travada em zero.
 */
export function agruparFichas<L extends { product_id: string }>(ids: string[], linhas: L[]): Map<string, L[]> {
    const mapa = new Map<string, L[]>(ids.map(id => [id, []]));
    for (const l of linhas) mapa.get(l.product_id)?.push(l);
    return mapa;
}
