// PCP — progresso de produção por pedido (derivado dos logs imutáveis).
// saldo restante = total de peças do pedido − Σ qty_done. Nunca armazenado.

import type { ProductionLog, OrderProgress } from '../types/pcp';

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ProgOrder {
    id: string;
    items: { quantity: number }[];
}

export function computeOrderProgress(orders: ProgOrder[], logs: ProductionLog[]): Map<string, OrderProgress> {
    const doneByOrder = new Map<string, number>();
    const expByOrder = new Map<string, number>();
    for (const l of logs) {
        doneByOrder.set(l.order_id, (doneByOrder.get(l.order_id) || 0) + (Number(l.qty_done) || 0));
        expByOrder.set(l.order_id, (expByOrder.get(l.order_id) || 0) + (Number(l.qty_expedited) || 0));
    }

    const out = new Map<string, OrderProgress>();
    for (const o of orders) {
        const total = (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        const done = doneByOrder.get(o.id) || 0;
        const expedited = expByOrder.get(o.id) || 0;
        out.set(o.id, {
            order_id: o.id,
            total_pieces: total,
            done,
            expedited,
            remaining: Math.max(0, round1(total - done)),
            pct: total > 0 ? round1((done / total) * 100) : 0,
        });
    }
    return out;
}
