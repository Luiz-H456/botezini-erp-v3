// Previsão de recebimento a partir do comportamento real de cada cliente.
//
// O vencimento é o que foi COMBINADO. Ele não é previsão de nada — é promessa.
// Um cliente que historicamente paga 12 dias depois vai pagar 12 dias depois de
// novo, e um fluxo de caixa montado sobre os vencimentos mostra dinheiro em
// datas em que ele não vai estar lá. Aqui o vencimento é corrigido pelo atraso
// típico daquele cliente.
//
// MEDIANA, não média: um único pagamento que atrasou 90 dias (feriado, troca de
// responsável, uma nota perdida) puxaria a média e faria o cliente parecer bem
// pior do que é. A mediana ignora o caso extremo e descreve o comportamento
// habitual, que é o que serve para prever o próximo.

export interface ObrigacaoParaPrevisao {
    id: string;
    client_id?: string;
    due_date?: string;
    planned_method?: string;
}

export interface PagamentoRealizado {
    obligation_id: string;
    payment_date?: string;
    method?: string;
    amount?: number;
}

export interface ComportamentoDoCliente {
    client_id: string;
    /** Quantos pagamentos com data conhecida sustentam este perfil. */
    amostras: number;
    /** Dias de desvio típico: positivo atrasa, negativo antecipa, 0 no dia. */
    desvioTipicoDias: number;
    /** Pior atraso já observado. */
    piorAtrasoDias: number;
    pctNoPrazo: number;
    /** Meio de pagamento mais usado, quando há um predominante. */
    meioHabitual?: string;
    /** Quantas vezes usou o meio habitual. */
    meioHabitualVezes: number;
}

const DIA_MS = 86_400_000;

function diasEntre(de?: string, ate?: string): number | null {
    if (!de || !ate) return null;
    const a = Date.parse(de.slice(0, 10));
    const b = Date.parse(ate.slice(0, 10));
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.round((b - a) / DIA_MS);
}

/**
 * Mediana de uma lista de números.
 *
 * Com número par de amostras devolve a MENOR das duas centrais em vez da média
 * entre elas. Meio dia de atraso não existe na prática, e arredondar para baixo
 * mantém a previsão conservadora do lado certo: erra prevendo o dinheiro mais
 * cedo do que tarde, o que aparece como saldo faltando e não como surpresa.
 */
export function mediana(ns: number[]): number {
    if (ns.length === 0) return 0;
    const ord = [...ns].sort((a, b) => a - b);
    return ord[Math.floor((ord.length - 1) / 2)];
}

/** Soma a `data` uma quantidade de dias, devolvendo ISO aaaa-mm-dd. */
export function somarDias(data: string, dias: number): string {
    const t = Date.parse(data.slice(0, 10));
    if (Number.isNaN(t)) return data;
    return new Date(t + dias * DIA_MS).toISOString().slice(0, 10);
}

/**
 * Perfil de pagamento de cada cliente, a partir do que já aconteceu.
 *
 * Só entra pagamento cuja obrigação tenha vencimento conhecido — sem os dois
 * lados não há desvio a medir. Pagamento parcial conta pela data em que foi
 * feito: para prever quando o dinheiro entra, o que importa é o movimento.
 */
export function comportamentoPorCliente(
    obrigacoes: ObrigacaoParaPrevisao[],
    pagamentos: PagamentoRealizado[],
): Map<string, ComportamentoDoCliente> {
    const porId = new Map(obrigacoes.map(o => [o.id, o]));
    const bruto = new Map<string, { desvios: number[]; meios: Map<string, number> }>();

    for (const p of pagamentos) {
        const o = porId.get(p.obligation_id);
        if (!o?.client_id || !o.due_date || !p.payment_date) continue;
        const desvio = diasEntre(o.due_date, p.payment_date);
        if (desvio === null) continue;

        let e = bruto.get(o.client_id);
        if (!e) { e = { desvios: [], meios: new Map() }; bruto.set(o.client_id, e); }
        e.desvios.push(desvio);
        if (p.method) e.meios.set(p.method, (e.meios.get(p.method) || 0) + 1);
    }

    const saida = new Map<string, ComportamentoDoCliente>();
    for (const [client_id, e] of bruto) {
        const noPrazo = e.desvios.filter(d => d <= 0).length;
        let meioHabitual: string | undefined;
        let meioHabitualVezes = 0;
        for (const [meio, vezes] of e.meios) {
            if (vezes > meioHabitualVezes) { meioHabitual = meio; meioHabitualVezes = vezes; }
        }
        saida.set(client_id, {
            client_id,
            amostras: e.desvios.length,
            desvioTipicoDias: mediana(e.desvios),
            piorAtrasoDias: e.desvios.reduce((m, d) => Math.max(m, d), 0),
            pctNoPrazo: Math.round((noPrazo / e.desvios.length) * 1000) / 10,
            meioHabitual,
            meioHabitualVezes,
        });
    }
    return saida;
}

/** Abaixo disto o histórico é curto demais para virar previsão. */
export const AMOSTRAS_MINIMAS = 3;

export type ConfiancaDaPrevisao = 'historico' | 'poucos_dados' | 'sem_historico';

export interface PrevisaoDeRecebimento {
    obligation_id: string;
    client_id?: string;
    vencimento?: string;
    /** Quando o dinheiro deve entrar de fato. */
    dataProvavel?: string;
    /** Dias somados ao vencimento. Zero quando não há histórico. */
    desvioAplicadoDias: number;
    confianca: ConfiancaDaPrevisao;
    amostras: number;
    /** Meio previsto no cadastro. */
    meioPrevisto?: string;
    /** Meio que o cliente realmente costuma usar. */
    meioHabitual?: string;
    /** True quando o histórico contradiz o meio previsto — vale conferir. */
    meioDivergente: boolean;
}

/**
 * Data provável de entrada de cada recebimento em aberto.
 *
 * Cliente com menos de `AMOSTRAS_MINIMAS` pagamentos NÃO tem o vencimento
 * corrigido: com uma ou duas amostras o "padrão" é ruído, e deslocar a data com
 * base nele erraria com ares de precisão. Nesses casos a previsão é o próprio
 * vencimento, e a confiança declarada diz que ali não há histórico — quem lê
 * decide se confia.
 */
export function preverRecebimentos(
    emAberto: ObrigacaoParaPrevisao[],
    comportamento: Map<string, ComportamentoDoCliente>,
): PrevisaoDeRecebimento[] {
    return emAberto.map(o => {
        const c = o.client_id ? comportamento.get(o.client_id) : undefined;
        const amostras = c?.amostras || 0;
        const temHistorico = !!c && amostras >= AMOSTRAS_MINIMAS;
        const desvio = temHistorico ? (c as ComportamentoDoCliente).desvioTipicoDias : 0;

        return {
            obligation_id: o.id,
            client_id: o.client_id,
            vencimento: o.due_date,
            dataProvavel: o.due_date ? somarDias(o.due_date, desvio) : undefined,
            desvioAplicadoDias: desvio,
            confianca: !c ? 'sem_historico' : temHistorico ? 'historico' : 'poucos_dados',
            amostras,
            meioPrevisto: o.planned_method,
            meioHabitual: c?.meioHabitual,
            // Só é divergência quando os dois lados existem e discordam. Sem
            // meio previsto não há o que contradizer.
            meioDivergente: !!(o.planned_method && c?.meioHabitual
                && o.planned_method !== c.meioHabitual && temHistorico),
        };
    });
}

export interface TotalPorMes {
    /** aaaa-mm */
    chave: string;
    /** Somatório pelo vencimento combinado. */
    peloVencimento: number;
    /** Somatório pela data provável de entrada. */
    pelaPrevisao: number;
}

/**
 * Compara, mês a mês, o que o vencimento promete com o que o histórico sugere.
 *
 * É a leitura que importa: a diferença entre as duas colunas é exatamente o
 * dinheiro que o fluxo de caixa está contando num mês e vai entrar no seguinte.
 */
export function compararVencimentoComPrevisao(
    previsoes: PrevisaoDeRecebimento[],
    valorPorObrigacao: Map<string, number>,
): TotalPorMes[] {
    const meses = new Map<string, TotalPorMes>();
    const pegar = (chave: string) => {
        let m = meses.get(chave);
        if (!m) { m = { chave, peloVencimento: 0, pelaPrevisao: 0 }; meses.set(chave, m); }
        return m;
    };

    for (const p of previsoes) {
        const valor = valorPorObrigacao.get(p.obligation_id) || 0;
        if (p.vencimento) pegar(p.vencimento.slice(0, 7)).peloVencimento += valor;
        if (p.dataProvavel) pegar(p.dataProvavel.slice(0, 7)).pelaPrevisao += valor;
    }

    return [...meses.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}
