/**
 * Caixinhas: a sugestão que aparece no "Recebi", o progresso da meta e o
 * banco que a baixa propõe.
 */
import { centavos } from './base.ts';
import type { ContaResumo, PagamentoResumo } from './base.ts';

export interface CaixinhaResumo {
    id: string;
    name: string;
    balance: number;
    target_amount?: number | null;
    auto_fund_pct?: number | null;
    is_archived?: boolean | null;
}

export interface SugestaoDeCaixinha { caixinhaId: string; nome: string; percentual: number; valor: number }

export function sugestoesDeCaixinha(valorRecebido: number, caixinhas: CaixinhaResumo[]): SugestaoDeCaixinha[] {
    if (!(valorRecebido > 0)) return [];
    return caixinhas
        .filter(c => !c.is_archived && (Number(c.auto_fund_pct) || 0) > 0)
        .map(c => {
            const percentual = Number(c.auto_fund_pct);
            return { caixinhaId: c.id, nome: c.name, percentual, valor: centavos((valorRecebido * percentual) / 100) };
        })
        .filter(s => s.valor > 0);
}

export function progressoDaMeta(c: CaixinhaResumo): { percentual: number; meta: number } | null {
    const meta = Number(c.target_amount) || 0;
    if (meta <= 0) return null;
    return { meta, percentual: Math.min(100, Math.round((c.balance / meta) * 100)) };
}

/** O banco do pagamento mais recente do mesmo tipo; sem histórico, o primeiro ativo. */
export function bancoSugerido(e: {
    pagamentos: PagamentoResumo[]; contas: ContaResumo[]; tipo: 'receivable' | 'payable'; bancosAtivos: Array<{ id: string }>;
}): string | null {
    const ativos = new Set(e.bancosAtivos.map(b => b.id));
    const tipoDaConta = new Map(e.contas.map(c => [c.id, c.type]));
    const recentes = [...e.pagamentos].sort((a, b) =>
        b.payment_date.localeCompare(a.payment_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    for (const p of recentes) {
        if (p.reversal_of || !p.account_id || !ativos.has(p.account_id)) continue;
        if (tipoDaConta.get(p.obligation_id) === e.tipo) return p.account_id;
    }
    return e.bancosAtivos[0]?.id ?? null;
}
