/**
 * A lista de contas da Visão geral: filtro e agrupamento.
 *
 * Parcela aguardando entrega só aparece quando se procura por ela (busca ou
 * filtro de cliente): ela ainda pode receber baixa (entrada, sinal), mas não é
 * assunto da lista do dia.
 */
import { normalizeCategoryName } from '../categoryResolver.ts';
import { diaDaSemana, diaEMes, diasEntre, somarDias } from './base.ts';
import type { ContaResumo } from './base.ts';
import { contaNoRecorte } from './numeros.ts';
import type { Recorte } from './numeros.ts';
import { situacaoDaConta } from './situacao.ts';
import { obrigacaoTocaAConta } from '../filtroPorContaBancaria.ts';

export type FiltroRapido = 'agora' | 'todas' | 'hoje' | 'semana' | 'vencidas' | 'abertas' | 'pagas' | 'nao_conferidas' | 'canceladas';

export const FILTROS_RAPIDOS: FiltroRapido[] = ['agora', 'abertas', 'hoje', 'semana', 'vencidas', 'pagas', 'nao_conferidas', 'canceladas', 'todas'];

export const ROTULO_DO_FILTRO: Record<FiltroRapido, string> = {
    agora: 'Agora', todas: 'Todas', hoje: 'Hoje', semana: 'Semana', vencidas: 'Vencidas', abertas: 'Abertas',
    pagas: 'Pagas', nao_conferidas: 'Não conferidas', canceladas: 'Canceladas',
};

export interface FiltrosDaLista {
    recorte: Recorte | null;
    rapido: FiltroRapido;
    tipo: 'ambos' | 'receivable' | 'payable';
    mes: string | null;
    busca: string;
    clienteId: string | null;
    categoriaId: string | null;
    bancoId: string | null;
}

export const FILTROS_VAZIOS: FiltrosDaLista = {
    recorte: null, rapido: 'agora', tipo: 'ambos', mes: null, busca: '',
    clienteId: null, categoriaId: null, bancoId: null,
};

/** Os quatro que ficam à vista; o resto mora no painel Filtros. */
export const FILTROS_A_VISTA: FiltroRapido[] = ['agora', 'abertas', 'vencidas', 'pagas'];
export const FILTROS_NO_PAINEL: FiltroRapido[] = ['hoje', 'semana', 'nao_conferidas', 'canceladas', 'todas'];

/** Quantos filtros do painel estão ligados — o número no botão "Filtros". */
export function contarFiltrosExtras(f: FiltrosDaLista, emColunas: boolean): number {
    return [
        f.tipo !== 'ambos', f.mes !== null, f.clienteId !== null, f.categoriaId !== null, f.bancoId !== null,
        FILTROS_NO_PAINEL.includes(f.rapido), emColunas,
    ].filter(Boolean).length;
}

/** Busca que chega de outra tela (ex.: Pedidos → "Pedido #123"). */
export function filtrosDaBusca(busca: string): Partial<FiltrosDaLista> {
    return busca.trim() ? { busca, rapido: 'todas', recorte: null } : {};
}

export interface ContextoDaLista {
    hoje: string;
    contasPorObrigacao: Record<string, string[]>;
    nomeDaParte: (c: ContaResumo) => string;
    nomeDaCategoria: (c: ContaResumo) => string;
}

function passaNoRapido(c: ContaResumo, f: FiltroRapido, hoje: string): boolean {
    const s = situacaoDaConta(c, hoje);
    if (f === 'canceladas') return s === 'cancelada';
    if (s === 'cancelada') return false;
    switch (f) {
        case 'agora': return s === 'vencida' || (s === 'a_vencer' && c.due_date <= somarDias(hoje, 6));
        case 'hoje': return c.due_date === hoje && s !== 'paga';
        case 'semana': return s === 'a_vencer' && c.due_date <= somarDias(hoje, 6);
        case 'vencidas': return s === 'vencida';
        case 'abertas': return s === 'vencida' || s === 'a_vencer' || s === 'aguardando_entrega';
        case 'pagas': return s === 'paga';
        case 'nao_conferidas': return c.derived_status === 'paid' && !c.is_reconciled;
        default: return true;
    }
}

export function filtrarContas<T extends ContaResumo>(contas: T[], f: FiltrosDaLista, ctx: ContextoDaLista): T[] {
    const busca = normalizeCategoryName(f.busca);
    const mostrarAguardando = busca !== '' || f.clienteId !== null;
    const saida = contas.filter(c => {
        if (!mostrarAguardando && situacaoDaConta(c, ctx.hoje) === 'aguardando_entrega') return false;
        // Procurando (busca ou cliente), a que aguarda entrega aparece mesmo fora dos 7 dias do "agora".
        const achadaPorBusca = mostrarAguardando && f.rapido === 'agora' && situacaoDaConta(c, ctx.hoje) === 'aguardando_entrega';
        if (f.recorte ? !contaNoRecorte(c, f.recorte, ctx.hoje) : !(achadaPorBusca || passaNoRapido(c, f.rapido, ctx.hoje))) return false;
        if (f.tipo !== 'ambos' && c.type !== f.tipo) return false;
        if (f.mes && !c.due_date.startsWith(f.mes)) return false;
        // clienteId vale para cliente ou fornecedor: o filtro é "de quem é a conta".
        if (f.clienteId && c.client_id !== f.clienteId && c.supplier_id !== f.clienteId) return false;
        if (f.categoriaId && c.global_category_id !== f.categoriaId) return false;
        // Conta prevista OU conta onde o dinheiro passou — ver filtroPorContaBancaria.
        if (f.bancoId && !obrigacaoTocaAConta(c, f.bancoId, ctx.contasPorObrigacao)) return false;
        if (busca) {
            const alvo = normalizeCategoryName(`${c.description} ${ctx.nomeDaParte(c)} ${ctx.nomeDaCategoria(c)}`);
            if (!alvo.includes(busca)) return false;
        }
        return true;
    });
    const maisRecentesPrimeiro = !f.recorte && f.rapido === 'pagas';
    return saida.sort((a, b) =>
        (maisRecentesPrimeiro ? b.due_date.localeCompare(a.due_date) : a.due_date.localeCompare(b.due_date))
        || b.remaining_amount - a.remaining_amount);
}

export interface GrupoDaLista<T extends ContaResumo = ContaResumo> { titulo: string; contas: T[] }

/** "qui 24/09", com o ano só quando não é o de hoje. */
const diaPorExtenso = (dia: string, hoje: string): string =>
    `${diaDaSemana(dia)} ${diaEMes(dia)}${dia.slice(0, 4) === hoje.slice(0, 4) ? '' : `/${dia.slice(0, 4)}`}`;

export function tituloDoDia(dia: string, hoje: string): string {
    const base = diaPorExtenso(dia, hoje);
    if (dia === hoje) return `Hoje · ${base}`;
    if (dia === somarDias(hoje, 1)) return `Amanhã · ${base}`;
    return base;
}

/** O valor que a linha mostra (e os subtotais somam): o que falta; paga, o valor original. */
export const valorDaLinha = (c: ContaResumo): number => (c.remaining_amount > 0 ? c.remaining_amount : c.original_amount);

/** "venceu há 12 dias · qui 24/09": o relativo com a data original junto (Luiz, 29/10). */
const tituloDoAtraso = (dia: string, hoje: string): string => {
    const dias = diasEntre(dia, hoje);
    return `${dias === 1 ? 'venceu ontem' : `venceu há ${dias} dias`} · ${diaPorExtenso(dia, hoje)}`;
};

/** Agrupa contas JÁ ordenadas; grupos vizinhos com o mesmo título se juntam. */
export function agruparParaLista<T extends ContaResumo>(contas: T[], hoje: string, porAtraso: boolean): GrupoDaLista<T>[] {
    const grupos: GrupoDaLista<T>[] = [];
    for (const c of contas) {
        const titulo = porAtraso && c.due_date < hoje ? tituloDoAtraso(c.due_date, hoje) : tituloDoDia(c.due_date, hoje);
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.titulo === titulo) ultimo.contas.push(c);
        else grupos.push({ titulo, contas: [c] });
    }
    return grupos;
}
