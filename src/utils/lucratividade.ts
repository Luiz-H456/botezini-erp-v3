// Peças mais e menos lucrativas. Sem imports, testado direto.
//
// LIMITE DO DADO — o custo vem de `products.average_unit_cost`, que é o custo
// médio ATUAL do produto, mantido por gatilho no banco. Ele não é histórico:
// uma peça vendida em janeiro é comparada com o custo de hoje. Se o tecido
// subiu desde então, a margem daquela venda aparece pior do que foi de fato.
//
// Isso é aceitável para a pergunta "que peça vale a pena produzir HOJE", que é
// a decisão real, e enganoso para "quanto ganhei naquela venda". Por isso a
// tela fala em margem por peça, nunca em lucro do período — e produto sem custo
// cadastrado fica de fora em vez de aparecer com margem de 100%.

export interface LinhaParaMargem {
    produto: string;
    quantidade: number;
    valorUnit: number;
    valorTotal: number;
    precoConhecido: boolean;
}

export interface MargemDoProduto {
    produto: string;
    pecas: number;
    /** Média ponderada pelo volume — vender 100 a R$50 pesa mais que 1 a R$80. */
    precoMedio: number;
    custoUnitario: number;
    margemUnitaria: number;
    /** Margem sobre o preço, em %. */
    margemPct: number;
    /** Margem unitária × peças vendidas. */
    contribuicaoTotal: number;
}

export interface ResultadoDeMargem {
    comCusto: MargemDoProduto[];
    /** Produtos vendidos que não têm custo cadastrado — não dá para calcular. */
    semCusto: { produto: string; pecas: number }[];
    /** Peças vendidas sem preço encontrado, já excluídas da conta. */
    pecasSemPreco: number;
}

/**
 * Margem por produto, do mais lucrativo para o menos.
 *
 * Ordena por MARGEM UNITÁRIA, não por contribuição total: a pergunta "qual peça
 * é mais lucrativa" é sobre a peça, não sobre o volume que se vendeu dela. O
 * campeão de volume quase sempre lidera a contribuição total e esconderia a
 * peça de margem alta que ninguém está empurrando — que é justamente a que a
 * lista deveria revelar.
 *
 * `custoPorProduto` aceita o nome do produto como chave. Produto sem custo
 * conhecido sai numa lista à parte: margem calculada contra custo zero daria
 * 100% e colocaria justamente os mal cadastrados no topo do ranking.
 */
export function margemPorProduto(
    linhas: LinhaParaMargem[],
    custoPorProduto: Map<string, number>,
): ResultadoDeMargem {
    const acumulado = new Map<string, { pecas: number; receita: number }>();
    let pecasSemPreco = 0;

    for (const l of linhas) {
        if (!l.precoConhecido) { pecasSemPreco += l.quantidade; continue; }
        const a = acumulado.get(l.produto) || { pecas: 0, receita: 0 };
        a.pecas += l.quantidade;
        a.receita += l.valorTotal;
        acumulado.set(l.produto, a);
    }

    const comCusto: MargemDoProduto[] = [];
    const semCusto: { produto: string; pecas: number }[] = [];

    for (const [produto, a] of acumulado) {
        if (a.pecas <= 0) continue;
        const custo = custoPorProduto.get(produto);
        if (!custo || custo <= 0) { semCusto.push({ produto, pecas: a.pecas }); continue; }

        const precoMedio = a.receita / a.pecas;
        const margemUnitaria = precoMedio - custo;
        comCusto.push({
            produto,
            pecas: a.pecas,
            precoMedio: Math.round(precoMedio * 100) / 100,
            custoUnitario: Math.round(custo * 100) / 100,
            margemUnitaria: Math.round(margemUnitaria * 100) / 100,
            margemPct: precoMedio > 0 ? Math.round((margemUnitaria / precoMedio) * 1000) / 10 : 0,
            contribuicaoTotal: Math.round(margemUnitaria * a.pecas * 100) / 100,
        });
    }

    comCusto.sort((x, y) => y.margemUnitaria - x.margemUnitaria);
    semCusto.sort((x, y) => y.pecas - x.pecas);
    return { comCusto, semCusto, pecasSemPreco };
}
