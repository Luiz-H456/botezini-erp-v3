// PCP — Motor de planejamento (determinístico e explicável). Regras (decididas):
//  1. Prioridade: por PRAZO de entrega (mais urgente primeiro).
//  2. Agrupamento p/ minimizar troca de regulagem: TECIDO → COR → TIPO.
//  3. Sobrecarga: empurra o excedente para a próxima semana (bin-packing).
//  4. Trava de atraso: pedido com atraso registrado não entra em semana que
//     comece antes da data em que ele foi liberado.
//
// Não é IA: é ordenação + empacotamento + sequenciamento, tudo auditável.

import { segundaDaSemana, diasEntre } from './pcpSemana.ts';

export interface SchedOrder {
    id: string;
    order_number: string;
    client_name?: string;
    client_contact?: string;
    deadline: string;        // ISO
    pieces: number;
    fabric?: string;
    color?: string;
    product_type?: string;
}

export interface ScheduledOrder extends SchedOrder {
    week_index: number;
    week_start: string;      // ISO (segunda)
    sequence_index: number;  // ordem dentro da semana (após agrupar)
    planned_end: string;     // fim da semana planejada
    late: boolean;           // planned_end > deadline
    blocked_until?: string;  // atraso registrado: só volta a andar nesta data
}

/**
 * Travas de atraso: id do pedido → data em que ele volta a andar.
 *
 * É uma DATA, não uma quantidade de dias, de propósito. Se fosse "3 dias", cada
 * recálculo empurraria o pedido mais 3 dias a partir de hoje e o cronograma
 * nunca convergiria. Com data fixa, recalcular dez vezes dá o mesmo plano —
 * que é o requisito de recálculo idempotente.
 */
export type TravasAtraso = Record<string, string>;

export interface ScheduleWeek {
    week_index: number;
    week_start: string;
    orders: ScheduledOrder[];
    used_pieces: number;
    capacity: number;
    occupancy_pct: number;
    overloaded: boolean;
}

export interface ScheduleResult {
    weeks: ScheduleWeek[];
    late_count: number;
    setup_changes: number;            // trocas na sequência agrupada
    setup_changes_ungrouped: number;  // trocas se fosse só por prazo
    setup_saved: number;              // economia = ungrouped - agrupado
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function addDaysISO(iso: string, days: number): string {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// Trocas de regulagem numa sequência: pares adjacentes que diferem em
// tecido/cor/tipo (cada diferença conta 1).
function countSetupChanges(seq: SchedOrder[]): number {
    let changes = 0;
    for (let i = 1; i < seq.length; i++) {
        const a = seq[i - 1], b = seq[i];
        if ((a.fabric || '') !== (b.fabric || '')) changes++;
        if ((a.color || '') !== (b.color || '')) changes++;
        if ((a.product_type || '') !== (b.product_type || '')) changes++;
    }
    return changes;
}

// Agrupa por tecido → cor → tipo (mantém estável o resto).
function groupBySetup(orders: SchedOrder[]): SchedOrder[] {
    return [...orders].sort((a, b) =>
        (a.fabric || '').localeCompare(b.fabric || '') ||
        (a.color || '').localeCompare(b.color || '') ||
        (a.product_type || '').localeCompare(b.product_type || ''));
}

export interface SimulationResult {
    placed_week_index: number;         // semana onde o pedido simulado caiu (-1 se não entrou)
    self_late: boolean;                // o próprio pedido simulado atrasaria?
    newly_late: { order_number: string; deadline: string }[]; // pedidos que passaram a atrasar
    delta_late: number;                // variação no total de atrasos
    delta_weeks: number;               // variação no nº de semanas
    baseline: ScheduleResult;
    withNew: ScheduleResult;
}

const lateIds = (r: ScheduleResult) => {
    const s = new Set<string>();
    r.weeks.forEach(w => w.orders.forEach(o => { if (o.late) s.add(o.id); }));
    return s;
};

// Simula inserir um pedido e mede o impacto (atrasos, semanas, onde cai).
// As travas de atraso entram nas DUAS pontas: sem elas o baseline seria um
// plano que não existe, e o impacto medido sairia errado nos dois sentidos
// (pedido travado não ocupa a semana dele, mas ocupa uma mais à frente).
export function simulateInsertion(
    baseOrders: SchedOrder[],
    weeklyCapacity: number,
    startMondayISO: string,
    hypo: SchedOrder,
    travas: TravasAtraso = {},
): SimulationResult {
    const baseline = planSchedule(baseOrders, weeklyCapacity, startMondayISO, travas);
    const withNew = planSchedule([...baseOrders, hypo], weeklyCapacity, startMondayISO, travas);

    const baseLate = lateIds(baseline);
    const newly_late: { order_number: string; deadline: string }[] = [];
    let placed = -1;
    let selfLate = false;
    withNew.weeks.forEach(w => w.orders.forEach(o => {
        if (o.id === hypo.id) { placed = w.week_index; selfLate = o.late; return; }
        if (o.late && !baseLate.has(o.id)) newly_late.push({ order_number: o.order_number, deadline: o.deadline });
    }));

    return {
        placed_week_index: placed,
        self_late: selfLate,
        newly_late,
        delta_late: withNew.late_count - baseline.late_count,
        delta_weeks: withNew.weeks.length - baseline.weeks.length,
        baseline, withNew,
    };
}

// Semana mínima em que o pedido pode entrar, dada a trava de atraso.
// Sem trava (ou trava já vencida) → 0, e o pedido concorre normalmente.
function semanaMinima(travaISO: string | undefined, startMondayISO: string): number {
    if (!travaISO) return 0;
    const semanas = Math.floor(diasEntre(startMondayISO, segundaDaSemana(travaISO)) / 7);
    return Math.max(0, semanas);
}

// Teto de segurança do laço de empacotamento: 5 anos de semanas. Uma trava com
// data absurda (erro de digitação em 2130) não pode travar o navegador.
const MAX_SEMANAS = 260;

export function planSchedule(
    orders: SchedOrder[],
    weeklyCapacity: number,
    startMondayISO: string,
    travas: TravasAtraso = {},
): ScheduleResult {
    const cap = weeklyCapacity > 0 ? weeklyCapacity : 350;

    // 1. Prioridade por prazo (empate: agrupa por setup para clusterizar).
    const byDeadline = [...orders].sort((a, b) =>
        a.deadline.localeCompare(b.deadline) ||
        (a.fabric || '').localeCompare(b.fabric || ''));

    const minSemana = new Map(byDeadline.map(o => [o.id, semanaMinima(travas[o.id], startMondayISO)]));

    // 3. Empacota em semanas; excedente vai para a próxima. Pedido travado é
    //    PULADO sem fechar a semana — ele não ocupa capacidade agora, então
    //    quem vem depois dele pode subir e preencher o lugar.
    const weeksRaw: { wi: number; orders: SchedOrder[] }[] = [];
    let pool = byDeadline;
    let wi = 0;

    while (pool.length > 0 && wi < MAX_SEMANAS) {
        const current: SchedOrder[] = [];
        const resto: SchedOrder[] = [];
        let used = 0;

        for (let idx = 0; idx < pool.length; idx++) {
            const o = pool[idx];
            if ((minSemana.get(o.id) ?? 0) > wi) { resto.push(o); continue; }
            // Estourou a capacidade: fecha a semana aqui. Tudo que vem depois
            // espera a próxima — não sai pescando pedido menor que caiba, senão
            // a prioridade por prazo (regra 1) seria furada.
            if (current.length > 0 && used + o.pieces > cap) { resto.push(...pool.slice(idx)); break; }
            current.push(o);
            used += o.pieces;
        }

        if (current.length > 0) weeksRaw.push({ wi, orders: current });
        pool = resto;
        wi++;
    }

    // 2. Dentro de cada semana, sequencia por agrupamento; monta o resultado.
    const weeks: ScheduleWeek[] = [];
    const groupedFullSeq: SchedOrder[] = [];
    let lateCount = 0;

    weeksRaw.forEach(({ wi: weekIndex, orders: wOrders }) => {
        const weekStart = addDaysISO(startMondayISO, weekIndex * 7);
        const weekEnd = addDaysISO(weekStart, 6);
        const sequenced = groupBySetup(wOrders);
        const usedPieces = wOrders.reduce((s, o) => s + o.pieces, 0);

        const scheduled: ScheduledOrder[] = sequenced.map((o, si) => {
            const late = o.deadline < weekEnd; // fim da semana passa do prazo
            if (late) lateCount++;
            return {
                ...o, week_index: weekIndex, week_start: weekStart,
                sequence_index: si, planned_end: weekEnd, late,
                blocked_until: travas[o.id],
            };
        });
        groupedFullSeq.push(...scheduled);

        weeks.push({
            week_index: weekIndex, week_start: weekStart, orders: scheduled,
            used_pieces: usedPieces, capacity: cap,
            occupancy_pct: round1((usedPieces / cap) * 100),
            overloaded: usedPieces > cap,
        });
    });

    const setupGrouped = countSetupChanges(groupedFullSeq);
    const setupUngrouped = countSetupChanges(byDeadline);

    return {
        weeks,
        late_count: lateCount,
        setup_changes: setupGrouped,
        setup_changes_ungrouped: setupUngrouped,
        setup_saved: Math.max(0, setupUngrouped - setupGrouped),
    };
}
