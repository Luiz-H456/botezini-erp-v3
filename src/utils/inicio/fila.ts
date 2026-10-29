/**
 * A fila do Início: o que precisa do Luiz, agrupado por objetivo.
 * Pura — os dados chegam prontos (ver useFilaDoInicio). Spec: navegação por objetivos, seção 4.
 */
import { pedidosAtrasados } from '../alertasOperacionais.ts';
import type { PedidoParaAlerta } from '../alertasOperacionais.ts';
import { somarDias } from '../financas/base.ts';
import { filaDeFollowUp } from '../acompanhamentoComercial.ts';
import type { OrcamentoEnviado } from '../acompanhamentoComercial.ts';

export type ObjetivoDaFila = 'vender' | 'producao' | 'planejar' | 'dinheiro' | 'cadastros';

export type DestinoDaFila =
    | { view: 'budgets'; status: 'Sent' | 'Approved' }
    | { view: 'quadro'; destaque: 'atrasados' | 'ultimo-setor' }
    | { view: 'compras'; filtro: 'this_week' }
    | { view: 'receivables' }
    | { view: 'finance'; recorte: 'pagar_vencido' }
    | { view: 'finance'; conferirBanco: string }
    | { view: 'finance' }
    | { view: 'bancos' }
    | { view: 'saude-caixa'; mes: string }
    | { view: 'clientes'; dormentes: true }
    | { view: 'produtos'; completude: true }
    | { view: 'inventory' };

export interface LinhaDaFila {
    id: string;
    objetivo: ObjetivoDaFila;
    acao: string;
    texto: string;
    quantidade: number;
    urgente: boolean;
    destino: DestinoDaFila;
    /** O que distingue a situação além da quantidade (ver inicio/ignorados.ts). Ex.: a data do caixa negativo. */
    assinatura?: string;
}

export interface BlocoDaFila { objetivo: ObjetivoDaFila; rotulo: string; linhas: LinhaDaFila[] }

export interface PedidoDaFila extends PedidoParaAlerta { production_stage?: string | null }

export interface EntradaDaFila {
    hoje: string;
    orcamentos: OrcamentoEnviado[];
    pedidos: PedidoDaFila[];
    ultimoSetor: string | null;
    /** Insumos em falta para os pedidos ativos desta semana (Lista de compras); null = não deu para calcular → sem linha. */
    faltaComprarNaSemana: number | null;
    clientesComVencido: number;
    pagarVencido: { quantidade: number; total: number };
    bancosAConferir: { id: string; nome: string; quantidade: number }[];
    /** De conferirSaldos (ver useFilaDoInicio); dado incompleto chega como 0. */
    saldosDivergentes: number;
    saldosSemLinhaDeBase: number;
    /** clientesDormentes(...).length */
    clientesSumidos: number;
    /** produtosSemFichaQueVenderam(completudeDosDados(...)) */
    produtosSemFicha: number;
    /** tecidosSemPrecoUsados(...).length; null/ausente = não deu para calcular → sem linha. */
    tecidosSemPreco?: number | null;
    /** Primeiro dia com saldo projetado negativo nos próximos 30 dias; null = nenhum ou dado indisponível. */
    caixaNegativoEm: { data: string; saldo: number } | null;
    dinheiro: (v: number) => string;
}

const ORDEM: { objetivo: ObjetivoDaFila; rotulo: string }[] = [
    { objetivo: 'vender', rotulo: 'Vender' },
    { objetivo: 'producao', rotulo: 'Como está a produção' },
    { objetivo: 'planejar', rotulo: 'Planejar a semana' },
    { objetivo: 'dinheiro', rotulo: 'Dinheiro' },
    { objetivo: 'cadastros', rotulo: 'Cadastros' },
];

const ATIVOS = new Set(['Pendente', 'Em Produção']);
const s = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

/** Segunda a domingo (YYYY-MM-DD) da semana que contém `hoje` — a mesma do filtro "esta semana" da Lista de compras. */
export function semanaDe(hoje: string): { inicio: string; fim: string } {
    const dow = (new Date(hoje + 'T12:00:00').getDay() + 6) % 7; // 0 = segunda
    const inicio = somarDias(hoje, -dow);
    return { inicio, fim: somarDias(inicio, 6) };
}

export const pedidosEmProducao = (pedidos: PedidoParaAlerta[]): number =>
    pedidos.filter(p => ATIVOS.has((p.status || '').trim())).length;

export function montarFila(e: EntradaDaFila): BlocoDaFila[] {
    const linhas: LinhaDaFila[] = [];
    // Id estável, sem depender da ordem; duas linhas iguais (ex.: dois bancos) desempatam pelo destino.
    const add = (l: Omit<LinhaDaFila, 'id'>) => {
        if (l.quantidade <= 0) return;
        const base = `${l.objetivo}-${l.acao}-${l.destino.view}`;
        linhas.push({ ...l, id: linhas.some(x => x.id === base) ? `${base}-${JSON.stringify(l.destino)}` : base });
    };

    // A mesma lista que a FilaDeFollowUp mostra no destino, sem os 'recente'.
    const parados = filaDeFollowUp(e.orcamentos, e.hoje).filter(i => i.urgencia !== 'recente').length;
    add({ objetivo: 'vender', acao: 'Retomar', quantidade: parados, urgente: false,
        texto: `Retomar ${s(parados, 'orçamento parado', 'orçamentos parados')}`, destino: { view: 'budgets', status: 'Sent' } });
    const aprovados = e.orcamentos.filter(o => (o.status || '').trim() === 'Approved').length;
    add({ objetivo: 'vender', acao: 'Virar pedido', quantidade: aprovados, urgente: false,
        texto: `Virar pedido: ${s(aprovados, 'orçamento aprovado', 'orçamentos aprovados')}`, destino: { view: 'budgets', status: 'Approved' } });
    add({ objetivo: 'vender', acao: 'Retomar', quantidade: e.clientesSumidos, urgente: false,
        texto: `Retomar ${s(e.clientesSumidos, 'cliente sumido', 'clientes sumidos')}`,
        destino: { view: 'clientes', dormentes: true } });

    const atrasados = pedidosAtrasados(e.pedidos, e.hoje).length;
    add({ objetivo: 'producao', acao: 'Destravar', quantidade: atrasados, urgente: true,
        texto: `Destravar ${s(atrasados, 'pedido', 'pedidos')} com prazo estourado`, destino: { view: 'quadro', destaque: 'atrasados' } });
    const ultimo = (e.ultimoSetor ?? '').trim();
    const noUltimo = ultimo
        ? e.pedidos.filter(p => ATIVOS.has((p.status || '').trim()) && (p.production_stage ?? '').trim() === ultimo).length : 0;
    add({ objetivo: 'producao', acao: 'Confirmar entrega', quantidade: noUltimo, urgente: false,
        texto: `Confirmar entrega de ${s(noUltimo, 'pedido', 'pedidos')} no último setor`, destino: { view: 'quadro', destaque: 'ultimo-setor' } });

    const falta = e.faltaComprarNaSemana ?? 0;
    add({ objetivo: 'planejar', acao: 'Comprar', quantidade: falta, urgente: false,
        texto: `Comprar ${s(falta, 'insumo', 'insumos')} para os pedidos desta semana`, destino: { view: 'compras', filtro: 'this_week' } });

    if (e.caixaNegativoEm) {
        const [, m, d] = e.caixaNegativoEm.data.split('-');
        add({ objetivo: 'dinheiro', acao: 'Ver projeção', quantidade: 1, urgente: true, assinatura: e.caixaNegativoEm.data,
            texto: `Caixa fica negativo em ${d}/${m} (${e.dinheiro(e.caixaNegativoEm.saldo)})`,
            destino: { view: 'saude-caixa', mes: e.caixaNegativoEm.data.slice(0, 7) } });
    }
    add({ objetivo: 'dinheiro', acao: 'Cobrar', quantidade: e.clientesComVencido, urgente: true,
        texto: `Cobrar ${s(e.clientesComVencido, 'cliente', 'clientes')} com vencido`, destino: { view: 'receivables' } });
    add({ objetivo: 'dinheiro', acao: 'Pagar', quantidade: e.pagarVencido.quantidade, urgente: true,
        texto: `Pagar ${s(e.pagarVencido.quantidade, 'conta vencida', 'contas vencidas')} · ${e.dinheiro(e.pagarVencido.total)}`,
        destino: { view: 'finance', recorte: 'pagar_vencido' } });
    for (const b of e.bancosAConferir) {
        add({ objetivo: 'dinheiro', acao: 'Conferir', quantidade: b.quantidade, urgente: false,
            texto: `Conferir ${b.nome}: ${s(b.quantidade, 'pagamento', 'pagamentos')}`, destino: { view: 'finance', conferirBanco: b.id } });
    }
    // Diz o que conferir, nunca "sincronizar": sincronizar apaga o saldo guardado.
    add({ objetivo: 'dinheiro', acao: 'Conferir', quantidade: e.saldosDivergentes, urgente: true,
        texto: `Conferir saldo: ${s(e.saldosDivergentes, 'conta não bate', 'contas não batem')}`, destino: { view: 'bancos' } });
    add({ objetivo: 'dinheiro', acao: 'Ajustar', quantidade: e.saldosSemLinhaDeBase, urgente: false,
        texto: `${s(e.saldosSemLinhaDeBase, 'conta', 'contas')} sem saldo de partida`, destino: { view: 'bancos' } });

    add({ objetivo: 'cadastros', acao: 'Cadastrar', quantidade: e.produtosSemFicha, urgente: false,
        texto: `Cadastrar ficha técnica: ${s(e.produtosSemFicha, 'produto', 'produtos')}`,
        destino: { view: 'produtos', completude: true } });
    // Sem preço, o material desses pedidos sai incompleto no lucro por pedido (sugestões, 17/10).
    const semPreco = e.tecidosSemPreco ?? 0;
    add({ objetivo: 'cadastros', acao: 'Definir preço', quantidade: semPreco, urgente: false,
        texto: `Definir preço: ${s(semPreco, 'tecido usado', 'tecidos usados')} em pedidos`,
        destino: { view: 'inventory' } });

    return ORDEM
        .map(({ objetivo, rotulo }) => ({
            objetivo, rotulo,
            // urgente primeiro; dentro de cada grupo, a ordem do desenho (sort estável)
            linhas: linhas.filter(l => l.objetivo === objetivo).sort((a, b) => Number(b.urgente) - Number(a.urgente)),
        }))
        .filter(b => b.linhas.length > 0);
}

export function contadoresDoMenu(blocos: BlocoDaFila[]): Record<ObjetivoDaFila, { n: number; urgente: boolean }> {
    const r = { vender: { n: 0, urgente: false }, producao: { n: 0, urgente: false },
        planejar: { n: 0, urgente: false }, dinheiro: { n: 0, urgente: false }, cadastros: { n: 0, urgente: false } };
    for (const b of blocos) r[b.objetivo] = { n: b.linhas.length, urgente: b.linhas.some(l => l.urgente) };
    return r;
}
