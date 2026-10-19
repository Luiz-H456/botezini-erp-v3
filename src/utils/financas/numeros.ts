/**
 * Os números do topo da Visão geral.
 *
 * Os quatro recortes são também o filtro da lista (lista.ts usa
 * `contaNoRecorte`). Um lugar só decide o que é "vencido" e "7 dias", então o
 * número e a lista nunca discordam.
 */
import { centavos, somarDias } from './base.ts';
import type { ContaResumo } from './base.ts';
import { situacaoDaConta } from './situacao.ts';

export type Recorte = 'receber_vencido' | 'receber_7_dias' | 'pagar_vencido' | 'pagar_7_dias';

export const RECORTES: Recorte[] = ['receber_vencido', 'receber_7_dias', 'pagar_vencido', 'pagar_7_dias'];

export const ROTULO_DO_RECORTE: Record<Recorte, string> = {
    receber_vencido: 'A receber · vencido',
    receber_7_dias: 'A receber · 7 dias',
    pagar_vencido: 'A pagar · vencido',
    pagar_7_dias: 'A pagar · 7 dias',
};

/** "7 dias" = de hoje até hoje + 6, sem o vencido. */
export function contaNoRecorte(c: ContaResumo, recorte: Recorte, hoje: string): boolean {
    const tipo = recorte.startsWith('receber') ? 'receivable' : 'payable';
    if (c.type !== tipo) return false;
    const s = situacaoDaConta(c, hoje);
    if (recorte.endsWith('vencido')) return s === 'vencida';
    return s === 'a_vencer' && c.due_date <= somarDias(hoje, 6);
}

export interface Soma { total: number; quantidade: number }

export interface NumerosDaVisaoGeral {
    nosBancos: number;
    nasCaixinhas: number;
    livre: number;
    recortes: Record<Recorte, Soma>;
    emProducao: Soma;
}

const somar = (contas: ContaResumo[]): Soma => ({
    total: centavos(contas.reduce((s, c) => s + c.remaining_amount, 0)),
    quantidade: contas.length,
});

export function numerosDaVisaoGeral(e: {
    contas: ContaResumo[]; nosBancos: number; nasCaixinhas: number; hoje: string;
}): NumerosDaVisaoGeral {
    const recortes = Object.fromEntries(
        RECORTES.map(r => [r, somar(e.contas.filter(c => contaNoRecorte(c, r, e.hoje)))]),
    ) as Record<Recorte, Soma>;
    return {
        nosBancos: centavos(e.nosBancos),
        nasCaixinhas: centavos(e.nasCaixinhas),
        livre: centavos(e.nosBancos - e.nasCaixinhas),
        recortes,
        emProducao: somar(e.contas.filter(c => situacaoDaConta(c, e.hoje) === 'aguardando_entrega')),
    };
}
