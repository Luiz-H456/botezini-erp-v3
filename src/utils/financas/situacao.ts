/**
 * Em que situação uma conta está HOJE, do ponto de vista de quem usa a tela.
 *
 * O banco já tem `derived_status`, mas ele responde outra pergunta: chama de
 * `partial` a conta paga em parte, vencida ou não, e não sabe de entrega. Aqui
 * "vencida" é vencimento passado com saldo em aberto, e a receber de pedido não
 * entregue nunca vence — ainda não é cobrança.
 */
import { diasEntre } from './base.ts';
import type { ContaResumo } from './base.ts';

export type Situacao = 'cancelada' | 'paga' | 'aguardando_entrega' | 'vencida' | 'a_vencer';

export function situacaoDaConta(c: ContaResumo, hoje: string): Situacao {
    if (c.derived_status === 'cancelled') return 'cancelada';
    if (c.derived_status === 'paid' || c.remaining_amount <= 0) return 'paga';
    if (c.type === 'receivable' && c.awaiting_delivery) return 'aguardando_entrega';
    return c.due_date < hoje ? 'vencida' : 'a_vencer';
}

export const diasDeAtraso = (c: ContaResumo, hoje: string): number => Math.max(0, diasEntre(c.due_date, hoje));
