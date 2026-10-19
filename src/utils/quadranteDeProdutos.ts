// Volume contra margem — o cruzamento que muda decisão.
//
// A tela de Itens Vendidos já sabe quanto se vendeu de cada peça e qual a
// margem de cada uma. As duas informações vivem em colunas separadas, e o
// cruzamento delas só aparece se alguém ordenar uma, decorar o topo, ordenar a
// outra e comparar de cabeça. Ninguém faz isso.
//
// O CANTO QUE IMPORTA É UM SÓ
// Volume alto com margem baixa: o produto que ocupa a fábrica e não paga por
// ela. Ele nunca chama atenção sozinho, porque é campeão de faturamento — está
// sempre no topo de qualquer lista ordenada por venda, e parece o carro-chefe.
//
// Os outros três quadrantes também informam, mas nenhum deles é uma surpresa:
// volume alto e margem alta você já sabe qual é; volume baixo e margem baixa
// não custa nada; volume baixo e margem alta é a peça que ninguém empurra.
//
// OS CORTES SÃO MEDIANAS, NÃO NÚMEROS ESCOLHIDOS
// Um limiar fixo ("margem abaixo de 30%") diz mais sobre o setor do que sobre
// esta fábrica, e classifica tudo do mesmo lado quando o negócio inteiro está
// acima ou abaixo dele. A mediana divide a carteira ao meio por construção: a
// pergunta vira "comparado com o que EU vendo", que é a que tem resposta.
//
// Sem imports do app, para ser testado direto com `node --test`.

export interface ProdutoNoQuadrante {
    produto: string;
    pecas: number;
    margemPct: number;
    /** Margem unitária × peças. O que a peça de fato pôs no bolso. */
    contribuicaoTotal: number;
    precoMedio?: number;
    custoUnitario?: number;
}

export type Quadrante =
    | 'ocupa-e-nao-paga'
    | 'carro-chefe'
    | 'joia-escondida'
    | 'cauda';

export const ROTULO_DO_QUADRANTE: Record<Quadrante, string> = {
    'ocupa-e-nao-paga': 'Ocupa a fábrica e não paga',
    'carro-chefe': 'Carro-chefe',
    'joia-escondida': 'Joia escondida',
    'cauda': 'Cauda',
};

export const EXPLICACAO_DO_QUADRANTE: Record<Quadrante, string> = {
    'ocupa-e-nao-paga':
        'Vende muito e sobra pouco. Ocupa a capacidade que faltaria para peça melhor. ' +
        'É aqui que um aumento pequeno de preço vale mais que qualquer venda nova.',
    'carro-chefe':
        'Volume e margem juntos. Não mexa — só garanta que a produção dá conta.',
    'joia-escondida':
        'Margem boa e ninguém empurra. É a peça a oferecer no próximo orçamento, ' +
        'sem custo nenhum de fábrica.',
    'cauda':
        'Pouco volume e pouca margem. Não é urgente; é onde se corta se o catálogo ' +
        'ficar grande demais para cuidar.',
};

export interface PontoDoQuadrante extends ProdutoNoQuadrante {
    quadrante: Quadrante;
    /** Posição relativa no eixo, 0..1 — para desenhar sem reescalar na tela. */
    x: number;
    y: number;
}

export interface Quadrantes {
    pontos: PontoDoQuadrante[];
    /** Os cortes usados: mediana de peças e mediana de margem. */
    corteDeVolume: number;
    corteDeMargem: number;
    /** Extremos, para a escala do desenho. */
    maiorVolume: number;
    maiorMargem: number;
    menorMargem: number;
    porQuadrante: Record<Quadrante, PontoDoQuadrante[]>;
}

/**
 * Mínimo de produtos para o quadrante significar algo.
 *
 * Com três produtos, a mediana separa um de dois e o "quadrante" é um rótulo
 * pomposo para uma lista de três linhas. Abaixo disto a tela diz que ainda não
 * há o que cruzar, em vez de desenhar quatro caixas com um ponto cada.
 */
export const MINIMO_DE_PRODUTOS = 5;

export function mediana(valores: number[]): number {
    const ordenados = [...valores].filter(Number.isFinite).sort((a, b) => a - b);
    if (ordenados.length === 0) return 0;
    const meio = Math.floor(ordenados.length / 2);
    return ordenados.length % 2
        ? ordenados[meio]
        : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * Em que quadrante cai um produto.
 *
 * O corte é ">=" nos dois eixos: quem está exatamente na mediana conta como
 * alto. Um produto na linha divisória não é problema, e empurrá-lo para baixo
 * o poria numa lista de ação que ele não merece.
 */
export function quadranteDe(
    pecas: number, margemPct: number,
    corteDeVolume: number, corteDeMargem: number,
): Quadrante {
    const muito = pecas >= corteDeVolume;
    const boa = margemPct >= corteDeMargem;
    if (muito && !boa) return 'ocupa-e-nao-paga';
    if (muito && boa) return 'carro-chefe';
    if (!muito && boa) return 'joia-escondida';
    return 'cauda';
}

const vazio = (): Record<Quadrante, PontoDoQuadrante[]> => ({
    'ocupa-e-nao-paga': [], 'carro-chefe': [], 'joia-escondida': [], 'cauda': [],
});

/**
 * O quadrante inteiro.
 *
 * Dentro de cada canto os produtos saem ordenados pelo que os torna
 * interessantes: em "ocupa e não paga", por VOLUME — é o que mais consome a
 * fábrica que mais dói. Nos outros, pela contribuição total.
 */
export function montarQuadrantes(
    produtos: ProdutoNoQuadrante[] | null | undefined,
): Quadrantes {
    const lista = (produtos || []).filter(p => Number(p.pecas) > 0);

    const corteDeVolume = mediana(lista.map(p => Number(p.pecas)));
    const corteDeMargem = mediana(lista.map(p => Number(p.margemPct)));

    const margens = lista.map(p => Number(p.margemPct));
    const maiorVolume = Math.max(1, ...lista.map(p => Number(p.pecas)));
    const maiorMargem = margens.length ? Math.max(...margens) : 0;
    const menorMargem = margens.length ? Math.min(...margens) : 0;
    const faixa = maiorMargem - menorMargem || 1;

    const pontos: PontoDoQuadrante[] = lista.map(p => ({
        ...p,
        quadrante: quadranteDe(Number(p.pecas), Number(p.margemPct), corteDeVolume, corteDeMargem),
        x: Number(p.pecas) / maiorVolume,
        y: (Number(p.margemPct) - menorMargem) / faixa,
    }));

    const porQuadrante = vazio();
    for (const p of pontos) porQuadrante[p.quadrante].push(p);

    for (const [q, itens] of Object.entries(porQuadrante) as [Quadrante, PontoDoQuadrante[]][]) {
        itens.sort((a, b) => q === 'ocupa-e-nao-paga'
            ? b.pecas - a.pecas
            : b.contribuicaoTotal - a.contribuicaoTotal);
    }

    return {
        pontos, corteDeVolume, corteDeMargem,
        maiorVolume, maiorMargem, menorMargem, porQuadrante,
    };
}

/**
 * Quanto se ganharia levando os "ocupa e não paga" até a margem mediana.
 *
 * É o número que transforma o quadrante em decisão: sem ele, o canto vermelho é
 * uma observação; com ele, é uma proposta de aumento de preço com valor escrito.
 *
 * Deliberadamente simples — supõe o mesmo volume depois do reajuste, o que não
 * é verdade. Serve para dizer a ORDEM DE GRANDEZA do que está em jogo, e quem
 * lê precisa saber disso; por isso a função tem nome de potencial, não de ganho.
 */
export function potencialDoAjuste(q: Quadrantes): number {
    return q.porQuadrante['ocupa-e-nao-paga'].reduce((total, p) => {
        const faltando = q.corteDeMargem - p.margemPct;
        if (faltando <= 0 || !p.precoMedio) return total;
        return total + (p.precoMedio * (faltando / 100)) * p.pecas;
    }, 0);
}
