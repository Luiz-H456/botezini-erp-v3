// Histórico de um produto nos orçamentos anteriores: por quanto já saiu, para
// quem, quando, em que cor e em que quantidade.
//
// A fonte é o ORÇAMENTO e não o pedido. Ao virar pedido o item é copiado sem
// `unit_price` (ver itensVendidos.ts), então o preço praticado só existe aqui —
// procurá-lo pelo caminho do pedido seria dar a volta para chegar no mesmo lugar,
// com uma reconciliação frágil no meio.
//
// Todo status entra, e cada linha carrega o seu. Filtrar para "só aprovados"
// deixaria a caixa vazia em base nova e logo depois de enviar um orçamento —
// justamente quando se quer conferir por quanto a peça costuma sair. Quem olha vê
// o status ao lado do valor e decide o peso que dá a ele.
//
// Sem imports, para ser testado direto com `node --test`.

export interface ItemDeOrcamento {
    product_id?: string;
    product_name?: string;
    color?: string;
    size?: string;
    fabric_name?: string;
    fabric?: string;
    quantity?: number;
    unit_price?: number;
}

export interface OrcamentoDoHistorico {
    id: string;
    serial_number?: string;
    client_id?: string;
    date?: string;
    status?: string;
    items?: ItemDeOrcamento[];
}

export interface VendaDoProduto {
    orcamentoId: string;
    serial: string;
    /** aaaa-mm-dd, como gravado no orçamento. */
    data: string;
    clienteId: string;
    cliente: string;
    cor: string;
    tamanho: string;
    tecido: string;
    quantidade: number;
    valorUnit: number;
    status: string;
    /** Aprovado ou convertido em pedido — preço que o cliente aceitou. */
    fechado: boolean;
}

/**
 * As orçadas restritas a um conjunto de clientes.
 *
 * Serve ao histórico "dentro do grupo": o preço que interessa numa negociação
 * com uma filial é o que já foi praticado nas OUTRAS filiais do mesmo grupo —
 * é o número que o comprador tem em mãos e vai usar como referência. A média
 * geral da casa, misturando clientes sem relação, não ajuda nessa conversa.
 *
 * Conjunto vazio devolve lista vazia, e não a lista inteira: cliente sem grupo
 * não tem histórico de grupo, e devolver tudo faria o badge do grupo repetir o
 * badge geral fingindo ser outra informação.
 */
export function vendasDeClientes(
    vendas: VendaDoProduto[] | undefined,
    clienteIds: Iterable<string> | undefined,
): VendaDoProduto[] {
    const alvo = new Set(clienteIds || []);
    if (alvo.size === 0) return [];
    return (vendas || []).filter(v => alvo.has(v.clienteId));
}

/** Status em que o preço deixou de ser proposta e virou combinado. */
const STATUS_FECHADO = ['Approved', 'Converted'];

const arredondar2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Uma linha por vez em que este produto foi orçado, da mais recente para a mais
 * antiga.
 *
 * Linha sem preço fica de fora: uma linha de rascunho ainda em branco entraria
 * como "já vendi por R$ 0" e puxaria o mínimo da faixa para zero.
 *
 * `excluirOrcamentoId` tira o orçamento que está aberto na tela — sem isso a
 * caixa devolveria como histórico o preço que a pessoa acabou de digitar.
 */
export function vendasDoProduto(
    orcamentos: OrcamentoDoHistorico[],
    productId: string,
    nomeDoCliente: (clientId?: string) => string,
    excluirOrcamentoId?: string,
    /** Ver historicoPorProduto: junta os cadastros que são a mesma peça. */
    canonicalDe?: (productId: string) => string,
): VendaDoProduto[] {
    if (!productId) return [];
    const linhas: VendaDoProduto[] = [];
    // Compara canônico com canônico: o orçamento antigo continua apontando para
    // o cadastro que usou na época, e é aqui que os dois se reencontram.
    const alvo = canonicalDe ? canonicalDe(productId) : productId;

    for (const o of orcamentos || []) {
        if (excluirOrcamentoId && o.id === excluirOrcamentoId) continue;
        for (const it of o.items || []) {
            if (!it.product_id) continue;
            if ((canonicalDe ? canonicalDe(it.product_id) : it.product_id) !== alvo) continue;
            const valorUnit = Number(it.unit_price) || 0;
            if (valorUnit <= 0) continue;
            linhas.push({
                orcamentoId: o.id,
                serial: o.serial_number || '',
                data: (o.date || '').slice(0, 10),
                clienteId: o.client_id || '',
                cliente: nomeDoCliente(o.client_id),
                cor: (it.color || '').trim(),
                tamanho: (it.size || '').trim(),
                tecido: (it.fabric_name || it.fabric || '').trim(),
                quantidade: Number(it.quantity) || 0,
                valorUnit,
                status: o.status || '',
                fechado: STATUS_FECHADO.includes(o.status || ''),
            });
        }
    }

    // Mais recente primeiro. Sem data vai para o fim: é o que menos serve de
    // referência, e no topo empurraria para baixo a venda de ontem.
    return linhas.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}

export interface CorPraticada {
    cor: string;
    quantidade: number;
    ocorrencias: number;
    /** Ponderado pela quantidade, como o médio geral. */
    valorMedio: number;
    menor: number;
    maior: number;
}

/**
 * Média ponderada pela quantidade: 500 peças a R$ 40 pesam mais que 2 a R$ 90.
 *
 * Só com quantidade zerada em todas as linhas cai na média simples — a
 * ponderada seria 0/0. Lista vazia devolve `null`, nunca 0: "não tenho esse
 * dado" e "vendi de graça" não podem sair iguais na tela.
 */
export function mediaPonderada(vendas: VendaDoProduto[]): number | null {
    if (!vendas || vendas.length === 0) return null;
    const qtd = vendas.reduce((s, v) => s + v.quantidade, 0);
    if (qtd > 0) {
        return arredondar2(vendas.reduce((s, v) => s + v.valorUnit * v.quantidade, 0) / qtd);
    }
    return arredondar2(vendas.reduce((s, v) => s + v.valorUnit, 0) / vendas.length);
}

export interface ResumoDoProduto {
    menor: number;
    maior: number;
    /** Ponderado pela quantidade — 500 peças a R$ 40 pesam mais que 2 a R$ 90. */
    medio: number;
    /**
     * Média só do que o cliente aceitou (aprovado ou virou pedido). É o preço
     * que de fato passa; `null` quando nada fechou ainda.
     */
    medioFechado: number | null;
    /**
     * Média do que foi orçado e ainda não fechou (rascunho ou enviado). Ao lado
     * do fechado mostra a distância entre o que se pede e o que se consegue.
     */
    medioAberto: number | null;
    /** Resiste ao orçamento fora da curva que sozinho move a média. */
    mediana: number;
    /** Preço da orçada mais recente. */
    ultimo: number;
    ultimaData: string;
    quantidadeTotal: number;
    /** Clientes distintos que já receberam esta peça orçada. */
    clientes: number;
    /** Quantas linhas de orçamento — não confundir com nº de orçamentos. */
    ocorrencias: number;
    fechados: number;
    abertos: number;
    /** Cores já pedidas, da mais frequente para a menos. */
    cores: CorPraticada[];
    /** As mesmas linhas recebidas, mais recentes primeiro. */
    vendas: VendaDoProduto[];
}

/**
 * Condensa o histórico no que cabe numa caixinha: faixa, médias e com quem.
 *
 * Devolve `null` sem histórico nenhum — a tela não mostra caixa vazia, e um
 * resumo com tudo em zero mentiria dizendo "já vendi por R$ 0".
 */
export function resumirProduto(vendas: VendaDoProduto[]): ResumoDoProduto | null {
    if (!vendas || vendas.length === 0) return null;

    const precos = vendas.map(v => v.valorUnit).sort((a, b) => a - b);
    const quantidadeTotal = vendas.reduce((s, v) => s + v.quantidade, 0);

    const meio = Math.floor(precos.length / 2);
    const mediana = precos.length % 2 === 1
        ? precos[meio]
        : (precos[meio - 1] + precos[meio]) / 2;

    const fechadas = vendas.filter(v => v.fechado);
    const abertas = vendas.filter(v => !v.fechado);

    // O preço da mesma peça muda com a cor (a cartela tem faixas), então cada
    // cor tem a sua média — sem isso a média geral esconde a diferença entre
    // branco e cor especial e vira um número que não vale para nenhuma das duas.
    const linhasPorCor = new Map<string, VendaDoProduto[]>();
    for (const v of vendas) {
        if (!v.cor) continue;
        const chave = v.cor.toUpperCase();
        const lista = linhasPorCor.get(chave) || [];
        lista.push(v);
        linhasPorCor.set(chave, lista);
    }
    const cores: CorPraticada[] = [...linhasPorCor.entries()].map(([cor, linhas]) => {
        const p = linhas.map(l => l.valorUnit);
        return {
            cor,
            quantidade: linhas.reduce((s, l) => s + l.quantidade, 0),
            ocorrencias: linhas.length,
            valorMedio: mediaPonderada(linhas)!,   // lista nunca vazia aqui
            menor: Math.min(...p),
            maior: Math.max(...p),
        };
    });

    // `vendas` já vem ordenada por data desc, então a primeira é a mais recente.
    const recente = vendas[0];

    return {
        menor: precos[0],
        maior: precos[precos.length - 1],
        medio: mediaPonderada(vendas)!,
        medioFechado: mediaPonderada(fechadas),
        medioAberto: mediaPonderada(abertas),
        mediana: arredondar2(mediana),
        ultimo: recente.valorUnit,
        ultimaData: recente.data,
        quantidadeTotal,
        clientes: new Set(vendas.map(v => v.clienteId).filter(Boolean)).size,
        ocorrencias: vendas.length,
        fechados: fechadas.length,
        abertos: abertas.length,
        cores: cores.sort((a, b) => b.quantidade - a.quantidade || b.ocorrencias - a.ocorrencias),
        vendas,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preço: banda realizada e resposta ao desconto
//
// A primeira versão desta análise estimava a curva de demanda do produto
// regredindo "fechou / não fechou" contra o preço absoluto. Deu errado em uso
// real, e o erro tem nome: o preço aqui é ENDÓGENO. Ele não é escolhido para
// testar o mercado — é consequência da especificação (tecido, faixa da cor,
// tamanho do bordado ou silk, volume). Comparar uma orçada de R$ 32,50 com uma
// de R$ 59,00 é comparar duas peças diferentes, e a "curva" que sai daí chega a
// inverter de sinal. É o problema de identificação que Working (1927) descreveu
// ao perguntar o que as curvas de demanda estatísticas de fato mostram, e que a
// literatura moderna de demanda trata com instrumentos (Berry, Levinsohn &
// Pakes, 1995) — instrumentos que aqui não existem.
//
// O que a literatura de pricing B2B oferece no lugar, e é o que está implementado:
//
//  1. BANDA DE PREÇO REALIZADO (Marn & Rosiello, "Managing Price, Gaining
//     Profit", Harvard Business Review, 1992). Normaliza cada venda pelo preço de
//     tabela e olha a DISPERSÃO. Não estima nada: é aritmética sobre o que já
//     aconteceu. A conclusão prática costuma ser que a banda é bem mais larga do
//     que se imagina e que o dinheiro vaza na cauda de baixo.
//
//  2. RESPOSTA AO DESCONTO (Phillips, "Pricing and Revenue Optimization",
//     Stanford University Press, 2005, cap. de customized pricing). A função de
//     resposta a lance é estimada sobre o preço RELATIVO à tabela, não sobre o
//     absoluto, justamente porque os negócios diferem entre si. E o objetivo é
//     (preço − custo) × P(fecha): margem, não faturamento.
//
// O detalhe que faz o T1 valer: dentro de um produto, preço/T1 é transformação
// monotônica do preço e não muda nada. ENTRE produtos, muda tudo — o T1 absorve
// a especificação, e aí as orçadas da casa inteira entram na mesma conta. A
// curva passa a ser estimada sobre centenas de linhas em vez das poucas dezenas
// de um produto só.
//
// A suposição que sobra, e que não dá para eliminar: a casa desconta de forma
// parecida em produtos diferentes. É forte, mas é explícita — e muito melhor
// identificada do que ler uma curva em 37 pontos onde o preço é a especificação.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quanto se desconta da taxa observada por causa do tamanho da amostra
 * (z do limite inferior de Wilson). z = 1 ≈ 84% de confiança de um lado.
 *
 * O limite de Wilson desconta pela incerteza, então 1 de 1 vira ~50% (não sei
 * quase nada) e 8 de 8 vira ~89% (aí sim eu sei). É o mesmo cálculo que se usa
 * para ordenar avaliações com poucos votos, e resolve o mesmo problema.
 */
const Z_INCERTEZA = 1;

/**
 * Taxa de fechamento descontada a incerteza da amostra.
 *
 * Sempre menor que a taxa crua, e a diferença encolhe conforme a amostra cresce.
 * Uma faixa só ganha da outra quando tem evidência, não quando teve sorte.
 */
export function taxaConfiavel(fechados: number, linhas: number): number {
    if (linhas <= 0) return 0;
    const p = fechados / linhas;
    const z2 = Z_INCERTEZA * Z_INCERTEZA;
    const centro = p + z2 / (2 * linhas);
    const margem = Z_INCERTEZA * Math.sqrt(p * (1 - p) / linhas + z2 / (4 * linhas * linhas));
    const limite = (centro - margem) / (1 + z2 / linhas);
    return Math.max(0, Math.min(1, limite));
}

/** Preço de tabela e custo do produto — o que o cadastro sabe sobre o preço. */
export interface ReferenciaDePreco {
    /** T1, o preço de tabela. É a base da normalização; sem ele não há índice. */
    lista?: number | null;
    /** Pisos autorizados. Servem de cerca: a sugestão não desce abaixo deles. */
    tier2?: number | null;
    tier3?: number | null;
    /** CMV por peça. Com ele o objetivo vira margem; sem ele, faturamento. */
    custo?: number | null;
}

/** Uma linha de orçamento medida em "% da tabela" em vez de em reais. */
export interface LinhaNormalizada {
    productId: string;
    /** preço ÷ tabela. 0,85 = saiu por 85% do T1. */
    indice: number;
    preco: number;
    quantidade: number;
    fechado: boolean;
}

/**
 * Todas as orçadas da casa medidas em % da tabela do próprio produto.
 *
 * Produto sem T1 cadastrado fica de fora: sem tabela não há como normalizar, e
 * inventar uma referência (a média do próprio produto, por exemplo) faria o
 * índice medir a dispersão interna em vez do desconto — que é outra coisa.
 */
export function linhasNormalizadas(
    orcamentos: OrcamentoDoHistorico[],
    listaPorProduto: Map<string, number>,
    excluirOrcamentoId?: string,
): LinhaNormalizada[] {
    const linhas: LinhaNormalizada[] = [];
    for (const o of orcamentos || []) {
        if (excluirOrcamentoId && o.id === excluirOrcamentoId) continue;
        const fechado = STATUS_FECHADO.includes(o.status || '');
        for (const it of o.items || []) {
            const id = it.product_id;
            if (!id) continue;
            const preco = Number(it.unit_price) || 0;
            if (preco <= 0) continue;
            const lista = listaPorProduto.get(id) || 0;
            if (lista <= 0) continue;
            linhas.push({
                productId: id,
                indice: preco / lista,
                preco,
                quantidade: Number(it.quantity) || 0,
                fechado,
            });
        }
    }
    return linhas;
}

// ─── banda de preço realizado ────────────────────────────────────────────────

/**
 * Percentil ponderado pela quantidade.
 *
 * Ponderado porque o que interessa é onde está o VOLUME: um pedido de 300 peças
 * a 70% da tabela pesa muito mais no bolso do que uma amostra de 5 peças no
 * mesmo desconto, e um percentil por linha trataria os dois igual.
 */
function percentilPonderado(pontos: { valor: number; peso: number }[], p: number): number {
    if (!pontos.length) return 0;
    const ord = [...pontos].sort((a, b) => a.valor - b.valor);
    const total = ord.reduce((s, x) => s + x.peso, 0);
    if (total <= 0) {
        const i = Math.min(ord.length - 1, Math.max(0, Math.round(p * (ord.length - 1))));
        return ord[i].valor;
    }
    const alvo = p * total;
    let acumulado = 0;
    for (const x of ord) {
        acumulado += x.peso;
        if (acumulado >= alvo) return x.valor;
    }
    return ord[ord.length - 1].valor;
}

export interface BandaRealizada {
    lista: number;
    /** Índices (fração da tabela) nos percentis de volume. */
    p10: number;
    p25: number;
    mediana: number;
    p75: number;
    p90: number;
    /** p75 − p25, em pontos percentuais. A "largura da banda". */
    largura: number;
    /** Vendas fechadas que saíram abaixo da mediana. */
    linhasAbaixo: number;
    pecasAbaixo: number;
    /**
     * Quanto teria entrado a mais se essas vendas tivessem saído na mediana.
     * Não é previsão: é a diferença aritmética sobre pedidos que já aconteceram.
     */
    vazamento: number;
    /** Quantas vendas fechadas sustentam a banda. */
    base: number;
}

/**
 * A banda de preço realizado do produto — a análise de Marn & Rosiello.
 *
 * Só VENDAS FECHADAS entram: a banda descreve o preço que o dinheiro de fato
 * atravessou. Orçamento perdido não é preço realizado, e incluí-lo mediria a
 * intenção, não a prática.
 *
 * Sempre calculável quando há tabela e venda fechada — não depende de curva
 * nenhuma, e por isso é o que continua de pé quando a sugestão se recusa a
 * opinar.
 */
export function bandaRealizada(
    vendas: VendaDoProduto[],
    lista: number | null | undefined,
): BandaRealizada | null {
    const base = Number(lista) || 0;
    if (base <= 0) return null;

    const fechadas = (vendas || []).filter(v => v.fechado && v.valorUnit > 0);
    if (fechadas.length < 2) return null;

    const pontos = fechadas.map(v => ({ valor: v.valorUnit / base, peso: v.quantidade }));
    const mediana = percentilPonderado(pontos, 0.5);

    const abaixo = fechadas.filter(v => v.valorUnit / base < mediana);
    const vazamento = abaixo.reduce(
        (s, v) => s + (mediana - v.valorUnit / base) * base * v.quantidade, 0);

    const p25 = percentilPonderado(pontos, 0.25);
    const p75 = percentilPonderado(pontos, 0.75);

    return {
        lista: base,
        p10: percentilPonderado(pontos, 0.10),
        p25,
        mediana,
        p75,
        p90: percentilPonderado(pontos, 0.90),
        largura: Math.round((p75 - p25) * 1000) / 10,
        linhasAbaixo: abaixo.length,
        pecasAbaixo: abaixo.reduce((s, v) => s + v.quantidade, 0),
        vazamento: arredondar2(vazamento),
        base: fechadas.length,
    };
}

/**
 * O preço mediano que o produto de fato alcança, ponderado por volume.
 *
 * É o número que falta na calculadora de custo: ela projeta um T1 a partir do
 * custo e nunca confronta com o que a peça consegue no mercado. Mediana, e não
 * média, porque um pedido atípico não pode mover a referência; ponderada por
 * quantidade porque o que importa é onde está o volume.
 *
 * Só vendas fechadas — orçamento perdido não é preço alcançado.
 */
export function medianaDeFechados(vendas: VendaDoProduto[]): number | null {
    const fechadas = (vendas || []).filter(v => v.fechado && v.valorUnit > 0);
    if (fechadas.length === 0) return null;
    return arredondar2(percentilPonderado(
        fechadas.map(v => ({ valor: v.valorUnit, peso: v.quantidade })), 0.5));
}

// ─── curva de resposta ao desconto ───────────────────────────────────────────

/**
 * Cortes fixos, e não quantis, para as faixas de desconto.
 *
 * Fixos porque significam alguma coisa para quem lê: "90 a 95% da tabela" é uma
 * frase; "terceiro quintil do índice" não é. E porque quantis mudam de fronteira
 * a cada orçamento novo, o que faria a curva parecer instável sem ter mudado.
 */
const CORTES_DE_INDICE = [0.80, 0.90, 0.95, 1.00];

/** Abaixo disto uma faixa da curva é anedota; funde-se com a vizinha. */
const MINIMO_POR_FAIXA_DESCONTO = 8;

/** Amostra mínima da casa inteira para a curva valer a pena. */
const MINIMO_PARA_CURVA = 30;

export interface FaixaDeDesconto {
    /** Fronteiras em fração da tabela. O topo da última é Infinity. */
    indiceMin: number;
    indiceMax: number;
    /** Índice representativo — mediana observada, que resiste a extremo. */
    indice: number;
    linhas: number;
    fechados: number;
    /** fechados ÷ linhas, cru. É o que aconteceu. */
    taxa: number;
    /** A taxa descontada da incerteza da amostra; é ela que entra na conta. */
    taxaSegura: number;
}

/**
 * Quanto a casa fecha em cada profundidade de desconto.
 *
 * Estimada sobre TODOS os produtos com tabela, não sobre um: é o que dá amostra
 * suficiente para a taxa significar algo. A taxa é por linha de orçamento — quem
 * fecha ou não é o orçamento, e ponderar por quantidade deixaria um pedido
 * grande definir sozinho a faixa.
 */
export function curvaDeDesconto(linhas: LinhaNormalizada[]): FaixaDeDesconto[] | null {
    if (!linhas || linhas.length < MINIMO_PARA_CURVA) return null;

    const fronteiras = [0, ...CORTES_DE_INDICE, Infinity];
    let baldes: LinhaNormalizada[][] = [];
    for (let i = 0; i < fronteiras.length - 1; i++) {
        baldes.push(linhas.filter(l => l.indice >= fronteiras[i] && l.indice < fronteiras[i + 1]));
    }
    let limites = fronteiras.slice(0, -1).map((min, i) => ({ min, max: fronteiras[i + 1] }));

    // Balde magro não vira faixa: funde com o vizinho de menor amostra, que é
    // quem menos perde ao ser diluído.
    for (let i = baldes.length - 1; i >= 0; i--) {
        if (baldes.length <= 1) break;
        if (baldes[i].length >= MINIMO_POR_FAIXA_DESCONTO) continue;
        const anterior = i > 0 ? baldes[i - 1].length : Infinity;
        const seguinte = i < baldes.length - 1 ? baldes[i + 1].length : Infinity;
        const j = anterior <= seguinte ? i - 1 : i + 1;
        const a = Math.min(i, j);
        const b = Math.max(i, j);
        baldes[a] = baldes[a].concat(baldes[b]);
        limites[a] = { min: limites[a].min, max: limites[b].max };
        baldes.splice(b, 1);
        limites.splice(b, 1);
        i = Math.min(i, baldes.length);
    }

    baldes = baldes.filter(b => b.length > 0);
    if (baldes.length < 2) return null;

    return baldes.map((b, i) => {
        const fechados = b.filter(l => l.fechado).length;
        const indices = b.map(l => ({ valor: l.indice, peso: 1 }));
        return {
            indiceMin: limites[i].min,
            indiceMax: limites[i].max,
            indice: percentilPonderado(indices, 0.5),
            linhas: b.length,
            fechados,
            taxa: arredondar2(fechados / b.length),
            taxaSegura: arredondar2(taxaConfiavel(fechados, b.length)),
        };
    });
}

// ─── sugestão ────────────────────────────────────────────────────────────────

/**
 * Folga antes de chamar a curva de incoerente.
 *
 * Uma faixa com desconto maior fechar um pouco menos que uma com desconto menor
 * é ruído normal. Só a partir de 15 pontos percentuais a diferença deixa de
 * caber no acaso e passa a dizer que o desconto não é o que move o fechamento.
 */
const TOLERANCIA_DE_INVERSAO = 0.15;

export interface FaixaAvaliada extends FaixaDeDesconto {
    /** O que esta faixa significa em reais PARA ESTE produto. */
    preco: number;
    /** (preço − custo) × taxaSegura, ou preço × taxaSegura quando não há custo. */
    retorno: number;
    /** O mesmo em escala legível: a cada 100 peças orçadas. */
    porCem: number;
    /** Preço abaixo do custo — faixa descartada da otimização. */
    abaixoDoCusto: boolean;
}

export interface SugestaoDePreco {
    preco: number;
    faixa: FaixaAvaliada;
    faixas: FaixaAvaliada[];
    lista: number;
    /** Média ponderada já praticada neste produto. */
    precoHoje: number;
    diferenca: number;
    /** Retorno esperado a mais por peça orçada. */
    ganho: number;
    porCem: number;
    porCemHoje: number;
    /** Falso quando não havia CMV e a conta caiu para faturamento. */
    usouMargem: boolean;
    /** A sugestão bateu na cerca do T1 ou do piso e foi aparada. */
    limitadoPelaTabela: boolean;
    /** Quantas linhas de orçamento sustentam a curva. */
    baseDaCurva: number;
    confianca: 'baixa' | 'media' | 'alta';
    memoria: string;
}

export type ResultadoDaSugestao =
    | { ok: true; sugestao: SugestaoDePreco }
    /** `faixas` vem junto quando existe curva para mostrar, mesmo sem sugestão. */
    | { ok: false; motivo: string; faixas?: FaixaAvaliada[] };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const reais = (n: number) =>
    `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cheio = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const faixaEmTexto = (f: FaixaDeDesconto) =>
    f.indiceMax === Infinity ? `acima de ${pct(f.indiceMin)} da tabela`
        : f.indiceMin === 0 ? `abaixo de ${pct(f.indiceMax)} da tabela`
            : `${pct(f.indiceMin)} a ${pct(f.indiceMax)} da tabela`;

/**
 * Procura a evidência de que o desconto NÃO é o que decide o fechamento.
 *
 * A otimização parte de uma suposição: descontar mais fecha mais. Quando os
 * dados mostram o contrário — uma faixa de desconto maior fechando bem menos que
 * uma de desconto menor —, a suposição caiu e maximizar preço × taxa vira
 * extrapolação de uma curva que não existe.
 */
function inversaoNaCurva(
    faixas: FaixaAvaliada[],
    melhor: FaixaAvaliada,
): FaixaAvaliada | null {
    for (const f of faixas) {
        if (f.indice >= melhor.indice) continue;
        if (f.taxa < melhor.taxa - TOLERANCIA_DE_INVERSAO) return f;
    }
    return null;
}

/**
 * O preço que maximiza a margem esperada por peça orçada.
 *
 * Objetivo (Phillips, 2005): (preço − custo) × P(fecha). Sem CMV cadastrado a
 * conta cai para faturamento e a frase avisa — maximizar faturamento pode
 * recomendar preço que não paga o custo, e é melhor dizer isso que esconder.
 *
 * A curva vem de fora porque é da CASA, não do produto: quem chama monta uma vez
 * e reusa em todas as linhas da tela.
 */
export function sugerirPrecoDeFechamento(
    vendas: VendaDoProduto[],
    curva: FaixaDeDesconto[] | null | undefined,
    ref: ReferenciaDePreco | null | undefined,
): ResultadoDaSugestao {
    const lista = Number(ref?.lista) || 0;
    if (lista <= 0) {
        return {
            ok: false,
            motivo: 'Sem preço T1 cadastrado neste produto não há tabela para comparar — é o T1 que põe as orçadas da casa toda na mesma régua.',
        };
    }
    if (!curva || curva.length < 2) {
        return {
            ok: false,
            motivo: `Ainda não há orçamentos suficientes na casa para estimar quanto o desconto mexe no fechamento (mínimo ${MINIMO_PARA_CURVA} linhas com preço de tabela).`,
        };
    }

    const custo = Number(ref?.custo) || 0;
    const usouMargem = custo > 0;

    const faixas: FaixaAvaliada[] = curva.map(f => {
        const preco = arredondar2(lista * f.indice);
        const base = usouMargem ? preco - custo : preco;
        const retorno = arredondar2(Math.max(0, base) * f.taxaSegura);
        return {
            ...f,
            preco,
            retorno,
            porCem: Math.round(retorno * 100),
            abaixoDoCusto: usouMargem && preco <= custo,
        };
    });

    const candidatas = faixas.filter(f => !f.abaixoDoCusto);
    if (candidatas.length === 0) {
        return {
            ok: false,
            faixas,
            motivo: `Todas as faixas ficam abaixo do CMV de ${reais(custo)} — o problema aqui é custo ou tabela, não desconto.`,
        };
    }

    // Empate no retorno vai para o preço mais alto: mesma expectativa com menos
    // peças produzidas é menos trabalho para o mesmo dinheiro.
    const melhor = candidatas.reduce((a, b) =>
        b.retorno > a.retorno || (b.retorno === a.retorno && b.preco > a.preco) ? b : a);

    const invertida = inversaoNaCurva(candidatas, melhor);
    if (invertida) {
        return {
            ok: false,
            faixas,
            motivo: `O fechamento não melhora com desconto: a faixa de ${faixaEmTexto(invertida)} fechou `
                + `${invertida.fechados} de ${invertida.linhas} e a de ${faixaEmTexto(melhor)} fechou `
                + `${melhor.fechados} de ${melhor.linhas}. Sem essa relação não há o que otimizar — `
                + `o que decide o fechamento aqui é outra coisa.`,
        };
    }

    // ── O piso: o que este produto JÁ conseguiu ────────────────────────────
    //
    // A conta só pode recomendar para CIMA. O risco é assimétrico: errar para
    // cima faz perder um orçamento, e você descobre na hora; errar para baixo
    // corta margem que já era capturada, e isso não aparece em lugar nenhum.
    //
    // E há um motivo mais duro. A curva da casa diz que desconto maior fecha
    // mais — o que é em parte mecânico e em parte confundido: pedido grande
    // ganha desconto maior E fecha mais porque o comprador é sério. Otimizar
    // sobre isso empurra o preço para baixo por construção. Como conselho de
    // alta o viés é conservador; como conselho de baixa, é destrutivo.
    const fechadas = (vendas || []).filter(v => v.fechado && v.valorUnit > 0);
    const medianaRealizada = fechadas.length
        ? percentilPonderado(fechadas.map(v => ({ valor: v.valorUnit, peso: v.quantidade })), 0.5)
        : 0;
    const pisoRealizado = fechadas.length ? Math.min(...fechadas.map(v => v.valorUnit)) : 0;
    const precoHoje = mediaPonderada(vendas) ?? lista;

    // Nada abaixo do que a peça já consegue hoje. Se o ótimo da curva cai aqui
    // dentro, a leitura correta não é "corte o preço" — é "esta peça já sai
    // acima do que a curva sustentaria, e não há alta a propor".
    const jaConseguido = Math.max(medianaRealizada, precoHoje);
    if (jaConseguido > 0 && melhor.preco <= jaConseguido) {
        return {
            ok: false,
            faixas,
            motivo: `A curva da casa aponta ${reais(melhor.preco)}, abaixo do que esta peça já pratica`
                + (medianaRealizada > 0 ? ` (mediana fechada ${reais(medianaRealizada)}, menor ${reais(pisoRealizado)})` : '')
                + `. Isso NÃO é recomendação de baixar: quer dizer que a peça já sai acima do que a curva `
                + `sustentaria, e cortar seria abrir mão de margem que você já captura. Não há espaço de alta aqui.`,
        };
    }

    // Cerca: a sugestão não passa do T1, não desce abaixo do menor piso
    // cadastrado nem abaixo do que já foi fechado. Sair da própria tabela é
    // decisão de gente, não de conta.
    const pisoCadastrado = [ref?.tier2, ref?.tier3].map(t => Number(t) || 0).filter(t => t > 0);
    const piso = Math.max(
        jaConseguido,
        pisoCadastrado.length ? Math.min(...pisoCadastrado, lista) : 0,
    );
    let preco = melhor.preco;
    let limitadoPelaTabela = false;
    if (preco > lista) { preco = lista; limitadoPelaTabela = true; }
    if (piso > 0 && preco < piso) { preco = piso; limitadoPelaTabela = true; }
    const indiceHoje = precoHoje / lista;
    const faixaDeHoje = faixas.find(f => indiceHoje >= f.indiceMin && indiceHoje < f.indiceMax)
        || faixas.reduce((a, b) => Math.abs(b.indice - indiceHoje) < Math.abs(a.indice - indiceHoje) ? b : a);

    const ganho = arredondar2(melhor.retorno - faixaDeHoje.retorno);
    const baseDaCurva = curva.reduce((s, f) => s + f.linhas, 0);

    const confianca: SugestaoDePreco['confianca'] =
        melhor.linhas >= 40 ? 'alta' : melhor.linhas >= 15 ? 'media' : 'baixa';

    const unidade = usouMargem ? 'de margem' : 'de faturamento';
    let memoria: string;
    if (limitadoPelaTabela) {
        memoria = `A conta apontou ${reais(melhor.preco)}; a sugestão foi aparada na sua própria tabela. `
            + `Na faixa de ${faixaEmTexto(melhor)} a casa fechou ${melhor.fechados} de ${melhor.linhas}.`;
    } else if (ganho <= 0) {
        memoria = `O preço médio de hoje já está na melhor faixa (${faixaEmTexto(faixaDeHoje)}), `
            + `onde a casa fecha ${faixaDeHoje.fechados} de ${faixaDeHoje.linhas} e rende `
            + `${cheio(faixaDeHoje.porCem)} ${unidade} a cada 100 peças orçadas.`;
    } else {
        memoria = `A ${faixaEmTexto(melhor)} a casa fechou ${melhor.fechados} de ${melhor.linhas} orçamentos. `
            + `Aplicado ao T1 deste produto dá ${reais(melhor.preco)}, que rende ${cheio(melhor.porCem)} `
            + `${unidade} a cada 100 peças orçadas — contra ${cheio(faixaDeHoje.porCem)} no seu médio de hoje (${reais(precoHoje)}).`;
    }
    if (!usouMargem) {
        memoria += ' Sem CMV cadastrado a conta maximiza faturamento, não margem.';
    }

    return {
        ok: true,
        sugestao: {
            preco,
            faixa: melhor,
            faixas,
            lista,
            precoHoje,
            diferenca: arredondar2(preco - precoHoje),
            ganho,
            porCem: melhor.porCem,
            porCemHoje: faixaDeHoje.porCem,
            usouMargem,
            limitadoPelaTabela,
            baseDaCurva,
            confianca,
            memoria,
        },
    };
}
/**
 * Índice produto → histórico, montado de uma vez.
 *
 * A tabela do orçamento tem uma linha por peça e cada uma quer o seu histórico;
 * varrer todos os orçamentos por linha seria repetir a mesma varredura N vezes
 * para o mesmo resultado.
 */
export function historicoPorProduto(
    orcamentos: OrcamentoDoHistorico[],
    nomeDoCliente: (clientId?: string) => string,
    excluirOrcamentoId?: string,
    /**
     * Traduz o produto do orçamento para o cadastro oficial, quando a mesma
     * peça foi cadastrada mais de uma vez com nomes diferentes. Sem isto o
     * histórico sai repartido entre os cadastros e nenhum tem amostra.
     */
    canonicalDe?: (productId: string) => string,
): Map<string, VendaDoProduto[]> {
    const mapa = new Map<string, VendaDoProduto[]>();

    for (const o of orcamentos || []) {
        if (excluirOrcamentoId && o.id === excluirOrcamentoId) continue;
        for (const it of o.items || []) {
            const bruto = it.product_id;
            if (!bruto) continue;
            const id = canonicalDe ? canonicalDe(bruto) : bruto;
            const valorUnit = Number(it.unit_price) || 0;
            if (valorUnit <= 0) continue;
            const lista = mapa.get(id) || [];
            lista.push({
                orcamentoId: o.id,
                serial: o.serial_number || '',
                data: (o.date || '').slice(0, 10),
                clienteId: o.client_id || '',
                cliente: nomeDoCliente(o.client_id),
                cor: (it.color || '').trim(),
                tamanho: (it.size || '').trim(),
                tecido: (it.fabric_name || it.fabric || '').trim(),
                quantidade: Number(it.quantity) || 0,
                valorUnit,
                status: o.status || '',
                fechado: STATUS_FECHADO.includes(o.status || ''),
            });
            mapa.set(id, lista);
        }
    }

    for (const lista of mapa.values()) {
        lista.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    }
    return mapa;
}

/** Rótulo curto do status, para caber ao lado do valor. */
export const ROTULO_STATUS: Record<string, string> = {
    Draft: 'Rascunho',
    Sent: 'Enviado',
    Approved: 'Aprovado',
    Converted: 'Pedido',
};

/**
 * Onde o preço que está sendo digitado cai dentro do histórico.
 *
 * Serve para dizer "está abaixo do que você já cobrou" sem impedir nada: quem
 * decide o preço é quem está orçando, a caixa só mostra o retrovisor.
 */
export function posicaoNoHistorico(
    preco: number,
    resumo: ResumoDoProduto | null,
): 'abaixo' | 'acima' | 'dentro' | null {
    if (!resumo || !preco || preco <= 0) return null;
    if (preco < resumo.menor) return 'abaixo';
    if (preco > resumo.maior) return 'acima';
    return 'dentro';
}
