/**
 * Soma, por pedido e insumo, o que foi comprado para o pedido (compra_itens)
 * e o que saiu do estoque para ele (insumo_movements, source = 'uso_estoque').
 * Puro: o repositório só busca as linhas.
 */
export function somarVinculado(
    compraItens: { pedido_id?: string | null; insumo_id: string; quantidade: number | string }[],
    usos: { reference_id?: string | null; insumo_id: string; quantity: number | string }[],
): Map<string, Map<string, number>> {
    const mapa = new Map<string, Map<string, number>>();
    const soma = (pedido: string | null | undefined, insumo: string, qtd: number | string) => {
        const q = Number(qtd);
        if (!pedido || !(q > 0)) return;
        const doPedido = mapa.get(pedido) ?? new Map<string, number>();
        doPedido.set(insumo, (doPedido.get(insumo) ?? 0) + q);
        mapa.set(pedido, doPedido);
    };
    for (const c of compraItens) soma(c.pedido_id, c.insumo_id, c.quantidade);
    for (const u of usos) soma(u.reference_id, u.insumo_id, u.quantity);
    return mapa;
}

export interface CustoVinculado { quantidade: number; valor: number }

/**
 * Como `somarVinculado`, com o valor: por pedido e insumo, quanto foi vinculado e quanto custou
 * (compra: quantidade × custo_unitario; uso do estoque: quantity × unit_cost). É de onde o lucro por
 * pedido tira o preço que o pedido realmente pagou. Custo inválido conta como zero, não como falta:
 * quem decide o que fazer com preço zero é o lucro (cai para o próximo preço da fila).
 */
export function somarCustoVinculado(
    compraItens: { pedido_id?: string | null; insumo_id: string; quantidade: number | string; custo_unitario: number | string | null }[],
    usos: { reference_id?: string | null; insumo_id: string; quantity: number | string; unit_cost: number | string | null }[],
): Map<string, Map<string, CustoVinculado>> {
    const mapa = new Map<string, Map<string, CustoVinculado>>();
    const soma = (pedido: string | null | undefined, insumo: string, qtd: number | string, custo: number | string | null) => {
        const q = Number(qtd);
        if (!pedido || !(q > 0)) return;
        const c = Number(custo);
        const doPedido = mapa.get(pedido) ?? new Map<string, CustoVinculado>();
        const atual = doPedido.get(insumo) ?? { quantidade: 0, valor: 0 };
        doPedido.set(insumo, {
            quantidade: Math.round((atual.quantidade + q) * 1000) / 1000,
            valor: Math.round((atual.valor + q * (Number.isFinite(c) && c > 0 ? c : 0)) * 100) / 100,
        });
        mapa.set(pedido, doPedido);
    };
    for (const i of compraItens) soma(i.pedido_id, i.insumo_id, i.quantidade, i.custo_unitario);
    for (const u of usos) soma(u.reference_id, u.insumo_id, u.quantity, u.unit_cost);
    return mapa;
}

/**
 * Último preço pago por insumo: o custo_unitario da compra mais recente (data; no empate, o maior id,
 * que é a ordem estável que o banco devolve). Compra vinculada a pedido não passa pelo estoque e não
 * atualiza o custo médio — sem isto, tecido comprado só para pedidos ficaria sem preço para sempre.
 */
export function ultimoPrecoPorInsumo(
    itens: { insumo_id: string; custo_unitario: number | string; data: string; id: string }[],
): Map<string, number> {
    const melhor = new Map<string, { data: string; id: string; preco: number }>();
    for (const i of itens) {
        const preco = Number(i.custo_unitario);
        if (!(preco > 0)) continue;
        const atual = melhor.get(i.insumo_id);
        if (!atual || i.data > atual.data || (i.data === atual.data && i.id > atual.id)) {
            melhor.set(i.insumo_id, { data: i.data, id: i.id, preco });
        }
    }
    return new Map([...melhor].map(([k, v]) => [k, v.preco]));
}
