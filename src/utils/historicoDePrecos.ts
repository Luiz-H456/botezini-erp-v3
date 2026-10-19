// Histórico de preço de um insumo, a partir das entradas de estoque.
// Sem imports, testado direto.
//
// DE ONDE VEM O DADO — só as movimentações de ENTRADA (`IN`) com custo unitário
// informado. Saída não tem preço de compra, e entrada sem custo é ajuste de
// inventário, não compra: contá-las como preço zero derrubaria a média e faria
// a tela dizer que o tecido está mais barato quando ninguém comprou nada.
//
// POR QUE NÃO USAR `average_unit_cost` — aquele campo é o custo médio ATUAL,
// mantido por gatilho no banco. Ele responde "quanto vale meu estoque hoje" e
// não "quanto esse insumo vem custando". São perguntas diferentes, e o gráfico
// aqui responde a segunda.

export interface MovimentoDeEntrada {
    id?: string;
    insumo_id: string;
    type: 'IN' | 'OUT';
    quantity: number;
    unit_cost?: number | null;
    total_cost?: number | null;
    created_at?: string;
    notes?: string;
}

export interface CompraDoInsumo {
    id?: string;
    data: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
    notas?: string;
}

export interface HistoricoDeInsumo {
    compras: CompraDoInsumo[];
    /** Média PONDERADA pela quantidade — é o custo médio de compra de verdade. */
    precoMedio: number;
    /** Média simples das compras: útil para ver se um lote grande distorce a ponderada. */
    precoMedioSimples: number;
    menorPreco: number;
    maiorPreco: number;
    ultimoPreco: number;
    primeiroPreco: number;
    /** ultimoPreco − primeiroPreco, em %. `null` com uma compra só. */
    variacaoPct: number | null;
    /** Último preço contra a média ponderada, em %. Positivo = comprando caro. */
    desvioDoMedioPct: number | null;
    quantidadeTotal: number;
    valorTotal: number;
}

/**
 * Compras de um insumo, da mais antiga para a mais recente.
 *
 * Ordem crescente porque o destino é um gráfico de linha no tempo — a lista da
 * tela inverte quando precisa mostrar "as últimas primeiro".
 */
export function comprasDoInsumo(
    movimentos: MovimentoDeEntrada[],
    insumoId: string,
): CompraDoInsumo[] {
    return movimentos
        .filter(m =>
            m.insumo_id === insumoId &&
            m.type === 'IN' &&
            Number(m.unit_cost) > 0 &&
            Number(m.quantity) > 0)
        .map(m => {
            const quantidade = Number(m.quantity);
            const valorUnitario = Number(m.unit_cost);
            return {
                id: m.id,
                data: (m.created_at || '').slice(0, 10),
                quantidade,
                valorUnitario: arredondar2(valorUnitario),
                // O total gravado manda quando existe: quem lançou pode ter
                // digitado frete ou desconto que não cabe no unitário.
                valorTotal: arredondar2(Number(m.total_cost) > 0 ? Number(m.total_cost) : quantidade * valorUnitario),
                notas: m.notes,
            };
        })
        .sort((a, b) => a.data.localeCompare(b.data));
}

export function historicoDeInsumo(
    movimentos: MovimentoDeEntrada[],
    insumoId: string,
): HistoricoDeInsumo | null {
    const compras = comprasDoInsumo(movimentos, insumoId);
    if (compras.length === 0) return null;

    const quantidadeTotal = compras.reduce((s, c) => s + c.quantidade, 0);
    const valorTotal = compras.reduce((s, c) => s + c.valorTotal, 0);
    const unitarios = compras.map(c => c.valorUnitario);

    const precoMedio = arredondar2(valorTotal / quantidadeTotal);
    const primeiroPreco = unitarios[0];
    const ultimoPreco = unitarios[unitarios.length - 1];

    return {
        compras,
        precoMedio,
        precoMedioSimples: arredondar2(unitarios.reduce((s, v) => s + v, 0) / unitarios.length),
        menorPreco: Math.min(...unitarios),
        maiorPreco: Math.max(...unitarios),
        primeiroPreco,
        ultimoPreco,
        variacaoPct: compras.length < 2 || primeiroPreco === 0
            ? null
            : arredondar2(((ultimoPreco - primeiroPreco) / primeiroPreco) * 100),
        desvioDoMedioPct: precoMedio === 0
            ? null
            : arredondar2(((ultimoPreco - precoMedio) / precoMedio) * 100),
        quantidadeTotal: arredondar2(quantidadeTotal),
        valorTotal: arredondar2(valorTotal),
    };
}

export interface PontoDoGrafico {
    data: string;
    /** Rótulo curto para o eixo X. */
    rotulo: string;
    preco: number;
    quantidade: number;
    /** Média ponderada acumulada ATÉ este ponto — a linha de referência. */
    medioAcumulado: number;
}

/**
 * Série para o gráfico de preço no tempo.
 *
 * A média acumulada é ponderada e só olha para trás: no ponto de março ela
 * mostra o que era a média em março, não a média de hoje. Uma linha que já
 * conhece o futuro faria toda compra antiga parecer errada.
 */
export function serieDePrecos(compras: CompraDoInsumo[]): PontoDoGrafico[] {
    let qtdAcum = 0;
    let valorAcum = 0;
    return compras.map(c => {
        qtdAcum += c.quantidade;
        valorAcum += c.valorTotal;
        return {
            data: c.data,
            rotulo: rotuloCurto(c.data),
            preco: c.valorUnitario,
            quantidade: c.quantidade,
            medioAcumulado: qtdAcum > 0 ? arredondar2(valorAcum / qtdAcum) : c.valorUnitario,
        };
    });
}

function rotuloCurto(iso: string): string {
    // "2026-03-15" → "15/03". Data ausente ou torta não vira "NaN/NaN".
    const p = (iso || '').split('-');
    if (p.length < 3) return iso || '—';
    return `${p[2].slice(0, 2)}/${p[1]}`;
}

function arredondar2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
