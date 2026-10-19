/**
 * "Fecha o mês com": o livre de hoje andando dia a dia até o fim do mês.
 *
 * Só entra conta liberada (aguardando entrega fica fora — decisão do Luiz: o
 * conservador). Conta vencida e não paga entra HOJE: é dinheiro esperado
 * agora, não no dia que já passou.
 */
import { centavos, somarDias, ultimoDiaDoMes } from './base.ts';
import type { ContaResumo } from './base.ts';
import { situacaoDaConta } from './situacao.ts';
import type { MovimentoPrevisto, PontoDoSaldo } from '../saudeDoCaixa.ts';
import { comportamentoPorCliente, preverRecebimentos } from '../previsaoRecebimento.ts';
import type { ObrigacaoParaPrevisao, PagamentoRealizado } from '../previsaoRecebimento.ts';

export interface PontoDaProjecao { data: string; saldo: number }
export interface Projecao { pontos: PontoDaProjecao[]; fechaCom: number; ate: string }

export function projecaoDoMes(e: { contas: ContaResumo[]; livreHoje: number; hoje: string }): Projecao {
    const ate = ultimoDiaDoMes(e.hoje);
    const porDia = new Map<string, number>();
    for (const c of e.contas) {
        const s = situacaoDaConta(c, e.hoje);
        if (s !== 'vencida' && s !== 'a_vencer') continue;
        if (c.due_date > ate) continue;
        const dia = c.due_date < e.hoje ? e.hoje : c.due_date;
        const sinal = c.type === 'receivable' ? 1 : -1;
        porDia.set(dia, (porDia.get(dia) ?? 0) + sinal * c.remaining_amount);
    }
    const pontos: PontoDaProjecao[] = [];
    let saldo = e.livreHoje;
    for (let dia = e.hoje; dia <= ate; dia = somarDias(dia, 1)) {
        saldo += porDia.get(dia) ?? 0;
        pontos.push({ data: dia, saldo: centavos(saldo) });
    }
    return { pontos, fechaCom: pontos[pontos.length - 1].saldo, ate };
}

// ── Projeção do caixa (aba Saúde do caixa + aviso do Início, spec S5 §2–3) ──
// Uma conta só para os dois; antes ela morava dentro do useSaudeDoCaixa.

export type ObrigacaoParaProjecao = ObrigacaoParaPrevisao & {
    type: string;
    derived_status?: string | null;
    cancelled_at?: string | null;
    remaining_amount?: number | null;
    original_amount?: number | null;
    description?: string | null;
};

export function movimentosPrevistos(
    obrigacoes: ObrigacaoParaProjecao[],
    pagamentos: PagamentoRealizado[],
    inicio: string,
): MovimentoPrevisto[] {
    const emAberto = obrigacoes.filter(o =>
        o.derived_status !== 'paid' && o.derived_status !== 'cancelled' && !o.cancelled_at);
    const comportamento = comportamentoPorCliente(obrigacoes, pagamentos);
    const previsoes = new Map(preverRecebimentos(emAberto.filter(o => o.type === 'receivable'), comportamento)
        .map(p => [p.obligation_id, p]));
    return emAberto.map(o => {
        const entra = o.type === 'receivable';
        const prev = entra ? previsoes.get(o.id) : undefined;
        const data = (prev?.dataProvavel || o.due_date || inicio).slice(0, 10);
        return {
            // Conta vencida e em aberto move no mínimo hoje: no passado sumiria da projeção.
            data: data < inicio ? inicio : data,
            valor: Number(o.remaining_amount ?? o.original_amount) || 0,
            entra,
            descricao: o.description || undefined,
        };
    }).filter(m => m.valor > 0);
}

export function primeiroDiaNegativo(pontos: PontoDoSaldo[]): { data: string; saldo: number } | null {
    const p = pontos.find(x => x.saldo < 0);
    return p ? { data: p.data, saldo: p.saldo } : null;
}
