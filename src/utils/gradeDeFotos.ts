/**
 * Paginação da grade de fotos no PDF.
 *
 * O QUE QUEBROU AQUI
 * O campo de referências era desenhado de uma vez só, com a altura calculada
 * para todas as fotos juntas, sob a premissa de que ela sempre caberia numa
 * folha. Isso valia enquanto a célula era pequena (três colunas quase
 * quadradas: nove fotos ocupavam 181 mm). Ao passar para duas colunas em
 * retrato — para a foto ficar grande o bastante para conferir costura e
 * tonalidade — a mesma conta virou 355 mm numa página de 297 mm.
 *
 * E o código não partia o campo: ele o DESENHAVA INTEIRO mesmo assim. A partir
 * da quinta foto, a terceira fileira era desenhada abaixo do fim da página e
 * simplesmente sumia do arquivo. Sem erro, sem aviso — o PDF saía com as fotos
 * faltando e ninguém tinha como saber, porque o orçamento que se confere na
 * tela não é o que chega ao cliente.
 *
 * A correção é fatiar por LINHAS, cada fatia com sua moldura. Nunca se corta
 * uma foto ao meio, e nada é desenhado fora da folha.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface GradeDeFotos {
    colunas: number;
    larguraDaCelula: number;
    alturaDaCelula: number;
    /** Vão entre células. */
    espaco: number;
    /** Respiro entre a moldura e as células. */
    recheio: number;
    /** Faixa do título dentro da moldura. */
    alturaDoTitulo: number;
}

export interface MedidasDaGrade {
    colunas?: number;
    espaco?: number;
    recheio?: number;
    /** altura ÷ largura da célula. 1.3 aproxima o 3:4 da foto de celular. */
    proporcao?: number;
    alturaDoTitulo?: number;
}

/** Monta a grade a partir da largura útil da página. */
export function montarGrade(larguraUtil: number, m: MedidasDaGrade = {}): GradeDeFotos {
    const colunas = Math.max(1, Math.trunc(m.colunas ?? 2));
    const espaco = m.espaco ?? 4;
    const recheio = m.recheio ?? 4;
    const proporcao = m.proporcao ?? 1.3;
    const larguraDaCelula = (larguraUtil - recheio * 2 - espaco * (colunas - 1)) / colunas;
    return {
        colunas,
        larguraDaCelula,
        alturaDaCelula: larguraDaCelula * proporcao,
        espaco,
        recheio,
        alturaDoTitulo: m.alturaDoTitulo ?? 7.5,
    };
}

/** Altura da moldura para um número de fileiras. */
export function alturaDoBloco(g: GradeDeFotos, linhas: number): number {
    if (linhas <= 0) return 0;
    return g.alturaDoTitulo + g.recheio
        + linhas * g.alturaDaCelula
        + (linhas - 1) * g.espaco
        + g.recheio;
}

/** Quantas fileiras cabem numa altura disponível. Zero quando nem uma cabe. */
export function linhasQueCabemEm(g: GradeDeFotos, alturaDisponivel: number): number {
    const fixo = g.alturaDoTitulo + g.recheio * 2;
    const porLinha = g.alturaDaCelula + g.espaco;
    // A última linha não paga o vão que vem depois dela.
    const util = alturaDisponivel - fixo + g.espaco;
    if (util < g.alturaDaCelula + g.espaco) {
        return alturaDisponivel >= fixo + g.alturaDaCelula ? 1 : 0;
    }
    return Math.max(0, Math.floor(util / porLinha));
}

export interface BlocoDeFotos {
    /** Índice da primeira foto do bloco. */
    inicio: number;
    quantidade: number;
    linhas: number;
    altura: number;
    /** Este bloco começa numa folha nova. */
    novaPagina: boolean;
}

export interface EspacoDisponivel {
    /** O que sobra na folha corrente, já descontada a folga de entrada. */
    agora: number;
    /** O que uma folha vazia oferece. */
    emPaginaNova: number;
}

/**
 * Reparte as fotos em blocos que cabem de verdade.
 *
 * Um bloco só fica na folha corrente se ela comportar uma fileira inteira —
 * meia fileira não existe, e espremer é o que fazia as fotos sumirem. Quando
 * nem uma cabe, o bloco abre folha nova.
 */
export function paginarFotos(
    total: number,
    g: GradeDeFotos,
    espaco: EspacoDisponivel,
): BlocoDeFotos[] {
    if (total <= 0) return [];

    const blocos: BlocoDeFotos[] = [];
    const linhasTotais = Math.ceil(total / g.colunas);
    let linhaAtual = 0;
    let primeiro = true;

    while (linhaAtual < linhasTotais) {
        const restam = linhasTotais - linhaAtual;
        const cabeAgora = primeiro ? linhasQueCabemEm(g, espaco.agora) : 0;
        const novaPagina = cabeAgora < 1;
        const cabem = novaPagina ? linhasQueCabemEm(g, espaco.emPaginaNova) : cabeAgora;

        // Folha que não comporta uma fileira sequer significa célula maior que a
        // página. Sem isto o laço nunca terminaria.
        if (cabem < 1) break;

        const linhas = Math.min(cabem, restam);
        const inicio = linhaAtual * g.colunas;
        const quantidade = Math.min(linhas * g.colunas, total - inicio);

        blocos.push({
            inicio,
            quantidade,
            linhas,
            altura: alturaDoBloco(g, linhas),
            novaPagina,
        });

        linhaAtual += linhas;
        primeiro = false;
    }

    return blocos;
}

/**
 * Onde cada foto do bloco é desenhada, relativo ao canto do bloco.
 *
 * Foto sozinha vai ao centro: encostada à esquerda, com metade da moldura
 * vazia, parece erro de diagramação.
 */
export function posicoesDoBloco(
    g: GradeDeFotos,
    bloco: BlocoDeFotos,
    larguraUtil: number,
): Array<{ x: number; y: number }> {
    const centralizar = bloco.quantidade === 1
        ? (larguraUtil - g.recheio * 2 - g.larguraDaCelula) / 2
        : 0;

    return Array.from({ length: bloco.quantidade }, (_, i) => {
        const coluna = i % g.colunas;
        const linha = Math.floor(i / g.colunas);
        return {
            x: g.recheio + centralizar + coluna * (g.larguraDaCelula + g.espaco),
            y: g.alturaDoTitulo + g.recheio + linha * (g.alturaDaCelula + g.espaco),
        };
    });
}
