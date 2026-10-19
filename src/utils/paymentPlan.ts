// Utilitário de plano de pagamento (Fase 3/5).
// Semeia parcelas a partir da condição do cliente; tudo editável depois.

export interface PlanInstallment {
    label: string;
    amount: number;
    due: string; // ISO date YYYY-MM-DD
    method?: string; // meio de pagamento previsto (ex.: 'Boleto', 'PIX')
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function addDaysISO(iso: string, days: number): string {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

/** Divide `total` em `n` parcelas de centavos exatos (a última absorve a sobra). */
function splitEven(total: number, n: number): number[] {
    const base = round2(total / n);
    const parts = Array(n).fill(base);
    parts[n - 1] = round2(total - base * (n - 1));
    return parts;
}

/**
 * Gera um plano inicial. Nunca "trava" nada — é só uma sugestão editável.
 * @param terms  default_payment_terms do cliente ('a_vista' | '50_50' | '30' | '30_60' | '30_60_90')
 * @param downPayment sinal previsto do orçamento (usado no fallback sem condição)
 */
export function seedPlanFromTerms(opts: {
    terms?: string;
    total: number;
    downPayment?: number;
    today: string;
    deliveryDate: string;
    method?: string; // meio de pagamento default das parcelas (default: PIX)
}): PlanInstallment[] {
    const { terms, total, downPayment = 0, today, deliveryDate, method = 'PIX' } = opts;
    const m = method;

    switch (terms) {
        case 'a_vista':
            return [{ label: 'À vista', amount: round2(total), due: deliveryDate, method: m }];

        case '50_50': {
            const [a, b] = splitEven(total, 2);
            return [
                { label: 'Entrada (50%)', amount: a, due: today, method: m },
                { label: 'Saldo na entrega', amount: b, due: deliveryDate, method: m },
            ];
        }

        case '30':
            return [{ label: '30 dias', amount: round2(total), due: addDaysISO(today, 30), method: m }];

        case '30_60': {
            const [a, b] = splitEven(total, 2);
            return [
                { label: 'Parcela 1 (30d)', amount: a, due: addDaysISO(today, 30), method: m },
                { label: 'Parcela 2 (60d)', amount: b, due: addDaysISO(today, 60), method: m },
            ];
        }

        case '30_60_90': {
            const [a, b, c] = splitEven(total, 3);
            return [
                { label: 'Parcela 1 (30d)', amount: a, due: addDaysISO(today, 30), method: m },
                { label: 'Parcela 2 (60d)', amount: b, due: addDaysISO(today, 60), method: m },
                { label: 'Parcela 3 (90d)', amount: c, due: addDaysISO(today, 90), method: m },
            ];
        }

        default: {
            // Sem condição: se houver sinal do orçamento usa-o; senão, default 50/50.
            const entrada = downPayment > 0 && downPayment < total ? round2(downPayment) : round2(total / 2);
            return [
                { label: 'Entrada (50%)', amount: entrada, due: today, method: m },
                { label: 'Saldo na entrega', amount: round2(total - entrada), due: deliveryDate, method: m },
            ];
        }
    }
}

export const planTotal = (plan: PlanInstallment[]) =>
    round2(plan.reduce((s, p) => s + (Number(p.amount) || 0), 0));

const centavos = (n: number) => Math.round((Number(n) || 0) * 100);

/**
 * Qual modelo de condição o plano é, ou '' (Personalizado).
 *
 * Gera o plano de cada modelo com os mesmos dados e compara: mesma quantidade,
 * mesmos valores em centavos e, em cada parcela, o mesmo rótulo OU o mesmo
 * vencimento (o rótulo sobrevive quando a data foi gerada em outro dia, como o
 * orçamento que vira pedido; a data cobre o rótulo renomeado à mão). Meio de
 * pagamento não conta: trocar PIX por Boleto não muda a condição.
 */
export function termoDoPlano(
    plan: PlanInstallment[],
    dados: Omit<Parameters<typeof seedPlanFromTerms>[0], 'terms'>,
    termos: string[],
): string {
    return termos.find(t => {
        const modelo = seedPlanFromTerms({ ...dados, terms: t });
        return modelo.length === plan.length && modelo.every((m, i) =>
            centavos(m.amount) === centavos(plan[i].amount) && (m.label === plan[i].label || m.due === plan[i].due));
    }) ?? '';
}
