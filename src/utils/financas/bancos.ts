/**
 * Situação de cada banco ativo: saldo do sistema e as contas com pagamento
 * naquele banco que ainda não foram conferidas com o extrato. Só conta quitada
 * (paid) entra: conferir uma parcial deixaria o próximo pagamento invisível,
 * pois nada zera is_reconciled quando chega pagamento novo. A conferência é
 * por CONTA (financial_obligations.is_reconciled), não por pagamento.
 */
import type { ContaResumo } from './base.ts';

export interface BancoResumo { id: string; name: string; current_balance: number; is_active: boolean }
export interface SituacaoDoBanco { id: string; nome: string; saldo: number; aConferir: string[] }

export function situacaoDosBancos(e: {
    bancos: BancoResumo[]; contas: ContaResumo[]; contasPorObrigacao: Record<string, string[]>;
}): SituacaoDoBanco[] {
    const pendentes = e.contas.filter(c =>
        c.derived_status === 'paid' && !c.is_reconciled);
    return e.bancos.filter(b => b.is_active).map(b => ({
        id: b.id,
        nome: b.name,
        saldo: Number(b.current_balance) || 0,
        aConferir: pendentes.filter(c => (e.contasPorObrigacao[c.id] ?? []).includes(b.id)).map(c => c.id),
    }));
}
