// PCP — visão geral derivada da fábrica (Dashboard). Nada armazenado.

import type { ProductionSector, PcpDashboard, PcpDashboardOrder } from '../types/pcp';
import { computeSectorLoads } from './pcpCapacity.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface DashOrder {
    id: string;
    order_number: string;
    client_name?: string;
    client_contact?: string;
    deadline: string;
    production_stage?: string;
    status: string;                 // 'Pendente' | 'Em Produção' | ...
    items: { quantity: number }[];
}

function daysBetween(todayISO: string, deadlineISO: string): number {
    const a = new Date(todayISO + 'T00:00:00').getTime();
    const b = new Date(deadlineISO + 'T00:00:00').getTime();
    return Math.round((b - a) / 86_400_000);
}

const pieces = (o: DashOrder) => (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

export function computePcpDashboard(
    activeOrders: DashOrder[],
    sectors: ProductionSector[],
    todayISO: string,
    upcomingDays = 7,
): PcpDashboard {
    const loads = computeSectorLoads(
        activeOrders.map(o => ({ production_stage: o.production_stage, items: o.items })),
        sectors,
    );

    const totalActivePieces = activeOrders.reduce((s, o) => s + pieces(o), 0);
    const totalCapacity = sectors.reduce((s, sec) => s + (sec.weekly_capacity_pieces || 0), 0);

    // Gargalo = setor de maior ocupação.
    const bottleneck = loads.reduce<{ name: string; occupancy_pct: number } | undefined>((max, l) => {
        if (!max || l.occupancy_pct > max.occupancy_pct) return { name: l.sector.name, occupancy_pct: l.occupancy_pct };
        return max;
    }, undefined);

    const toDashOrder = (o: DashOrder): PcpDashboardOrder => ({
        order_id: o.id, order_number: o.order_number,
        client_name: o.client_name, client_contact: o.client_contact,
        deadline: o.deadline,
        days: daysBetween(todayISO, o.deadline), pieces: pieces(o),
    });

    const late: PcpDashboardOrder[] = [];
    const upcoming: PcpDashboardOrder[] = [];
    for (const o of activeOrders) {
        if (!o.deadline) continue;
        const d = daysBetween(todayISO, o.deadline);
        if (d < 0) late.push(toDashOrder(o));
        else if (d <= upcomingDays) upcoming.push(toDashOrder(o));
    }
    late.sort((a, b) => a.days - b.days);      // mais atrasado primeiro
    upcoming.sort((a, b) => a.days - b.days);   // mais próximo primeiro

    return {
        factory_occupancy_pct: totalCapacity > 0 ? round1((totalActivePieces / totalCapacity) * 100) : 0,
        bottleneck,
        pending_count: activeOrders.filter(o => o.status === 'Pendente').length,
        in_production_count: activeOrders.filter(o => o.status === 'Em Produção').length,
        late,
        upcoming,
        sector_loads: loads,
        total_active_pieces: totalActivePieces,
        total_capacity: totalCapacity,
    };
}
