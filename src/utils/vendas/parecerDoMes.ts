/**
 * Parecer das vendas do mês (Como estamos indo › Vendas).
 *
 * Quatro números do mês, cada um contra o mês anterior, e algumas frases tiradas
 * deles. Regra fixa, sem IA: a mesma pergunta dá sempre a mesma resposta.
 *
 *   Orçamentos   feitos no mês (data do orçamento) e quantos viraram pedido, em
 *                qualquer mês — pelo vínculo do pedido ou pelo status "Converted".
 *   Vendas       pedidos FECHADOS no mês: data de criação do pedido, no relógio de
 *                São Paulo (decisão do Luiz, 16/10). É o ritmo comercial.
 *   Entregas     pedidos ENTREGUES no mês: a mesma conta do Resultado (vendasDoPeriodo).
 *   Recebimentos o que entrou no caixa no mês: a mesma conta do Resultado (caixaDoPeriodo).
 *
 * O "a receber vencido" é a foto de HOJE (a mesma do Início), por isso só entra no
 * parecer do mês corrente. Valores saem pelo `dinheiro` recebido, para o modo que
 * oculta valores continuar valendo dentro das frases.
 */
import { centavos, mesAnterior, mesDe, nomeDoMes } from '../financas/base.ts';
import type { ContaResumo, PagamentoResumo } from '../financas/base.ts';
import { caixaDoPeriodo, variacao } from '../financas/caixa.ts';
import { vendasDoPeriodo } from '../financas/vendas.ts';
import { contaNoRecorte } from '../financas/numeros.ts';
import { clientesQueDevem } from '../financas/clientes.ts';
import { numero } from '../numeros.ts';

export interface OrcamentoDoParecer { id: string; date: string; total_amount: number; status: string }
export interface PedidoDoParecer {
    id: string;
    budget_id?: string | null;
    created_at?: string | null;
    status: string;
    total_amount: number;
    delivered_at?: string | null;
    items?: Array<{ quantity?: number | string | null }> | null;
}

export interface NumerosDeOrcamento { quantidade: number; valor: number; viraramPedido: number }
export interface NumerosDeVenda { quantidade: number; valor: number; pecas: number }
export interface NumerosDeEntrega { quantidade: number; valor: number }
export interface Bloco<T> { atual: T; anterior: T; variacao: number | null }
export interface Frase { texto: string; alerta: boolean }

export interface ParecerDoMes {
    mes: string;
    mesAnterior: string;
    orcamentos: Bloco<NumerosDeOrcamento>;
    vendas: Bloco<NumerosDeVenda>;
    entregas: Bloco<NumerosDeEntrega>;
    recebimentos: Bloco<number>;
    frases: Frase[];
}

const FMT_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });

/** AAAA-MM no relógio de São Paulo. Dia puro (AAAA-MM-DD) não tem fuso: é o próprio mês. */
export function mesEmSaoPaulo(data: string | null | undefined): string {
    if (!data) return '';
    if (!data.includes('T')) return data.slice(0, 7);
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return '';
    return FMT_SP.format(d).slice(0, 7);
}

const pecasDe = (p: PedidoDoParecer) => (p.items ?? []).reduce((t, i) => t + (Number(i.quantity) || 0), 0);
const nomeCurto = (mes: string) => nomeDoMes(mes).split(' ')[0];
const plural = (n: number, um: string, varios: string) => `${numero(n, 0)} ${n === 1 ? um : varios}`;

function orcamentosDoMes(e: { orcamentos: OrcamentoDoParecer[]; pedidos: PedidoDoParecer[] }, mes: string): NumerosDeOrcamento {
    const comPedido = new Set(e.pedidos.map(p => p.budget_id).filter(Boolean));
    const doMes = e.orcamentos.filter(o => mesDe(o.date ?? '') === mes);
    return {
        quantidade: doMes.length,
        valor: centavos(doMes.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)),
        viraramPedido: doMes.filter(o => o.status === 'Converted' || comPedido.has(o.id)).length,
    };
}

function vendasDoMes(pedidos: PedidoDoParecer[], mes: string): NumerosDeVenda {
    const doMes = pedidos.filter(p => mesEmSaoPaulo(p.created_at) === mes);
    return {
        quantidade: doMes.length,
        valor: centavos(doMes.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)),
        pecas: doMes.reduce((s, p) => s + pecasDe(p), 0),
    };
}

/** Frase de comparação com o mês anterior; queda é alerta. */
function comparacao(v: number | null, mesAnt: string): { texto: string; alerta: boolean } {
    if (v === null) return { texto: '', alerta: false };
    if (v === 0) return { texto: `, igual a ${mesAnt}`, alerta: false };
    const pct = numero(Math.abs(Math.round(v)), 0);
    return v > 0
        ? { texto: `, ${pct}% a mais que ${mesAnt}`, alerta: false }
        : { texto: `, ${pct}% a menos que ${mesAnt}`, alerta: true };
}

export function parecerDoMes(e: {
    mes: string;
    hoje: string;
    orcamentos: OrcamentoDoParecer[];
    pedidos: PedidoDoParecer[];
    contas: ContaResumo[];
    pagamentos: PagamentoResumo[];
    dinheiro: (n: number) => string;
}): ParecerDoMes {
    const ant = mesAnterior(e.mes);
    const entregasDe = (m: string): NumerosDeEntrega => {
        const v = vendasDoPeriodo({ pedidos: e.pedidos.map(p => ({ ...p, total_amount: Number(p.total_amount) || 0 })), contas: [], meses: [m] });
        return { quantidade: v.pedidos, valor: v.vendido };
    };
    const recebidoEm = (m: string) => caixaDoPeriodo({ pagamentos: e.pagamentos, contas: e.contas, categorias: [], meses: [m] }).entrou;

    const orc = { atual: orcamentosDoMes(e, e.mes), anterior: orcamentosDoMes(e, ant) };
    const ven = { atual: vendasDoMes(e.pedidos, e.mes), anterior: vendasDoMes(e.pedidos, ant) };
    const ent = { atual: entregasDe(e.mes), anterior: entregasDe(ant) };
    const rec = { atual: recebidoEm(e.mes), anterior: recebidoEm(ant) };

    const parecer: ParecerDoMes = {
        mes: e.mes,
        mesAnterior: ant,
        orcamentos: { ...orc, variacao: variacao(orc.atual.valor, orc.anterior.valor) },
        vendas: { ...ven, variacao: variacao(ven.atual.valor, ven.anterior.valor) },
        entregas: { ...ent, variacao: variacao(ent.atual.valor, ent.anterior.valor) },
        recebimentos: { ...rec, variacao: variacao(rec.atual, rec.anterior) },
        frases: [],
    };

    const nome = nomeCurto(e.mes);
    const nomeAnt = nomeCurto(ant);
    const frases: Frase[] = [];

    // A receber vencido: foto de hoje, só no mês corrente.
    const ehMesCorrente = e.mes === mesDe(e.hoje);
    const vencidas = ehMesCorrente ? e.contas.filter(c => contaNoRecorte(c, 'receber_vencido', e.hoje)) : [];
    const totalVencido = centavos(vencidas.reduce((s, c) => s + c.remaining_amount, 0));

    // Mês todo zerado só vira "nenhum movimento" se o anterior também não vendeu:
    // senão a queda (vendia, parou) é justamente o que o parecer precisa dizer.
    const semMovimento = orc.atual.quantidade === 0 && ven.atual.quantidade === 0
        && ent.atual.quantidade === 0 && rec.atual === 0 && ven.anterior.quantidade === 0;
    if (semMovimento && totalVencido === 0) {
        parecer.frases = [{ texto: `Nenhum movimento de vendas em ${nome}.`, alerta: false }];
        return parecer;
    }

    if (ven.atual.quantidade > 0) {
        const c = comparacao(parecer.vendas.variacao, nomeAnt);
        frases.push({ texto: `Vendeu ${e.dinheiro(ven.atual.valor)} em ${plural(ven.atual.quantidade, 'pedido', 'pedidos')}${c.texto}.`, alerta: c.alerta });
    } else {
        const tinha = ven.anterior.quantidade > 0;
        frases.push({
            texto: `Nenhum pedido fechado em ${nome}${tinha ? ` (${nomeAnt}: ${e.dinheiro(ven.anterior.valor)})` : ''}.`,
            alerta: tinha,
        });
    }

    if (orc.atual.quantidade > 0) {
        const pct = numero(Math.round((orc.atual.viraramPedido / orc.atual.quantidade) * 100), 0);
        const virou = orc.atual.viraramPedido === 1 ? 'virou pedido' : 'viraram pedido';
        frases.push({ texto: `De ${plural(orc.atual.quantidade, 'orçamento', 'orçamentos')}, ${numero(orc.atual.viraramPedido, 0)} ${virou} (${pct}%).`, alerta: false });
    } else {
        frases.push({ texto: `Nenhum orçamento feito em ${nome}.`, alerta: true });
    }

    if (ent.atual.valor > 0 || rec.atual > 0) {
        frases.push({ texto: `Entregou ${e.dinheiro(ent.atual.valor)} e recebeu ${e.dinheiro(rec.atual)}.`, alerta: false });
    }

    if (totalVencido > 0) {
        // Mesmas contas do Início: total pelo recorte, clientes pelo clientesQueDevem (só conta com cliente).
        const clientes = clientesQueDevem(e.contas, e.hoje).filter(l => l.vencido > 0).length;
        const cobrar = clientes > 0 ? `; ${plural(clientes, 'cliente', 'clientes')} para cobrar` : '';
        frases.push({ texto: `Hoje há ${e.dinheiro(totalVencido)} a receber vencidos${cobrar}.`, alerta: true });
    }

    parecer.frases = frases;
    return parecer;
}
