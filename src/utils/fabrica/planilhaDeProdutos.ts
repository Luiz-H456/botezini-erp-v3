/**
 * Planilha de produtos (Tabelas de custo, parte C de 30/10): uma linha por produto com os valores
 * padrão — tecido, consumo, preços — e o custo da peça.
 *
 * Duas contas leem o consumo de tecido: o custo da peça lê o cadastro do produto
 * (`fabric_consumption_m`), a lista de compras lê a ficha técnica (`product_insumos`). Estoque zero
 * faz da ficha a ordem de compra de todo pedido, então as duas precisam andar juntas: a planilha grava
 * as duas de uma vez, e mostra quando já estão diferentes. Puro, sem import do app.
 */

export interface LinhaDaFicha { id: string; insumo_id: string; quantity: number }
interface InsumoComCategoria { id: string; category?: string | null }

export const ehTecido = (i: InsumoComCategoria | undefined) => ['tecido', 'tecidos'].includes((i?.category ?? '').trim().toLowerCase());

/** A linha de tecido da ficha (a primeira, se houver mais de uma — a planilha nunca cria a segunda). */
export function tecidoNaFicha(ficha: LinhaDaFicha[], insumos: Map<string, InsumoComCategoria>): LinhaDaFicha | null {
    return ficha.find(l => ehTecido(insumos.get(l.insumo_id))) ?? null;
}

/**
 * O que gravar quando a planilha muda tecido ou consumo: os dois campos do produto e UMA linha da
 * ficha. Atualiza a linha de tecido existente (mesmo trocando o tecido) em vez de criar outra — duas
 * linhas de tecido fariam a lista de compras pedir os dois.
 */
export function gravacoesDoConsumo(
    ficha: LinhaDaFicha[], insumos: Map<string, InsumoComCategoria>, novo: { tecidoId: string; consumo: number },
): {
    produto: { default_fabric_insumo_id: string; fabric_consumption_m: number };
    ficha: { id?: string; insumo_id: string; quantity: number };
} {
    const alvo = ficha.find(l => l.insumo_id === novo.tecidoId) ?? tecidoNaFicha(ficha, insumos);
    return {
        produto: { default_fabric_insumo_id: novo.tecidoId, fabric_consumption_m: novo.consumo },
        ficha: alvo ? { id: alvo.id, insumo_id: novo.tecidoId, quantity: novo.consumo } : { insumo_id: novo.tecidoId, quantity: novo.consumo },
    };
}

export type SituacaoDaFicha = 'sem-ficha' | 'sem-tecido' | 'tecido-so-na-ficha' | 'consumo-diferente' | 'ok';

export const ROTULO_DA_SITUACAO: Record<SituacaoDaFicha, string> = {
    'sem-ficha': 'Sem ficha: o pedido não gera compra',
    'sem-tecido': 'Ficha sem tecido: o pedido não compra tecido',
    'tecido-so-na-ficha': 'Tecido só na ficha: o custo da peça não o enxerga',
    'consumo-diferente': 'Tecido ou consumo do custo ≠ da ficha',
    ok: 'Ficha em dia',
};

export function situacaoDaFicha(
    produto: { default_fabric_insumo_id?: string | null; fabric_consumption_m?: number | null },
    ficha: LinhaDaFicha[], insumos: Map<string, InsumoComCategoria>,
): SituacaoDaFicha {
    if (ficha.length === 0) return 'sem-ficha';
    const t = tecidoNaFicha(ficha, insumos);
    if (!t) return 'sem-tecido';
    if (!produto.default_fabric_insumo_id && !(Number(produto.fabric_consumption_m) > 0)) return 'tecido-so-na-ficha';
    const mesmoTecido = produto.default_fabric_insumo_id === t.insumo_id;
    return !mesmoTecido || Math.abs(Number(t.quantity) - (Number(produto.fabric_consumption_m) || 0)) > 0.0005 ? 'consumo-diferente' : 'ok';
}

/** O conserto de um clique quando divergem: a ficha é o que compra, então o produto passa a ler dela. */
export function trazerDaFicha(ficha: LinhaDaFicha[], insumos: Map<string, InsumoComCategoria>):
    { default_fabric_insumo_id: string; fabric_consumption_m: number } | null {
    const t = tecidoNaFicha(ficha, insumos);
    return t ? { default_fabric_insumo_id: t.insumo_id, fabric_consumption_m: Number(t.quantity) } : null;
}
