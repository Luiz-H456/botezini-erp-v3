// PCP — cálculo de ocupação por setor (derivado, nunca armazenado).
// Ocupação atual = peças de pedidos ativos parados em cada setor (pelo
// production_stage) ÷ capacidade semanal do setor.

import type { ProductionSector, SectorLoad } from '../types/pcp';

export interface CapOrder {
    production_stage?: string;
    items: { quantity: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeSectorLoads(orders: CapOrder[], sectors: ProductionSector[]): SectorLoad[] {
    // Peças por estágio (nome do setor).
    const piecesByStage = new Map<string, number>();
    const ordersByStage = new Map<string, number>();
    for (const o of orders) {
        const stage = o.production_stage || '';
        if (!stage) continue;
        const pieces = (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        piecesByStage.set(stage, (piecesByStage.get(stage) || 0) + pieces);
        ordersByStage.set(stage, (ordersByStage.get(stage) || 0) + 1);
    }

    return sectors.map(sector => {
        const current = piecesByStage.get(sector.name) || 0;
        const cap = sector.weekly_capacity_pieces || 0;
        const pct = cap > 0 ? round1((current / cap) * 100) : 0;
        let status: SectorLoad['status'] = 'ok';
        if (pct > 100) status = 'sobrecarga';
        else if (current > 0 && pct < 30) status = 'ocioso';
        else if (current === 0) status = 'ocioso';
        return {
            sector,
            current_pieces: current,
            orders_count: ordersByStage.get(sector.name) || 0,
            occupancy_pct: pct,
            status,
        };
    });
}
