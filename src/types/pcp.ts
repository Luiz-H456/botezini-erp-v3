// PCP — tipos de Planejamento e Controle da Produção.

export interface ProductionSector {
    id: string;
    name: string;
    sort_order: number;
    weekly_capacity_pieces: number;
    color: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface CapacityConfig {
    id: number;
    working_days: number;
    holidays: string[];      // ISO dates
    overtime_enabled: boolean;
    notes?: string;
}

// Log imutável de baixa parcial de produção (Fase 1C).
export interface ProductionLog {
    id: string;
    order_id: string;
    sector_id?: string | null;
    size?: string | null;
    operation?: string | null;
    qty_done: number;
    qty_expedited: number;
    notes?: string | null;
    logged_at: string;
    /** Linha do pedido baixada (produto|COR|TAMANHO). NULL nas baixas antigas. */
    item_key?: string | null;
}

// Atraso justificado de um pedido (Fase 2). Histórico: um pedido pode ter
// vários; a trava que vale no cronograma é a de maior `liberado_em`.
export interface OrderDelay {
    id: string;
    order_id: string;
    dias: number;
    motivo: string;
    liberado_em: string;      // ISO — data em que o pedido volta a ser planejado
    registrado_em: string;
}

// Derivado: progresso por pedido (total − produzido).
export interface OrderProgress {
    order_id: string;
    total_pieces: number;
    done: number;
    expedited: number;
    remaining: number;       // max(0, total - done)
    pct: number;             // done / total * 100
}

// Derivado (ocupação atual por setor) — calculado, nunca armazenado.
export interface SectorLoad {
    sector: ProductionSector;
    current_pieces: number;      // peças de pedidos ativos parados neste setor
    orders_count: number;
    occupancy_pct: number;       // current_pieces / weekly_capacity_pieces * 100
    status: 'ok' | 'sobrecarga' | 'ocioso';
}

// Derivado — visão geral da fábrica (Dashboard PCP).
export interface PcpDashboardOrder {
    order_id: string;
    order_number: string;
    client_name?: string;
    client_contact?: string;
    deadline: string;
    days: number;                // dias até o prazo (negativo = atrasado)
    pieces: number;
}
export interface PcpDashboard {
    factory_occupancy_pct: number;
    bottleneck?: { name: string; occupancy_pct: number };
    pending_count: number;
    in_production_count: number;
    late: PcpDashboardOrder[];
    upcoming: PcpDashboardOrder[];
    sector_loads: SectorLoad[];
    total_active_pieces: number;
    total_capacity: number;
}
