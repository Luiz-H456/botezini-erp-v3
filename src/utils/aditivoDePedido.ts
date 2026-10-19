/**
 * Aditivo de pedido e ficha de entrega.
 *
 * O QUE ACONTECE NA VIDA REAL. O orçamento vira pedido com 100 camisas. Na hora
 * de entregar saem 120 — o cliente pediu mais na semana passada, por WhatsApp,
 * e a fábrica fez. Hoje o sistema entrega 120 peças e cobra 100: a diferença
 * mora na memória de quem atendeu, e some quando essa pessoa sai de férias.
 *
 * O aditivo é o registro dessa diferença. Ele não corrige o pedido fingindo que
 * sempre foram 120 — guarda que foram 100 e que 20 entraram depois, com data,
 * motivo e preço. Seis meses depois, quando o cliente perguntar por que a nota
 * deu 6.000 e não 5.000, a resposta está na tela e não na lembrança.
 *
 * POR QUE O PREÇO VIAJA JUNTO COM O ADITIVO. O OrderItem não guarda preço —
 * quem tem unit_price é o BudgetItem, e o pedido só carrega o total. Então a
 * peça acrescentada precisa trazer o preço dela; não dá para inferir do pedido.
 * Sugerir o preço do orçamento é cortesia da tela, mas o que vale é o que ficou
 * gravado no aditivo, porque o preço de hoje pode não ser o de março.
 */

export interface ItemDoAditivo {
    product_id?: string | null;
    product_name: string;
    /** Tamanho é parte da identidade da peça: P e GG são linhas diferentes. */
    size?: string | null;
    quantity: number;
    unit_price: number;
}

export interface ItemEntregue {
    product_name: string;
    size?: string | null;
    /** O que o pedido dizia. */
    quantidadePedida: number;
    /** O que efetivamente saiu. */
    quantidadeEntregue: number;
}

/** Uma linha só do aditivo. Arredonda em centavos, que é a unidade do dinheiro. */
export function totalDoItem(item: ItemDoAditivo): number {
    const q = Number(item.quantity) || 0;
    const p = Number(item.unit_price) || 0;
    return Math.round(q * p * 100) / 100;
}

/**
 * O valor do aditivo inteiro.
 *
 * Soma centavo a centavo e só então devolve, em vez de somar os produtos em
 * ponto flutuante e arredondar no fim: 3 × 33,33 tem de dar 99,99, e não
 * 99,99000000000001 exibido como 99,99 mas somado como outra coisa no total do
 * pedido.
 */
export function totalDoAditivo(itens: ItemDoAditivo[]): number {
    const centavos = (itens || []).reduce((s, i) => s + Math.round(totalDoItem(i) * 100), 0);
    return centavos / 100;
}

export interface ProblemaNoAditivo {
    indice: number;
    campo: 'product_name' | 'quantity' | 'unit_price';
    mensagem: string;
}

/**
 * O que impede de gravar.
 *
 * Quantidade zero e preço zero são recusados por motivos diferentes, e a
 * mensagem diz qual: quantidade zero é linha esquecida; preço zero é o caso
 * perigoso — uma peça de graça registrada por engano, que ninguém percebe
 * porque o total simplesmente não muda. Brinde de verdade se registra como
 * desconto, onde fica visível.
 */
export function problemasDoAditivo(itens: ItemDoAditivo[]): ProblemaNoAditivo[] {
    const problemas: ProblemaNoAditivo[] = [];
    (itens || []).forEach((item, indice) => {
        if (!String(item.product_name || '').trim()) {
            problemas.push({ indice, campo: 'product_name', mensagem: 'Diga que peça é.' });
        }
        const q = Number(item.quantity);
        if (!Number.isFinite(q) || q <= 0) {
            problemas.push({ indice, campo: 'quantity', mensagem: 'Quantidade tem de ser maior que zero.' });
        }
        const p = Number(item.unit_price);
        if (!Number.isFinite(p) || p <= 0) {
            problemas.push({
                indice, campo: 'unit_price',
                mensagem: 'Preço tem de ser maior que zero. Peça sem cobrança é desconto, e desconto se registra na baixa.',
            });
        }
    });
    return problemas;
}

export const aditivoEstaValido = (itens: ItemDoAditivo[]): boolean =>
    (itens || []).length > 0 && problemasDoAditivo(itens).length === 0;

// ── A ficha de entrega ──────────────────────────────────────────────────────

export interface FichaDeEntrega {
    /** Linhas onde saiu quantidade diferente da pedida. */
    divergencias: Array<ItemEntregue & { diferenca: number }>;
    pecasPedidas: number;
    pecasEntregues: number;
    /** Valor original do pedido. */
    valorDoPedido: number;
    /** Soma dos aditivos já gravados. */
    valorDosAditivos: number;
    valorTotal: number;
    valorPago: number;
    /** O que o cliente ainda deve. Negativo quer dizer que pagou a mais. */
    saldoAPagar: number;
    quitado: boolean;
}

/**
 * O papel que vai junto com a mercadoria.
 *
 * Junta as três perguntas que se faz na porta do cliente e que hoje moram em
 * telas diferentes: o que estou entregando, quanto ficou no total, e quanto
 * falta receber.
 *
 * `saldoAPagar` pode vir NEGATIVO de propósito — o cliente que adiantou mais do
 * que devia precisa ver isso na ficha, não descobrir no fim do mês. Zerar em
 * `Math.max(0, ...)` esconderia um crédito que é dele.
 */
export function montarFichaDeEntrega(entrada: {
    itens: ItemEntregue[];
    valorDoPedido: number;
    valorDosAditivos?: number;
    valorPago: number;
}): FichaDeEntrega {
    const itens = entrada.itens || [];

    const divergencias = itens
        .map(i => ({ ...i, diferenca: (Number(i.quantidadeEntregue) || 0) - (Number(i.quantidadePedida) || 0) }))
        .filter(i => i.diferenca !== 0);

    const pecasPedidas = itens.reduce((s, i) => s + (Number(i.quantidadePedida) || 0), 0);
    const pecasEntregues = itens.reduce((s, i) => s + (Number(i.quantidadeEntregue) || 0), 0);

    const valorDoPedido = Number(entrada.valorDoPedido) || 0;
    const valorDosAditivos = Number(entrada.valorDosAditivos) || 0;
    const valorTotal = Math.round((valorDoPedido + valorDosAditivos) * 100) / 100;
    const valorPago = Number(entrada.valorPago) || 0;
    const saldoAPagar = Math.round((valorTotal - valorPago) * 100) / 100;

    return {
        divergencias,
        pecasPedidas,
        pecasEntregues,
        valorDoPedido,
        valorDosAditivos,
        valorTotal,
        valorPago,
        saldoAPagar,
        // Uma diferença de centavo por arredondamento não pode deixar um pedido
        // eternamente "em aberto" por R$ 0,01.
        quitado: saldoAPagar <= 0.005,
    };
}

/**
 * Sugere as linhas do aditivo a partir do que saiu a mais na conferência.
 *
 * Só entra o que saiu A MAIS. Entregar a MENOS não é aditivo negativo: é
 * entrega parcial, e vira outra conversa — abater do pedido por baixa entrega
 * mexeria no contrato sem que ninguém tivesse acordado isso.
 */
export function sugerirItensDoAditivo(
    ficha: FichaDeEntrega,
    precoPorItem: (nome: string, tamanho?: string | null) => number | undefined,
): ItemDoAditivo[] {
    return ficha.divergencias
        .filter(d => d.diferenca > 0)
        .map(d => ({
            product_name: d.product_name,
            size: d.size ?? null,
            quantity: d.diferenca,
            unit_price: precoPorItem(d.product_name, d.size) ?? 0,
        }));
}
