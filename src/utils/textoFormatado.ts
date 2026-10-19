/**
 * Texto com recuo que sobrevive até o papel.
 *
 * A observação de fábrica é escrita como lista: item, sub-item, ressalva. No
 * campo isso é feito com Tab. Só que o Tab do navegador pula para o próximo
 * campo em vez de recuar, então quem tentava formatar perdia o texto de vista —
 * e o pouco que passava chegava ao PDF como um parágrafo corrido, porque o
 * gerador juntava tudo com separador e mandava para o `splitTextToSize`.
 *
 * Aqui o recuo vira um NÚMERO por linha, não espaços no meio da string. É o que
 * permite ao PDF deslocar o x da linha — indentação de verdade, alinhada,
 * independente da fonte — em vez de torcer para os espaços serem respeitados.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

/** Espaços que um Tab vale. Quatro é o suficiente para o olho ver o degrau. */
export const ESPACOS_POR_RECUO = 4;

export interface LinhaComRecuo {
    /** O texto já sem o recuo à esquerda. */
    texto: string;
    /** Quantos níveis de recuo — 0 é a margem. */
    recuo: number;
}

/**
 * Separa cada linha do seu recuo.
 *
 * Tab literal e grupos de espaço contam igual: quem escreveu com Tab e quem
 * colou de outro lugar com espaços querem a mesma coisa.
 */
export function linhasComRecuo(texto: string | null | undefined): LinhaComRecuo[] {
    if (!texto) return [];
    return String(texto).replace(/\r\n?/g, '\n').split('\n').map(linha => {
        const brancos = linha.match(/^[\t ]*/)?.[0] || '';
        // Um Tab vale um nível inteiro; espaços valem a fração que couber.
        const tabs = (brancos.match(/\t/g) || []).length;
        const espacos = (brancos.match(/ /g) || []).length;
        return {
            texto: linha.slice(brancos.length).trimEnd(),
            recuo: tabs + Math.floor(espacos / ESPACOS_POR_RECUO),
        };
    });
}

/** Tira linhas em branco do começo e do fim, preservando as do meio. */
export function aparar(linhas: LinhaComRecuo[]): LinhaComRecuo[] {
    let i = 0, f = linhas.length;
    while (i < f && !linhas[i].texto) i++;
    while (f > i && !linhas[f - 1].texto) f--;
    return linhas.slice(i, f);
}

/** O texto tem alguma formatação a preservar (mais de uma linha ou recuo)? */
export function temFormatacao(texto: string | null | undefined): boolean {
    const linhas = aparar(linhasComRecuo(texto));
    return linhas.length > 1 || linhas.some(l => l.recuo > 0);
}

/**
 * Aplica o Tab dentro de um campo de texto, como um editor faria.
 *
 * Sem seleção, insere um recuo no cursor. Com seleção de várias linhas, recua
 * ou desrecua o bloco inteiro — que é o que a pessoa espera ao selecionar uma
 * lista e apertar Tab.
 *
 * Devolve o texto novo e onde o cursor e a seleção devem ficar. Pura de
 * propósito: a regra do recuo é testável sem montar um DOM.
 */
export function aplicarTab(
    texto: string,
    inicio: number,
    fim: number,
    remover = false,
): { texto: string; inicio: number; fim: number } {
    const recuo = ' '.repeat(ESPACOS_POR_RECUO);
    const inicioDaLinha = texto.lastIndexOf('\n', inicio - 1) + 1;
    const selecaoTemVariasLinhas = texto.slice(inicio, fim).includes('\n');

    // Caso simples: cursor solto, Tab insere.
    if (!remover && inicio === fim && !selecaoTemVariasLinhas) {
        const novo = texto.slice(0, inicio) + recuo + texto.slice(fim);
        return { texto: novo, inicio: inicio + recuo.length, fim: inicio + recuo.length };
    }

    // Bloco: recua ou desrecua cada linha tocada pela seleção.
    const fimDaLinha = texto.indexOf('\n', fim);
    const corteFinal = fimDaLinha === -1 ? texto.length : fimDaLinha;
    const bloco = texto.slice(inicioDaLinha, corteFinal);

    let removidoNaPrimeira = 0;
    let removidoNoTotal = 0;
    let adicionadoNaPrimeira = 0;

    const linhas = bloco.split('\n').map((linha, i) => {
        if (remover) {
            const m = linha.match(new RegExp(`^(\\t| {1,${ESPACOS_POR_RECUO}})`));
            if (!m) return linha;
            if (i === 0) removidoNaPrimeira = m[1].length;
            removidoNoTotal += m[1].length;
            return linha.slice(m[1].length);
        }
        // Linha vazia no meio de um bloco não ganha recuo pendurado.
        if (!linha.trim() && bloco.includes('\n')) return linha;
        if (i === 0) adicionadoNaPrimeira = recuo.length;
        removidoNoTotal -= recuo.length;
        return recuo + linha;
    });

    const novo = texto.slice(0, inicioDaLinha) + linhas.join('\n') + texto.slice(corteFinal);
    const delta = remover ? -removidoNaPrimeira : adicionadoNaPrimeira;

    return {
        texto: novo,
        inicio: Math.max(inicioDaLinha, inicio + delta),
        fim: Math.max(inicioDaLinha, fim - removidoNoTotal),
    };
}
