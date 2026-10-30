/**
 * A lista de Contas que está na tela, como planilha (auditoria de 29/10, N4) — para o contador ou
 * para conferir fora do app. Formato que o Excel em português abre direto: `;` entre colunas,
 * vírgula nos centavos, data dd/mm/aaaa e BOM para os acentos. Sem import do app.
 */
import type { ContaResumo } from './base.ts';
import { situacaoDaConta } from './situacao.ts';

const SITUACAO: Record<string, string> = {
    cancelada: 'Cancelada', paga: 'Paga', aguardando_entrega: 'Aguardando entrega', vencida: 'Vencida', a_vencer: 'A vencer',
};
const celula = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const valor = (n: number) => (Number(n) || 0).toFixed(2).replace('.', ',');
const data = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export function planilhaDeContas<T extends ContaResumo>(contas: T[], ctx: {
    nomeDaParte: (c: T) => string; nomeDaCategoria: (c: T) => string; hoje: string;
}): string {
    const linhas = [['Vencimento', 'Descrição', 'Quem', 'Categoria', 'Tipo', 'Valor', 'Falta', 'Situação']];
    for (const c of contas) {
        linhas.push([data(c.due_date), c.description, ctx.nomeDaParte(c), ctx.nomeDaCategoria(c),
            c.type === 'payable' ? 'A pagar' : 'A receber', valor(c.original_amount), valor(c.remaining_amount),
            SITUACAO[situacaoDaConta(c, ctx.hoje)] ?? '']);
    }
    return '﻿' + linhas.map(l => l.map(celula).join(';')).join('\r\n');
}
