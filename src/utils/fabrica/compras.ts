/**
 * Compras por pedido (S7): o que a ficha prevê para um pedido, como dividir uma
 * compra entre os pedidos e o que sobra na entrega. Sem estoque calculado: o
 * estoque só recebe o que sobra (decisão do Luiz, 14/10/2026).
 */
import type { PLOrder, PLBomLine, PLInsumo } from '../purchaseList.ts';

/** Quantidades com 3 casas (0,357 kg × 10 = 3,57), sem lixo de ponto flutuante. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const TECIDOS = ['tecidos', 'tecido'];
const ehTecido = (i?: PLInsumo) => !!i && (!i.category || TECIDOS.includes(i.category.toLowerCase()));

export interface Previsto { porInsumo: Map<string, number>; semFicha: boolean }

/** A ficha × as peças de cada item; o tecido escolhido no pedido substitui o da ficha. */
export function previstoDoPedido(pedido: PLOrder, fichas: Map<string, PLBomLine[]>, insumos: Map<string, PLInsumo>): Previsto {
    const porInsumo = new Map<string, number>();
    let semFicha = false;
    for (const item of pedido.items || []) {
        const pecas = Number(item.quantity) || 0;
        if (pecas <= 0) continue;
        const ficha = fichas.get(item.product_id) || [];
        if (ficha.length === 0) { semFicha = true; continue; }
        for (const linha of ficha) {
            let insumoId = linha.insumo_id;
            if (item.fabric_insumo_id && item.fabric_insumo_id !== linha.insumo_id && ehTecido(insumos.get(linha.insumo_id))) {
                insumoId = item.fabric_insumo_id;
            }
            const q = (Number(linha.quantity) || 0) * pecas;
            if (q > 0) porInsumo.set(insumoId, r3((porInsumo.get(insumoId) || 0) + q));
        }
    }
    return { porInsumo, semFicha };
}

/** Divide uma quantidade comprada pelas faltas, na ordem dada; o resto vai ao estoque (pedidoId null). */
export function sugerirDivisao(quantidade: number, faltas: { pedidoId: string; falta: number }[]): { pedidoId: string | null; quantidade: number }[] {
    let resto = r3(quantidade);
    const partes: { pedidoId: string | null; quantidade: number }[] = [];
    for (const f of faltas) {
        if (resto <= 0) break;
        const q = r3(Math.min(resto, Math.max(0, f.falta)));
        if (q > 0) { partes.push({ pedidoId: f.pedidoId, quantidade: q }); resto = r3(resto - q); }
    }
    if (resto > 0) partes.push({ pedidoId: null, quantidade: resto });
    return partes;
}

/** Sobra = vinculado − previsto, só o positivo. Produto sem ficha no pedido: tudo gasto (resposta 6 do Luiz). */
export function calcularSobras(vinculado: Map<string, number>, previsto: Previsto): { insumo_id: string; quantidade: number }[] {
    if (previsto.semFicha) return [];
    const sobras: { insumo_id: string; quantidade: number }[] = [];
    for (const [insumo_id, v] of vinculado) {
        const q = r3(v - (previsto.porInsumo.get(insumo_id) || 0));
        if (q > 0) sobras.push({ insumo_id, quantidade: q });
    }
    return sobras.sort((a, b) => a.insumo_id.localeCompare(b.insumo_id));
}

/**
 * Pedido que conta para comprar (Lista de compras, "Comprar" do Início, destino de compra): ativo e
 * de depois da virada. Os pedidos de antes de 15/10/2026 são legado (`compras_legado`, gravado pela
 * limpeza_de_dados_v3.sql) e nunca entram — decisão do Luiz.
 */
export function entraNasCompras(o: { status: string; compras_legado?: boolean }): boolean {
    return (o.status === 'Pendente' || o.status === 'Em Produção') && !o.compras_legado;
}
