/**
 * "Clientes que devem": um cliente por linha. "Em produção" é informativo —
 * parcela de pedido não entregue não é atraso nem cobrança.
 */
import { centavos } from './base.ts';
import type { ContaResumo } from './base.ts';
import { diasDeAtraso, situacaoDaConta } from './situacao.ts';

export interface LinhaDoCliente {
    clienteId: string;
    vencido: number;
    aVencer: number;
    emProducao: number;
    /** Parcelas abertas contadas em vencido + a vencer (as em produção não entram). */
    quantidade: number;
    diasDoMaisAntigo: number | null;
    vencidas: ContaResumo[];
}

export function clientesQueDevem<T extends ContaResumo>(contas: T[], hoje: string): LinhaDoCliente[] {
    const porCliente = new Map<string, LinhaDoCliente>();
    for (const c of contas) {
        if (c.type !== 'receivable' || !c.client_id) continue;
        const s = situacaoDaConta(c, hoje);
        if (s === 'paga' || s === 'cancelada') continue;
        const l = porCliente.get(c.client_id)
            ?? { clienteId: c.client_id, vencido: 0, aVencer: 0, emProducao: 0, quantidade: 0, diasDoMaisAntigo: null, vencidas: [] };
        if (s === 'vencida') {
            l.vencido += c.remaining_amount;
            l.quantidade++;
            l.vencidas.push(c);
            l.diasDoMaisAntigo = Math.max(l.diasDoMaisAntigo ?? 0, diasDeAtraso(c, hoje));
        } else if (s === 'a_vencer') {
            l.aVencer += c.remaining_amount;
            l.quantidade++;
        } else {
            l.emProducao += c.remaining_amount;
        }
        porCliente.set(c.client_id, l);
    }
    return [...porCliente.values()]
        .map(l => ({ ...l, vencido: centavos(l.vencido), aVencer: centavos(l.aVencer), emProducao: centavos(l.emProducao) }))
        .sort((a, b) => (b.diasDoMaisAntigo ?? -1) - (a.diasDoMaisAntigo ?? -1) || b.aVencer - a.aVencer);
}

/**
 * As parcelas que dá para receber hoje: em aberto e já valendo. Pedido ainda
 * na fábrica (aguardando entrega) fica de fora — não é cobrança. Mais antiga primeiro.
 */
export function parcelasParaReceber<T extends ContaResumo>(contas: T[], clienteId: string, hoje: string): T[] {
    return contas
        .filter(c => c.type === 'receivable' && c.client_id === clienteId
            && ['vencida', 'a_vencer'].includes(situacaoDaConta(c, hoje)))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
}
