/**
 * Vendas do mês: o que foi ENTREGUE no mês, pela data da entrega.
 * "Recebido antecipado" é a foto de hoje: o que já entrou de pedidos que ainda
 * não saíram da fábrica (entrada, sinal). Não é lucro de ninguém ainda.
 */
import { centavos } from './base.ts';
import type { ContaResumo } from './base.ts';

export interface PedidoResumo {
    id: string;
    status: string;
    delivered_at?: string | null;
    total_amount: number;
    items?: Array<{ quantity?: number | string | null }> | null;
}

export interface VendasDoMes { pedidos: number; pecas: number; vendido: number; recebidoAntecipado: number }

export function vendasDoPeriodo(e: { pedidos: PedidoResumo[]; contas: ContaResumo[]; meses: string[] }): VendasDoMes {
    const entregues = e.pedidos.filter(p => p.status === 'Entregue' && e.meses.includes((p.delivered_at ?? '').slice(0, 7)));
    const pecas = entregues.reduce(
        (s, p) => s + (p.items ?? []).reduce((t, i) => t + (Number(i.quantity) || 0), 0), 0);
    const antecipado = e.contas
        .filter(c => c.type === 'receivable' && (c.pedido_em_aberto ?? c.awaiting_delivery) && c.derived_status !== 'cancelled')
        .reduce((s, c) => s + (c.original_amount - c.remaining_amount), 0);
    return {
        pedidos: entregues.length,
        pecas,
        vendido: centavos(entregues.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)),
        recebidoAntecipado: centavos(antecipado),
    };
}
