// PCP — Lista de Compras (consumo de matéria-prima dos pedidos em aberto).
// Função PURA e testável: agrega o consumo por insumo a partir da ficha
// técnica (BOM) de cada produto × quantidade dos itens (previstoDoPedido, em
// fabrica/compras.ts, que também aplica o tecido escolhido no item) e calcula o
// que falta comprar = previsto − o que já está vinculado a cada pedido.
// O estoque (sobras guardadas) é só informativo: não abate a compra.

import { previstoDoPedido } from './fabrica/compras.ts';

const round2 = (n: number) => Math.round(n * 100) / 100; // dinheiro
const r3 = (n: number) => Math.round(n * 1000) / 1000;  // quantidades

export interface PLOrderItem {
    product_id: string;
    quantity: number;
    fabric_insumo_id?: string;
}
export interface PLOrder {
    id: string;
    order_number: string;
    deadline: string;
    items: PLOrderItem[];
}
export interface PLBomLine {
    insumo_id: string;
    quantity: number; // por peça
}
export interface PLInsumo {
    id: string;
    name: string;
    unit: string;
    current_stock: number;
    average_unit_cost: number;
    category?: string;
}

export interface PurchaseLine {
    insumo_id: string;
    insumo_name: string;
    unit: string;
    needed: number;      // consumo total previsto
    vinculado: number;   // já comprado e vinculado aos pedidos
    in_stock: number;    // sobras guardadas (informativo, não abate a compra)
    to_buy: number;      // soma das faltas por pedido (previsto − vinculado, nunca negativa)
    unit_cost: number;
    est_cost: number;    // to_buy * unit_cost
    is_shortage: boolean; // to_buy > 0
    pedidos: { order_id: string; order_number: string; falta: number }[]; // pedidos com falta, por prazo
}

export interface PurchaseListResult {
    lines: PurchaseLine[];
    total_cost: number;
    orders_count: number;
    products_without_bom: string[]; // product_ids sem ficha técnica (ignorados)
}

export function computePurchaseList(
    orders: PLOrder[],
    bomByProduct: Map<string, PLBomLine[]>,
    insumoById: Map<string, PLInsumo>,
    vinculadoPorPedido: Map<string, Map<string, number>> = new Map(),
): PurchaseListResult {
    const acc = new Map<string, { needed: number; vinculado: number; pedidos: PurchaseLine['pedidos'] }>();
    const missing = new Set<string>();

    // Prazo crescente (sem prazo por último), depois o número do pedido em ordem natural (PED-2 antes de PED-10).
    const porPrazo = [...orders].sort((a, b) =>
        (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1)
        || (a.deadline || '').localeCompare(b.deadline || '')
        || (a.order_number ?? '').localeCompare(b.order_number ?? '', 'pt-BR', { numeric: true }));

    for (const order of porPrazo) {
        for (const item of order.items || []) {
            if (!(bomByProduct.get(item.product_id)?.length)) missing.add(item.product_id);
        }
        const vinc = vinculadoPorPedido.get(order.id);
        for (const [insumoId, previsto] of previstoDoPedido(order, bomByProduct, insumoById).porInsumo) {
            const v = vinc?.get(insumoId) || 0;
            const falta = r3(Math.max(0, previsto - v));
            const a = acc.get(insumoId) ?? { needed: 0, vinculado: 0, pedidos: [] };
            a.needed += previsto;
            a.vinculado += v;
            if (falta > 0) a.pedidos.push({ order_id: order.id, order_number: order.order_number, falta });
            acc.set(insumoId, a);
        }
    }

    const lines: PurchaseLine[] = [];
    for (const [insumoId, a] of acc) {
        const ins = insumoById.get(insumoId);
        const toBuy = r3(a.pedidos.reduce((s, p) => s + p.falta, 0));
        const unitCost = ins?.average_unit_cost ?? 0;
        lines.push({
            insumo_id: insumoId,
            insumo_name: ins?.name ?? '(insumo desconhecido)',
            unit: ins?.unit ?? 'un',
            needed: r3(a.needed),
            vinculado: r3(a.vinculado),
            in_stock: r3(ins?.current_stock ?? 0),
            to_buy: toBuy,
            unit_cost: unitCost,
            est_cost: round2(toBuy * unitCost),
            is_shortage: toBuy > 0,
            pedidos: a.pedidos,
        });
    }

    // Ordena: quem precisa comprar primeiro (maior custo), depois o resto.
    lines.sort((a, b) => (b.est_cost - a.est_cost) || (b.needed - a.needed));

    return {
        lines,
        total_cost: round2(lines.reduce((s, l) => s + l.est_cost, 0)),
        orders_count: orders.length,
        products_without_bom: Array.from(missing),
    };
}
