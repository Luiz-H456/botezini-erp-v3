/**
 * Em que situação uma conta está HOJE, do ponto de vista de quem usa a tela.
 *
 * O banco já tem `derived_status`, mas ele responde outra pergunta: chama de
 * `partial` a conta paga em parte, vencida ou não, e não sabe de entrega. Aqui
 * "vencida" é vencimento passado com saldo em aberto, e a receber de pedido não
 * entregue nunca vence — ainda não é cobrança.
 */
import { diasEntre, diaEMes } from './base.ts';
import type { ContaResumo } from './base.ts';

export type Situacao = 'cancelada' | 'paga' | 'aguardando_entrega' | 'vencida' | 'a_vencer';

export function situacaoDaConta(c: ContaResumo, hoje: string): Situacao {
    if (c.derived_status === 'cancelled') return 'cancelada';
    if (c.derived_status === 'paid' || c.remaining_amount <= 0) return 'paga';
    if (c.type === 'receivable' && c.awaiting_delivery) return 'aguardando_entrega';
    return c.due_date < hoje ? 'vencida' : 'a_vencer';
}

export const diasDeAtraso = (c: ContaResumo, hoje: string): number => Math.max(0, diasEntre(c.due_date, hoje));

/**
 * O vencimento como a linha da conta mostra: o relativo ("5 dia(s) de atraso", "em 2 dia(s)")
 * SEMPRE com a data original junto — sozinho, obrigava a contar no calendário (Luiz, 29/10).
 * Ano só quando não é o de hoje.
 */
export function quandoVence(c: ContaResumo, hoje: string): string {
    const data = c.due_date.slice(0, 4) === hoje.slice(0, 4) ? diaEMes(c.due_date) : `${diaEMes(c.due_date)}/${c.due_date.slice(0, 4)}`;
    if (situacaoDaConta(c, hoje) === 'vencida') return `${data} · ${diasDeAtraso(c, hoje)} dia(s) de atraso`;
    const faltam = diasEntre(hoje, c.due_date);
    if (faltam === 0) return `hoje · ${data}`;
    if (faltam > 0 && faltam <= 7) return `${data} · em ${faltam} dia(s)`;
    return data;
}
