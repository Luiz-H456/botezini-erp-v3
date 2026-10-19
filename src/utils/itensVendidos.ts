// Itens vendidos — uma linha por peça vendida, com valor, cor, característica,
// empresa, quantidade e data. Sem imports, para ser testado direto.
//
// De onde vem cada coisa: o PEDIDO é a venda, mas ao ser gerado a partir do
// orçamento ele COPIA os itens e descarta `unit_price`. O preço, portanto, só
// existe no orçamento — e é preciso reencontrar, para cada item do pedido, a
// linha de orçamento que lhe deu origem. É a parte frágil, e é por isso que
// mora aqui, isolada e testada.

export interface ItemVendido {
    product_id?: string;
    product_name?: string;
    /** Tecido escolhido na linha, quando veio do cadastro e não digitado à mão. */
    fabric_insumo_id?: string;
    quantity?: number;
    size?: string;
    color?: string;
    fabric_name?: string;
    fabric?: string;
    sleeve_type?: string;
    gender?: string;
    fit?: string;
    has_band?: boolean;
}

export interface ItemOrcado extends ItemVendido {
    unit_price?: number;
}

export interface PedidoVendido {
    id: string;
    order_number: string;
    client_id?: string;
    budget_id?: string;
    status?: string;
    created_at?: string;
    deadline?: string;
    items?: ItemVendido[];
}

export interface OrcamentoRef {
    id: string;
    items?: ItemOrcado[];
}

export interface LinhaVendida {
    order_id: string;
    pedido: string;
    data: string;              // ISO (aaaa-mm-dd)
    empresa: string;
    produto: string;
    /**
     * Ids do cadastro, quando existem.
     *
     * O nome basta para ler a linha, mas não para ligá-la ao cadastro: dois
     * produtos podem se chamar quase igual, e o nome digitado à mão não aponta
     * para lugar nenhum. Quem precisa cruzar com ficha técnica ou custo usa o
     * id — e `undefined` aqui é informação: significa item fora do cadastro.
     */
    produtoId?: string;
    tecidoId?: string;
    cor: string;
    tecido: string;
    tamanho: string;
    caracteristicas: string[]; // manga, gênero, modelagem, faixa
    quantidade: number;
    valorUnit: number;
    valorTotal: number;
    /** false quando não se achou a linha de orçamento — o valor é 0, não zero real. */
    precoConhecido: boolean;
}

const ROTULO_MANGA: Record<string, string> = {
    manga_curta: 'Manga curta', manga_longa: 'Manga longa',
    sem_manga: 'Sem manga', outro: 'Manga (outro)',
};
const ROTULO_GENERO: Record<string, string> = {
    masculino: 'Masc', feminino: 'Fem', infantil: 'Infantil', unissex: 'Unissex',
};
const ROTULO_FIT: Record<string, string> = {
    slim: 'Slim', regular: 'Regular', oversized: 'Oversized',
    babylook: 'Babylook', plus_size: 'Plus size',
};

/** As características que descrevem a peça, já em texto de tela. */
export function caracteristicasDoItem(it: ItemVendido): string[] {
    const c: string[] = [];
    if (it.sleeve_type && ROTULO_MANGA[it.sleeve_type]) c.push(ROTULO_MANGA[it.sleeve_type]);
    if (it.gender && ROTULO_GENERO[it.gender]) c.push(ROTULO_GENERO[it.gender]);
    if (it.fit && ROTULO_FIT[it.fit]) c.push(ROTULO_FIT[it.fit]);
    if (it.has_band) c.push('Faixa refletiva');
    return c;
}

const chaveDoItem = (it: ItemVendido) =>
    [it.product_id || '', (it.color || '').toUpperCase(), (it.size || '').toUpperCase()].join('|');

/**
 * Acha o preço unitário daquele item do pedido dentro do orçamento de origem.
 *
 * Primeiro tenta o MESMO ÍNDICE, porque o pedido nasce de um `budget.items.map`
 * — a posição é a correspondência real. Só aceita, porém, se o produto bater:
 * se o orçamento foi editado depois de virar pedido, as posições saem de sincronia
 * e o índice passaria o preço de outra peça, que é pior do que não ter preço.
 *
 * Não batendo, cai para produto+cor+tamanho, que identifica a linha mesmo
 * reordenada. Se ainda assim não achar, devolve `null` — nunca um chute.
 */
export function precoDoItem(
    item: ItemVendido,
    indice: number,
    itensOrcados: ItemOrcado[] | undefined,
): number | null {
    if (!itensOrcados || itensOrcados.length === 0) return null;

    const porIndice = itensOrcados[indice];
    if (porIndice && porIndice.product_id === item.product_id
        && typeof porIndice.unit_price === 'number') {
        return porIndice.unit_price;
    }

    const alvo = chaveDoItem(item);
    const porChave = itensOrcados.find(o => chaveDoItem(o) === alvo && typeof o.unit_price === 'number');
    return porChave ? porChave.unit_price! : null;
}

/** Só a data, sem hora — o relatório agrupa por dia. */
function soData(iso?: string): string {
    return (iso || '').slice(0, 10);
}

/**
 * Achata todos os pedidos em uma linha por item vendido.
 *
 * Pedido sem item nenhum simplesmente não gera linha. A ordem de saída é a dos
 * pedidos recebidos — quem ordena é a tela, que sabe o critério do usuário.
 */
export function montarItensVendidos(
    pedidos: PedidoVendido[],
    orcamentos: OrcamentoRef[],
    nomeDoCliente: (clientId?: string) => string,
): LinhaVendida[] {
    const orcamentoPorId = new Map(orcamentos.map(o => [o.id, o]));
    const linhas: LinhaVendida[] = [];

    for (const p of pedidos) {
        const orc = p.budget_id ? orcamentoPorId.get(p.budget_id) : undefined;
        (p.items || []).forEach((it, i) => {
            const preco = precoDoItem(it, i, orc?.items);
            const qtd = Number(it.quantity) || 0;
            linhas.push({
                order_id: p.id,
                pedido: p.order_number,
                data: soData(p.created_at),
                empresa: nomeDoCliente(p.client_id),
                produto: it.product_name || '—',
                produtoId: it.product_id || undefined,
                tecidoId: it.fabric_insumo_id || undefined,
                cor: it.color || '',
                tecido: it.fabric_name || it.fabric || '',
                tamanho: it.size || '',
                caracteristicas: caracteristicasDoItem(it),
                quantidade: qtd,
                valorUnit: preco ?? 0,
                valorTotal: (preco ?? 0) * qtd,
                precoConhecido: preco !== null,
            });
        });
    }
    return linhas;
}

export type Metrica = 'valor' | 'pecas';

export interface PontoDaSerie {
    /** aaaa-mm */
    chave: string;
    /** mmm/aa, para o eixo */
    rotulo: string;
    valor: number;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Faturamento (ou peças) mês a mês, em ordem cronológica.
 *
 * Meses sem venda entram com zero em vez de sumir: um buraco na sequência faria
 * dois meses distantes virarem barras vizinhas, e a leitura de "está subindo"
 * sairia errada. Linhas sem data ficam de fora — não há onde colocá-las.
 */
export function serieMensal(linhas: LinhaVendida[], metrica: Metrica): PontoDaSerie[] {
    const soma = new Map<string, number>();
    for (const l of linhas) {
        if (!l.data) continue;
        const mes = l.data.slice(0, 7);
        soma.set(mes, (soma.get(mes) || 0) + (metrica === 'valor' ? l.valorTotal : l.quantidade));
    }
    if (soma.size === 0) return [];

    const chaves = [...soma.keys()].sort();
    const [aIni, mIni] = chaves[0].split('-').map(Number);
    const [aFim, mFim] = chaves[chaves.length - 1].split('-').map(Number);

    const pontos: PontoDaSerie[] = [];
    for (let a = aIni, m = mIni; a < aFim || (a === aFim && m <= mFim);) {
        const chave = `${a}-${String(m).padStart(2, '0')}`;
        pontos.push({
            chave,
            rotulo: `${MESES[m - 1]}/${String(a).slice(2)}`,
            valor: soma.get(chave) || 0,
        });
        m++;
        if (m > 12) { m = 1; a++; }
    }
    return pontos;
}

export interface FatiaDoRanking {
    nome: string;
    valor: number;
}

/** Maiores por faturamento ou peças. `limite` corta a cauda longa. */
export function ranking(
    linhas: LinhaVendida[],
    campo: 'produto' | 'empresa',
    metrica: Metrica,
    limite = 8,
): FatiaDoRanking[] {
    const soma = new Map<string, number>();
    for (const l of linhas) {
        const nome = l[campo] || '—';
        soma.set(nome, (soma.get(nome) || 0) + (metrica === 'valor' ? l.valorTotal : l.quantidade));
    }
    return [...soma.entries()]
        .map(([nome, valor]) => ({ nome, valor }))
        .filter(f => f.valor > 0)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, limite);
}

export interface VariacaoDePreco {
    valorUnit: number;
    quantidade: number;
    ocorrencias: number;
}

export interface ResumoProduto {
    produto: string;
    quantidade: number;
    valorTotal: number;
    /** Preços distintos praticados, do mais caro para o mais barato. */
    variacoes: VariacaoDePreco[];
}

/**
 * Agrupa por produto e mostra os preços distintos praticados em cada um.
 *
 * É o que responde "variações de valor": a mesma peça sai por preços
 * diferentes conforme cliente, volume e época, e ver isso lado a lado revela
 * tanto desconto esquecido quanto tabela desatualizada.
 *
 * Linhas sem preço conhecido entram na quantidade mas não viram variação — não
 * dá para chamar de "preço praticado" um valor que não foi encontrado.
 */
export function resumirPorProduto(linhas: LinhaVendida[]): ResumoProduto[] {
    const mapa = new Map<string, ResumoProduto & { porPreco: Map<number, VariacaoDePreco> }>();

    for (const l of linhas) {
        let r = mapa.get(l.produto);
        if (!r) {
            r = { produto: l.produto, quantidade: 0, valorTotal: 0, variacoes: [], porPreco: new Map() };
            mapa.set(l.produto, r);
        }
        r.quantidade += l.quantidade;
        r.valorTotal += l.valorTotal;
        if (l.precoConhecido) {
            const v = r.porPreco.get(l.valorUnit) || { valorUnit: l.valorUnit, quantidade: 0, ocorrencias: 0 };
            v.quantidade += l.quantidade;
            v.ocorrencias += 1;
            r.porPreco.set(l.valorUnit, v);
        }
    }

    return [...mapa.values()]
        .map(r => ({
            produto: r.produto,
            quantidade: r.quantidade,
            valorTotal: r.valorTotal,
            variacoes: [...r.porPreco.values()].sort((a, b) => b.valorUnit - a.valorUnit),
        }))
        .sort((a, b) => b.valorTotal - a.valorTotal);
}
