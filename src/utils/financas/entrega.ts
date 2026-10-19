/**
 * As parcelas na hora de confirmar a entrega.
 *
 * `revise_order_plan` cancela e recria só as parcelas SEM pagamento ativo; a que
 * tem qualquer pagamento é preservada com o valor original. Por isso essas são
 * "fixas" aqui, e a soma que tem de fechar com o pedido é
 * Σ original das fixas + Σ editáveis = total do pedido.
 */
import { centavos, reais } from './base.ts';
import type { ContaResumo } from './base.ts';

export interface ParcelaEditavel { label: string; amount: number; due: string; method: string }

export function separarParcelas<T extends ContaResumo>(contas: T[]): { fixas: T[]; abertas: T[] } {
    const ativas = contas
        .filter(c => c.type === 'receivable' && c.derived_status !== 'cancelled')
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const temPagamento = (c: T) => (c.payment_count ?? 0) > 0;
    return { fixas: ativas.filter(temPagamento), abertas: ativas.filter(c => !temPagamento(c)) };
}

const somaOriginal = (contas: ContaResumo[]) => contas.reduce((s, c) => s + c.original_amount, 0);

export function planoInicial(e: {
    abertas: ContaResumo[]; fixas: ContaResumo[]; totalDoPedido: number; prazo: string;
}): ParcelaEditavel[] {
    if (e.abertas.length > 0) {
        return e.abertas.map((c, i) => ({
            label: `Parcela ${c.installment_no ?? i + 1}`,
            amount: centavos(c.original_amount),
            due: c.due_date,
            method: c.planned_method || 'PIX',
        }));
    }
    const falta = centavos(e.totalDoPedido - somaOriginal(e.fixas));
    return falta >= 0.01 ? [{ label: 'Parcela única', amount: falta, due: e.prazo, method: 'PIX' }] : [];
}

export interface ConferenciaDaEntrega { soma: number; diferenca: number; confere: boolean; problema: string | null }

export function conferirEntrega(e: {
    totalDoPedido: number; fixas: ContaResumo[]; editaveis: ParcelaEditavel[];
}): ConferenciaDaEntrega {
    const soma = centavos(somaOriginal(e.fixas) + e.editaveis.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const diferenca = centavos(e.totalDoPedido - soma);
    const semValor = e.editaveis.findIndex(p => !(Number(p.amount) > 0));
    const semData = e.editaveis.findIndex(p => !p.due);
    let problema: string | null = null;
    if (semValor >= 0) problema = `Parcela ${semValor + 1} sem valor`;
    else if (semData >= 0) problema = `Parcela ${semData + 1} sem vencimento`;
    else if (Math.abs(diferenca) >= 0.01) problema = diferenca > 0 ? `Faltam ${reais(diferenca)}` : `Sobram ${reais(-diferenca)}`;
    return { soma, diferenca, confere: problema === null, problema };
}

export function planoMudou(abertas: ContaResumo[], editaveis: ParcelaEditavel[]): boolean {
    if (abertas.length !== editaveis.length) return true;
    return abertas.some((c, i) => {
        const p = editaveis[i];
        return centavos(c.original_amount) !== centavos(p.amount)
            || c.due_date !== p.due
            || (c.planned_method || 'PIX') !== p.method;
    });
}
