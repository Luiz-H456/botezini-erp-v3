// Preço de personalização: sugerir sem impor, e mostrar a distância entre o
// que se tabela e o que se cobra de fato. Sem imports, testado direto.
//
// A REGRA QUE MANDA — o preço do bordado é por MIL PONTOS, e a fórmula é
// APENAS SUGESTÃO. Decisão explícita do usuário. Nenhuma função aqui grava
// preço em lugar nenhum: todas devolvem número para a tela exibir ao lado do
// campo, que continua editável. Se o dado para sugerir não existe, a resposta
// é `null` — nunca zero, porque zero na tela parece preço e null não.

export type Tecnica = 'bordado' | 'dtf' | 'silk' | 'sublimacao';

export const TECNICAS: Tecnica[] = ['bordado', 'dtf', 'silk', 'sublimacao'];

export const ROTULO_TECNICA: Record<Tecnica, string> = {
    bordado: 'Bordado',
    dtf: 'DTF',
    silk: 'Silk',
    sublimacao: 'Sublimação',
};

export interface LinhaDePreco {
    id?: string;
    tecnica: Tecnica;
    descricao: string;
    unidade?: string;
    valor: number;
    faixa_min?: number | null;
    faixa_max?: number | null;
    is_active?: boolean;
}

export interface LancamentoDePersonalizacao {
    tecnica: Tecnica;
    descricao: string;
    arte_id?: string | null;
    cliente_id?: string | null;
    quantidade: number;
    valor_unitario: number;
    data: string;
}

export interface NotasDaTecnica {
    tecnica: Tecnica;
    preco_por_mil_pontos?: number | null;
    valor_minimo?: number | null;
    valor_da_arte?: number | null;
}

// ---------------------------------------------------------------------------
// SUGESTÃO DE PREÇO DE BORDADO
// ---------------------------------------------------------------------------

export interface SugestaoDeBordado {
    /** Preço sugerido por peça. `null` quando falta dado para calcular. */
    valor: number | null;
    /** Como chegou nele, para a tela mostrar em vez de um número mágico. */
    memoria: string;
    /** True quando o mínimo entrou em cima do cálculo por pontos. */
    aplicouMinimo: boolean;
}

/**
 * Preço sugerido de um bordado a partir da contagem de pontos.
 *
 * `pontos / 1000 × preçoPorMil`, com o valor mínimo como piso. O mínimo existe
 * porque um bordado de 300 pontos custaria centavos pela regra de três, e
 * ninguém para a máquina, troca a linha e enquadra a peça por centavos — o
 * custo real de um bordado pequeno é quase todo setup.
 *
 * A arte NÃO entra aqui: é cobrança única do primeiro pedido, não preço por
 * peça. Somar as duas coisas faria a segunda compra do mesmo cliente sair
 * cara pelo mesmo motivo que a primeira.
 */
export function sugerirPrecoBordado(
    pontos: number | null | undefined,
    notas: NotasDaTecnica | null | undefined,
): SugestaoDeBordado {
    const porMil = numeroPositivo(notas?.preco_por_mil_pontos);
    const minimo = numeroPositivo(notas?.valor_minimo);

    if (!Number.isFinite(Number(pontos)) || Number(pontos) <= 0) {
        return {
            valor: minimo,
            memoria: minimo === null
                ? 'Sem contagem de pontos — informe os pontos da arte ou o preço por mil pontos nas notas.'
                : `Sem contagem de pontos: usando o valor mínimo (${brl(minimo)}).`,
            aplicouMinimo: minimo !== null,
        };
    }

    if (porMil === null) {
        return {
            valor: minimo,
            memoria: minimo === null
                ? 'Defina o preço por mil pontos na aba Notas para o sistema sugerir.'
                : `Preço por mil pontos não definido: usando o valor mínimo (${brl(minimo)}).`,
            aplicouMinimo: minimo !== null,
        };
    }

    const p = Number(pontos);
    const bruto = arredondar2((p / 1000) * porMil);
    const aplicouMinimo = minimo !== null && minimo > bruto;
    const valor = aplicouMinimo ? minimo! : bruto;

    const base = `${formatarPontos(p)} pontos ÷ 1.000 × ${brl(porMil)} = ${brl(bruto)}`;
    return {
        valor,
        memoria: aplicouMinimo ? `${base}; abaixo do mínimo, aplicado ${brl(minimo!)}.` : base,
        aplicouMinimo,
    };
}

// ---------------------------------------------------------------------------
// TABELA DE PREÇOS
// ---------------------------------------------------------------------------

/**
 * A linha da tabela que vale para esta técnica nesta quantidade.
 *
 * Entre duas linhas que servem, ganha a de faixa mais estreita: uma linha
 * "acima de 100 peças" foi escrita depois da genérica justamente para
 * sobrepô-la. Linha sem faixa nenhuma é o fallback mais largo possível.
 */
export function precoDaTabela(
    tabela: LinhaDePreco[],
    tecnica: Tecnica,
    quantidade: number,
): LinhaDePreco | null {
    const candidatas = tabela.filter(l =>
        l.tecnica === tecnica &&
        l.is_active !== false &&
        dentroDaFaixa(l, quantidade),
    );
    if (candidatas.length === 0) return null;

    return candidatas.slice().sort((a, b) => larguraDaFaixa(a) - larguraDaFaixa(b))[0];
}

function dentroDaFaixa(l: LinhaDePreco, q: number): boolean {
    const min = numeroPositivo(l.faixa_min);
    const max = numeroPositivo(l.faixa_max);
    if (min !== null && q < min) return false;
    if (max !== null && q > max) return false;
    return true;
}

function larguraDaFaixa(l: LinhaDePreco): number {
    const min = numeroPositivo(l.faixa_min);
    const max = numeroPositivo(l.faixa_max);
    if (min === null && max === null) return Number.POSITIVE_INFINITY;
    if (min === null) return max!;
    if (max === null) return Number.MAX_SAFE_INTEGER - min;
    return max - min;
}

// ---------------------------------------------------------------------------
// HISTÓRICO — o que foi cobrado de verdade
// ---------------------------------------------------------------------------

export interface ResumoDoHistorico {
    tecnica: Tecnica;
    lancamentos: number;
    /** Peças/metros somados. */
    quantidadeTotal: number;
    faturamento: number;
    /**
     * Média PONDERADA pela quantidade, não média das linhas: um lançamento de
     * 500 peças a R$ 3 pesa mais que um de 2 peças a R$ 20. A média simples
     * diria R$ 11,50, o que não é o que se cobra na prática.
     */
    valorMedio: number;
    /** Mediana dos valores unitários — resiste a um lançamento fora da curva. */
    valorMediano: number;
    menorValor: number;
    maiorValor: number;
    ultimaData: string | null;
}

export function resumirHistorico(
    historico: LancamentoDePersonalizacao[],
    tecnica: Tecnica,
): ResumoDoHistorico | null {
    const linhas = historico.filter(h => h.tecnica === tecnica && Number(h.valor_unitario) > 0);
    if (linhas.length === 0) return null;

    const quantidadeTotal = linhas.reduce((s, l) => s + Math.max(0, Number(l.quantidade) || 0), 0);
    const faturamento = linhas.reduce(
        (s, l) => s + Math.max(0, Number(l.quantidade) || 0) * Number(l.valor_unitario), 0);

    const unitarios = linhas.map(l => Number(l.valor_unitario)).sort((a, b) => a - b);
    const datas = linhas.map(l => l.data).filter(Boolean).sort();

    return {
        tecnica,
        lancamentos: linhas.length,
        quantidadeTotal: arredondar2(quantidadeTotal),
        faturamento: arredondar2(faturamento),
        // Quantidade zerada em todos os lançamentos deixaria a ponderada 0/0;
        // nesse caso a média simples é a única resposta honesta.
        valorMedio: quantidadeTotal > 0
            ? arredondar2(faturamento / quantidadeTotal)
            : arredondar2(unitarios.reduce((s, v) => s + v, 0) / unitarios.length),
        valorMediano: mediana(unitarios),
        menorValor: unitarios[0],
        maiorValor: unitarios[unitarios.length - 1],
        ultimaData: datas.length ? datas[datas.length - 1] : null,
    };
}

export interface Divergencia {
    tecnica: Tecnica;
    /** Preço da tabela para a técnica (linha mais larga, sem faixa). */
    tabelado: number | null;
    /** Média ponderada realmente cobrada. */
    praticado: number;
    /** praticado − tabelado. Negativo = você cobra menos do que tabela. */
    diferenca: number | null;
    diferencaPct: number | null;
    lancamentos: number;
}

/**
 * Onde a tabela deixou de descrever a realidade.
 *
 * Serve para uma pergunta só: "a minha tabela ainda vale?". Se você tabela
 * R$ 12 e vem cobrando R$ 9 há meses, a tabela está errada — ou o desconto
 * virou regra sem ninguém decidir isso.
 */
export function compararTabelaComPraticado(
    tabela: LinhaDePreco[],
    historico: LancamentoDePersonalizacao[],
): Divergencia[] {
    const saida: Divergencia[] = [];
    for (const tecnica of TECNICAS) {
        const resumo = resumirHistorico(historico, tecnica);
        if (!resumo) continue;

        const linha = precoDaTabela(tabela, tecnica, 1);
        const tabelado = linha ? Number(linha.valor) : null;
        const praticado = resumo.valorMedio;

        saida.push({
            tecnica,
            tabelado,
            praticado,
            diferenca: tabelado === null ? null : arredondar2(praticado - tabelado),
            diferencaPct: tabelado === null || tabelado === 0
                ? null
                : arredondar2(((praticado - tabelado) / tabelado) * 100),
            lancamentos: resumo.lancamentos,
        });
    }
    return saida;
}

// ---------------------------------------------------------------------------
// ARTES
// ---------------------------------------------------------------------------

export interface ArteResumida {
    id: string;
    nome: string;
    pontos?: number | null;
    tempo_minutos?: number | null;
    cores_linha?: string;
    local_do_arquivo?: string;
    cliente_id?: string | null;
}

/**
 * Cores de linha como lista, a partir do texto livre do cadastro.
 *
 * O campo é livre porque "Branco, Azul Marinho / Dourado" é como as pessoas
 * escrevem de fato. Separar por vírgula, barra ou ponto-e-vírgula cobre o que
 * se digita sem obrigar ninguém a aprender um formato.
 */
export function coresDaArte(texto: string | null | undefined): string[] {
    if (!texto) return [];
    return texto
        .split(/[,;/|\n]+/)
        .map(c => c.trim())
        .filter(Boolean);
}

/** Minutos por mil pontos — serve para estimar tempo de máquina de uma arte nova. */
export function ritmoDeBordado(artes: ArteResumida[]): number | null {
    const uteis = artes.filter(a =>
        Number(a.pontos) > 0 && Number(a.tempo_minutos) > 0);
    if (uteis.length === 0) return null;

    const pontos = uteis.reduce((s, a) => s + Number(a.pontos), 0);
    const minutos = uteis.reduce((s, a) => s + Number(a.tempo_minutos), 0);
    return arredondar2(minutos / (pontos / 1000));
}

/**
 * Tempo estimado de uma arte sem cronometragem, pelo ritmo das que têm.
 *
 * `null` quando não há nenhuma arte cronometrada — chutar o ritmo seria
 * inventar um dado que ninguém mediu.
 */
export function estimarTempo(pontos: number | null | undefined, ritmo: number | null): number | null {
    if (ritmo === null || !(Number(pontos) > 0)) return null;
    return arredondar2((Number(pontos) / 1000) * ritmo);
}

// ---------------------------------------------------------------------------

function numeroPositivo(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function mediana(ordenados: number[]): number {
    const n = ordenados.length;
    if (n === 0) return 0;
    const meio = Math.floor(n / 2);
    return n % 2 === 1
        ? ordenados[meio]
        : arredondar2((ordenados[meio - 1] + ordenados[meio]) / 2);
}

function arredondar2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function formatarPontos(n: number): string {
    return Math.round(n).toLocaleString('pt-BR');
}

function brl(n: number): string {
    return `R$ ${n.toFixed(2).replace('.', ',')}`;
}
