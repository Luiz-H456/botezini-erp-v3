/**
 * A situação de pagamento de um pedido, somando TODAS as suas parcelas.
 *
 * TRÊS ERROS QUE MORAVAM AQUI
 *
 * 1. A tela achava a conta do pedido por `description.includes('Pedido #N')`.
 *    Isso é busca por pedaço de texto: "Pedido #1" casa com "Pedido #14",
 *    "Pedido #100" e todo mundo que começa com 1. O pedido mostrava a tag do
 *    pedido de outra pessoa.
 *
 * 2. Usava `.find()` — a PRIMEIRA conta encontrada. Um pedido parcelado tem
 *    várias, e a tag passava a significar "a situação de uma parcela qualquer".
 *    Entrada paga e saldo em aberto podia aparecer como LIQUIDADO.
 *
 * 3. Não excluía conta cancelada. Pedido revertido deixa as contas antigas
 *    canceladas no banco, com a mesma descrição — e elas continuavam
 *    concorrendo pela tag.
 *
 * O caminho certo é `order_id`, que é chave de verdade e existe desde a
 * conversão. A descrição só entra como rede de segurança para lançamento
 * antigo, e mesmo aí com casamento EXATO do número, nunca por pedaço.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export type SituacaoDePagamento =
    | 'sem_conta'   // nenhuma conta ligada ao pedido
    | 'open'        // tudo em aberto, nada vencido
    | 'partial'     // recebido em parte
    | 'paid'        // quitado
    | 'overdue'     // tem parcela vencida
    | 'cancelled';  // todas as contas canceladas

export interface ContaDoPedido {
    id: string;
    order_id?: string | null;
    description?: string | null;
    notes?: string | null;
    original_amount: number;
    paid_amount: number;
    remaining_amount: number;
    /** Verdade calculada pelo banco. */
    derived_status?: string | null;
    /** Cópia gravada na tabela — pode estar defasada. */
    status?: string | null;
    cancelled_at?: string | null;
}

export interface PedidoIdentificado {
    id: string;
    order_number: string | number;
}

const centavos = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * A situação real de uma conta.
 *
 * `derived_status` vem primeiro de propósito: é o que a view calcula agora, a
 * partir dos pagamentos. `status` é uma cópia gravada na tabela, atualizada por
 * quem lembrar de atualizar — preferir a cópia sobre o cálculo é escolher o
 * dado velho quando os dois discordam, que é exatamente quando importa.
 */
export const situacaoDaConta = (c: ContaDoPedido): string =>
    (c.cancelled_at ? 'cancelled' : null)
    || c.derived_status
    || c.status
    || 'open';

export const estaCancelada = (c: ContaDoPedido): boolean =>
    situacaoDaConta(c) === 'cancelled';

/**
 * As contas de um pedido — por chave, não por texto.
 *
 * `incluirCanceladas` existe para a tela de detalhe, que deve mostrar o
 * histórico das reversões. A tag da lista nunca as inclui.
 */
export function contasDoPedido(
    contas: ContaDoPedido[] | null | undefined,
    pedido: PedidoIdentificado,
    incluirCanceladas = false,
): ContaDoPedido[] {
    const numero = String(pedido.order_number ?? '').trim();

    const achadas = (contas || []).filter(c => {
        if (c.order_id) return c.order_id === pedido.id;
        // Rede de segurança para lançamento anterior ao campo order_id.
        if (c.notes === pedido.id) return true;
        if (!numero || !c.description) return false;
        // Casamento exato do número: `\b` sozinho deixaria "#1" casar em "#1,5",
        // então o que fecha é "não vir outro dígito depois".
        return new RegExp(`Pedido #${numero}(?!\\d)`).test(c.description);
    });

    return incluirCanceladas ? achadas : achadas.filter(c => !estaCancelada(c));
}

export interface ResumoDoPedido {
    situacao: SituacaoDePagamento;
    /** Quantas contas ativas somam este resumo. */
    parcelas: number;
    /** Quantas dessas estão vencidas. */
    vencidas: number;
    total: number;
    pago: number;
    falta: number;
    /** Contas canceladas encontradas — rastro das reversões. */
    canceladas: number;
    /**
     * Soma das parcelas ativas menos o valor do pedido. Diferente de zero
     * significa que o pedido e o financeiro discordam sobre quanto vale.
     */
    divergencia: number;
}

/**
 * Consolida as parcelas numa situação só.
 *
 * A ordem de precedência é a da conversa com o cliente: vencido é o que se fala
 * primeiro, depois quitado, depois parcial. Uma parcela vencida contamina o
 * pedido inteiro mesmo que as outras estejam em dia — porque é isso que a
 * cobrança precisa ver.
 */
export function resumirPagamentoDoPedido(
    contas: ContaDoPedido[] | null | undefined,
    pedido: PedidoIdentificado,
    totalDoPedido = 0,
): ResumoDoPedido {
    const todas = contasDoPedido(contas, pedido, true);
    const ativas = todas.filter(c => !estaCancelada(c));
    const canceladas = todas.length - ativas.length;

    const total = centavos(ativas.reduce((s, c) => s + (Number(c.original_amount) || 0), 0));
    const pago = centavos(ativas.reduce((s, c) => s + (Number(c.paid_amount) || 0), 0));
    const falta = centavos(total - pago);
    const divergencia = centavos(total - (Number(totalDoPedido) || 0));

    const base = {
        parcelas: ativas.length,
        total, pago, falta, canceladas, divergencia,
    };

    if (ativas.length === 0) {
        return {
            ...base,
            // Pedido cujas contas foram todas canceladas não é "sem conta": a
            // distinção importa, porque um é pedido novo e o outro é reversão.
            situacao: canceladas > 0 ? 'cancelled' : 'sem_conta',
            vencidas: 0,
        };
    }

    const situacoes = ativas.map(situacaoDaConta);
    const vencidas = situacoes.filter(s => s === 'overdue').length;

    let situacao: SituacaoDePagamento;
    if (vencidas > 0) situacao = 'overdue';
    else if (situacoes.every(s => s === 'paid')) situacao = 'paid';
    else if (pago > 0) situacao = 'partial';
    else situacao = 'open';

    return { ...base, situacao, vencidas };
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDePagamento, string> = {
    sem_conta: 'SEM CONTA',
    open: 'EM ABERTO',
    partial: 'PARCIAL',
    paid: 'LIQUIDADO',
    overdue: 'VENCIDA',
    cancelled: 'CANCELADA',
};
