/**
 * Pagar (ou receber) várias contas de uma vez (auditoria de 29/10, R3): a folha de 9 salários
 * vencidos no mesmo dia era 9 vezes o mesmo fluxo. O lote não é uma operação nova no banco: cada
 * conta continua sendo baixada pela mesma função do pagamento individual, com o saldo inteiro dela,
 * e mantém o seu rastro e o seu estorno. Sem import do app.
 */
import { centavos } from './base.ts';
import type { ContaResumo } from './base.ts';

export interface Lote<T extends ContaResumo> {
    aptas: T[];
    ignoradas: { conta: T; motivo: string }[];
    total: number;
    /** 'misto' = a pagar e a receber selecionadas juntas: não dá para dar baixa num lote só. */
    tipo: 'payable' | 'receivable' | 'misto' | null;
}

export function montarLote<T extends ContaResumo>(contas: T[], selecionadas: ReadonlySet<string>): Lote<T> {
    const aptas: T[] = [];
    const ignoradas: Lote<T>['ignoradas'] = [];
    for (const conta of contas) {
        if (!selecionadas.has(conta.id)) continue;
        if (conta.derived_status === 'cancelled') ignoradas.push({ conta, motivo: 'cancelada' });
        else if (conta.derived_status === 'paid' || !(conta.remaining_amount > 0)) ignoradas.push({ conta, motivo: 'já paga' });
        else aptas.push(conta);
    }
    const tipos = new Set(aptas.map(a => a.type));
    return {
        aptas, ignoradas,
        total: centavos(aptas.reduce((s, a) => s + a.remaining_amount, 0)),
        tipo: tipos.size === 0 ? null : tipos.size > 1 ? 'misto' : [...tipos][0],
    };
}
