// src/types/finance.ts
// Finance KPI types — per PRD financial-dashboard-prd.jsx

// ─── Period ─────────────────────────────────────────────────────────────────

export type PeriodFilterType = 'all' | 'month' | 'quarter' | 'year';

// ─── RPCs ─────────────────────────────────────────────────────────────────────

export interface CashPosition {
    projected_balance:  number;
    reconciled_balance: number;
    net_flow:           number;
    total_receivable:   number;
    total_payable:      number;
}

export type AgingBucket = 'current' | '1_30' | '31_60' | '60_plus';

export interface AgingRow {
    obligation_type: 'receivable' | 'payable';
    bucket:          AgingBucket;
    cnt:             number;
    total_amount:    number;
}

export interface AgingSummary {
    receivable: Record<AgingBucket, number>;
    payable:    Record<AgingBucket, number>;
}

export const AGING_BUCKETS: { key: AgingBucket; label: string; color: string }[] = [
    { key: 'current',  label: 'Em dia',  color: '#10b981' },
    { key: '1_30',     label: '1–30d',   color: '#f59e0b' },
    { key: '31_60',    label: '31–60d',  color: '#ef4444' },
    { key: '60_plus',  label: '60d+',    color: '#7c3aed' },
];

export function summarizeAging(rows: AgingRow[]): AgingSummary {
    const buckets: AgingBucket[] = ['current', '1_30', '31_60', '60_plus'];
    const make = (type: 'receivable' | 'payable') =>
        Object.fromEntries(
            buckets.map(b => [b, rows.find(r => r.obligation_type === type && r.bucket === b)?.total_amount ?? 0])
        ) as Record<AgingBucket, number>;
    return { receivable: make('receivable'), payable: make('payable') };
}

// ─── P1: Cashflow Series ─────────────────────────────────────────────────────

export interface CashflowPoint {
    series_date: string;   // ISO date
    inflow:      number;
    outflow:     number;
    balance:     number;
}

// ─── Fase 1: Status financeiro derivado por pedido ──────────────────────────

export type OrderPaymentStatus = 'open' | 'partial' | 'paid' | 'overdue';

export interface OrderFinancialStatus {
    order_id:       string;
    total:          number;
    received:       number;
    to_receive:     number;
    received_pct:   number;
    next_due_date:  string | null;
    has_overdue:    boolean;
    payment_status: OrderPaymentStatus;
}

// ─── Fase 2: controles de recebíveis ────────────────────────────────────────

export interface DeliveredUnpaidRow {
    order_id:      string;
    order_number:  string;
    client_id:     string | null;
    client_name:   string | null;
    status:        string;
    deadline:      string | null;
    total:         number;
    received:      number;
    to_receive:    number;
    next_due_date: string | null;
    has_overdue:   boolean;
}

export interface AdvanceReceivedRow {
    order_id:     string;
    order_number: string;
    client_id:    string | null;
    client_name:  string | null;
    status:       string;
    total:        number;
    received:     number;
    to_receive:   number;
}

export interface ClientReceivablesRow {
    client_id:       string;
    client_name:     string | null;
    open_total:      number;
    overdue_total:   number;
    not_due_total:   number;
    obligations_cnt: number;
}

export interface PaymentMethodBreakdownRow {
    method:          string;
    obligation_type: 'receivable' | 'payable';
    cnt:             number;
    total_amount:    number;
}

// ─── Fase 3: score do cliente ────────────────────────────────────────────────

export interface ClientScore {
    score:            number | null;   // 0–100, null = sem histórico
    on_time_pct:      number | null;
    avg_delay_days:   number | null;
    overdue_ratio:    number | null;
    total_transacted: number;
    order_count:      number;
}

// ─── Fase 7: parcelas pré-lançadas (a disparar) ─────────────────────────────

export interface PendingInstallmentRow {
    obligation_id:    string;
    order_id:         string;
    order_number:     string;
    client_name:      string | null;
    description:      string;
    due_date:         string;
    remaining_amount: number;
    planned_method:   string | null;
    derived_status:   string;
}

// ─── Fase 6: Caixinhas (envelopes virtuais) ─────────────────────────────────

export interface CashEnvelope {
    id: string;
    name: string;
    color: string;
    target_amount: number;
    balance: number;
    notes?: string;
    sort_order?: number;
    is_archived?: boolean;
    purpose?: string;         // finalidade (impostos/folha/reserva/…)
    target_date?: string;     // prazo da meta (ISO)
    min_balance?: number;     // alerta de saldo mínimo
    auto_fund_pct?: number;   // % de provisionamento automático
    created_at?: string;
    updated_at?: string;
}

export interface EnvelopeMovement {
    id: string;
    envelope_id: string;
    delta: number;
    kind: 'allocate' | 'release' | 'transfer_in' | 'transfer_out';
    notes?: string;
    created_at: string;
}

export interface EnvelopeOverview {
    total_real: number;   // soma das contas bancárias ativas
    allocated:  number;   // soma das caixinhas
    free:       number;   // total_real - allocated (pode ser negativo)
}

// ─── Fase 4: reconciliação de pedido ─────────────────────────────────────────

export interface OrderReconciliation {
    order_id:          string;
    order_total:       number;
    obligations_total: number;
    delta:             number;
    suggestion:        string;
}

export interface OrderReconciliationRow {
    order_id:          string;
    order_number:      string;
    client_name:       string | null;
    order_total:       number;
    obligations_total: number;
    delta:             number;
}

// ─── Fase 3: condições de pagamento sugeridas ────────────────────────────────

export const PAYMENT_TERMS_OPTIONS: { value: string; label: string }[] = [
    { value: 'a_vista',    label: 'À vista' },
    { value: '50_50',      label: '50% entrada / 50% entrega' },
    { value: '30',         label: '30 dias' },
    { value: '30_60',      label: '30 / 60 dias' },
    { value: '30_60_90',   label: '30 / 60 / 90 dias' },
];

// ─── P1: Liquidity KPIs ──────────────────────────────────────────────────────

export interface LiquidityKPIs {
    pmr_days:          number | null;
    pmp_days:          number | null;
    cce_days:          number | null;
    coverage_days:     number | null;
    avg_daily_outflow: number;
}
