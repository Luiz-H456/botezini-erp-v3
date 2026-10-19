// Completude do cadastro — o que falta preencher, na ordem em que compensa.
//
// O PROBLEMA
// A maior parte dos insumos está sem custo e boa parte dos produtos sem ficha
// técnica. Uma lista alfabética de tudo que falta é verdadeira e inútil:
// preencher tudo de uma vez não vai acontecer. O que muda o resultado é
// preencher os que TÊM GIRO — e para isso alguém precisa dizer quais são.
//
// A ORDEM É POR IMPACTO
// Cada pendência é pesada pelo que passou por ela: peças vendidas e
// faturamento. O insumo sem custo que aparece em metade dos pedidos vem antes
// do que apareceu uma vez no ano passado. Preencher oito cadastros pode cobrir
// mais da metade do faturamento; preencher os quarenta nunca acontece.
//
// COBERTURA
// Uma peça só é custeável quando o produto tem ficha E todos os insumos que ela
// toca têm custo. Basta um furo para o custo da peça inteira ser um chute — por
// isso a cobertura é medida por peça inteira, não por campo preenchido. É um
// número duro de propósito: ele começa baixo porque a realidade é essa.
//
// Sem imports do app, para ser testado direto com `node --test`.

/** Uma peça vendida, reduzida ao que a completude precisa saber. */
export interface PecaVendida {
    /** Cadastro do produto. Ausente = item digitado à mão, fora do cadastro. */
    produtoId?: string | null;
    produtoNome?: string;
    /** Tecido escolhido na linha, quando veio do cadastro. */
    tecidoId?: string | null;
    quantidade: number;
    faturamento: number;
    /**
     * Falso quando não se achou o preço da linha de orçamento.
     *
     * Faturamento zero por não saber é diferente de faturamento zero de
     * verdade, e somar os dois no mesmo balde faria a cobertura parecer melhor
     * do que é — a peça sem preço entraria como "R$ 0 já descoberto".
     */
    faturamentoConhecido?: boolean;
    /** Para contar pedidos distintos; qualquer chave estável serve. */
    order_id?: string;
}

export interface CadastroPesavel {
    id: string;
    name?: string;
    average_unit_cost?: number | null;
}

export type MotivoDaPendencia = 'sem-ficha' | 'sem-custo';

export interface LinhaPendente {
    id: string;
    nome: string;
    motivo: MotivoDaPendencia;
    /** Peças vendidas que passam por este cadastro. */
    pecas: number;
    /** Faturamento das peças que passam por aqui. */
    faturamento: number;
    /** Pedidos distintos em que apareceu — mede recorrência, não volume. */
    pedidos: number;
    /** Fatia do faturamento conhecido total (0..1). */
    fatia: number;
}

export interface Completude {
    produtosSemFicha: LinhaPendente[];
    insumosSemCusto: LinhaPendente[];

    /** Faturamento de peças inteiramente custeáveis / faturamento conhecido. */
    cobertura: number;
    faturamentoCoberto: number;
    faturamentoConhecido: number;
    /** Peças cujo preço não foi encontrado — ficam fora da conta, não em zero. */
    pecasSemPreco: number;

    produtosPendentes: number;
    insumosPendentes: number;
    /** Pendências que nunca apareceram em pedido — a cauda, contada à parte. */
    pendenciasSemGiro: number;
}

export interface EntradaDaCompletude {
    /** Uma linha por peça vendida (ver utils/itensVendidos). */
    vendas: PecaVendida[];
    produtos: CadastroPesavel[];
    insumos: CadastroPesavel[];
    /** Ficha técnica: produto → insumos que ele consome. Ausente = sem ficha. */
    fichaPorProduto: Map<string, string[]>;
    /**
     * Apelidos: id → id do cadastro oficial. Sem isto o mesmo tecido cadastrado
     * três vezes aparece como três pendências de um terço do peso cada, e some
     * do topo da lista exatamente por estar repartido.
     */
    canonicoDeInsumo?: Map<string, string>;
    canonicoDeProduto?: Map<string, string>;
}

/** Uma venda traduzida em "por onde esta peça passa". */
interface Passagem {
    produtoId: string | null;
    insumoIds: string[];
    pecas: number;
    faturamento: number;
    conhecido: boolean;
    pedidoChave: string;
}

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const oficial = (id: string | null | undefined, mapa?: Map<string, string>): string | null =>
    id ? (mapa?.get(id) || id) : null;

/** Um cadastro tem custo quando o número existe e é positivo. */
export const temCusto = (c: CadastroPesavel | undefined): boolean =>
    !!c && num(c.average_unit_cost) > 0;

/**
 * Acumulador de peso por cadastro.
 *
 * `pedidos` é um Set e não um contador porque duas peças do mesmo pedido não
 * são dois pedidos — a recorrência que interessa é em quantas vendas distintas
 * aquele cadastro apareceu.
 */
interface Peso {
    pecas: number;
    faturamento: number;
    pedidos: Set<string>;
}

const pesoVazio = (): Peso => ({ pecas: 0, faturamento: 0, pedidos: new Set() });

function somar(mapa: Map<string, Peso>, id: string, p: Passagem): void {
    const atual = mapa.get(id) || pesoVazio();
    atual.pecas += p.pecas;
    atual.faturamento += p.faturamento;
    if (p.pedidoChave) atual.pedidos.add(p.pedidoChave);
    mapa.set(id, atual);
}

/**
 * Ordem da lista: faturamento, depois peças, depois nome.
 *
 * Faturamento primeiro porque é o que o custo errado distorce em reais. Peças
 * como desempate porque um cadastro de giro alto e valor baixo ainda é onde o
 * erro se repete mais vezes. Nome por último só para a lista não dançar entre
 * dois recarregamentos com os mesmos números.
 */
export function porImpacto(a: LinhaPendente, b: LinhaPendente): number {
    if (b.faturamento !== a.faturamento) return b.faturamento - a.faturamento;
    if (b.pecas !== a.pecas) return b.pecas - a.pecas;
    return a.nome.localeCompare(b.nome, 'pt-BR');
}

/**
 * O levantamento inteiro.
 *
 * Nada aqui inventa dado: cadastro que nunca apareceu em pedido entra com peso
 * zero e vai para o fim da lista, e peça sem preço conhecido fica fora do
 * denominador da cobertura em vez de entrar como zero.
 */
export function apurarCompletude(entrada: EntradaDaCompletude): Completude {
    const { vendas, produtos, insumos, fichaPorProduto } = entrada;

    const insumoPorId = new Map(insumos.map(i => [i.id, i]));

    // ── 1. Traduzir cada venda em "por onde esta peça passa" ────────────────
    const passagens: Passagem[] = [];
    let semPedido = 0;

    for (const v of vendas) {
        const produtoId = oficial(v.produtoId, entrada.canonicoDeProduto);
        const conhecido = v.faturamentoConhecido !== false;

        const daFicha = produtoId ? (fichaPorProduto.get(produtoId) || []) : [];
        const tecido = oficial(v.tecidoId, entrada.canonicoDeInsumo);

        // O tecido da linha entra junto com os da ficha: ele é escolhido peça a
        // peça e por isso não está na ficha, mas é o insumo de maior peso no
        // custo. Set porque a ficha pode já citá-lo.
        const insumoIds = [...new Set(
            [...daFicha.map(id => oficial(id, entrada.canonicoDeInsumo)), tecido]
                .filter((id): id is string => !!id),
        )];

        passagens.push({
            produtoId,
            insumoIds,
            pecas: num(v.quantidade),
            faturamento: conhecido ? num(v.faturamento) : 0,
            conhecido,
            pedidoChave: v.order_id || `#${semPedido++}`,
        });
    }

    // ── 2. Pesar cada pendência ─────────────────────────────────────────────
    const pesoDoProduto = new Map<string, Peso>();
    const pesoDoInsumo = new Map<string, Peso>();

    let faturamentoConhecido = 0;
    let faturamentoCoberto = 0;
    let pecasSemPreco = 0;

    for (const p of passagens) {
        if (!p.conhecido) { pecasSemPreco += p.pecas; continue; }
        faturamentoConhecido += p.faturamento;

        const temFicha = !!p.produtoId && (fichaPorProduto.get(p.produtoId) || []).length > 0;
        if (p.produtoId && !temFicha) somar(pesoDoProduto, p.produtoId, p);

        let insumoFaltando = false;
        for (const id of p.insumoIds) {
            if (!temCusto(insumoPorId.get(id))) {
                insumoFaltando = true;
                somar(pesoDoInsumo, id, p);
            }
        }

        // A peça só conta como coberta quando dá para custeá-la inteira. Item
        // sem produto cadastrado nunca cobre: não há de onde tirar o custo.
        if (temFicha && !insumoFaltando) faturamentoCoberto += p.faturamento;
    }

    // ── 3. Montar as listas, incluindo quem nunca girou ─────────────────────
    const linha = (
        id: string,
        nome: string,
        motivo: MotivoDaPendencia,
        peso: Peso | undefined,
    ): LinhaPendente => ({
        id,
        nome: nome || '(sem nome)',
        motivo,
        pecas: peso?.pecas || 0,
        faturamento: peso?.faturamento || 0,
        pedidos: peso?.pedidos.size || 0,
        fatia: faturamentoConhecido > 0 ? (peso?.faturamento || 0) / faturamentoConhecido : 0,
    });

    const produtosSemFicha: LinhaPendente[] = [];
    for (const p of produtos) {
        if ((fichaPorProduto.get(p.id) || []).length > 0) continue;
        produtosSemFicha.push(linha(p.id, p.name || '', 'sem-ficha', pesoDoProduto.get(p.id)));
    }

    const insumosSemCusto: LinhaPendente[] = [];
    for (const i of insumos) {
        if (temCusto(i)) continue;
        insumosSemCusto.push(linha(i.id, i.name || '', 'sem-custo', pesoDoInsumo.get(i.id)));
    }

    produtosSemFicha.sort(porImpacto);
    insumosSemCusto.sort(porImpacto);

    const semGiro = [...produtosSemFicha, ...insumosSemCusto].filter(l => l.pecas === 0).length;

    return {
        produtosSemFicha,
        insumosSemCusto,
        cobertura: faturamentoConhecido > 0 ? faturamentoCoberto / faturamentoConhecido : 0,
        faturamentoCoberto,
        faturamentoConhecido,
        pecasSemPreco,
        produtosPendentes: produtosSemFicha.length,
        insumosPendentes: insumosSemCusto.length,
        pendenciasSemGiro: semGiro,
    };
}

/**
 * Quantos cadastros do topo da lista cobrem `alvo` do peso pendente.
 *
 * Responde "preencha estes N e resolve a maior parte" — que é a frase que faz
 * alguém começar, em vez de olhar quarenta linhas e fechar a tela.
 *
 * O faturamento das linhas se sobrepõe (a mesma peça pesa no produto e no
 * tecido), então isto NÃO é uma soma de partes de um todo: é "os N primeiros
 * respondem por esta fatia do que está pendente". A conta é dentro da própria
 * lista, e por isso não se compara com a cobertura.
 */
export function quantosResolvem(linhas: LinhaPendente[], alvo = 0.8): number {
    if (linhas.length === 0) return 0;
    const total = linhas.reduce((s, l) => s + l.faturamento, 0);
    if (total <= 0) return 0;

    let acumulado = 0;
    for (let i = 0; i < linhas.length; i++) {
        acumulado += linhas[i].faturamento;
        if (acumulado / total >= alvo) return i + 1;
    }
    return linhas.length;
}
