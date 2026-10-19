/**
 * Filtrar contas a pagar e receber por conta bancária.
 *
 * O QUE "PERTENCER A UMA CONTA" SIGNIFICA AQUI
 *
 * Uma obrigação se liga a uma conta bancária por dois caminhos diferentes, e
 * usar só um deles dá um filtro que mente:
 *
 *   default_account_id   a conta PREVISTA, escolhida quando a obrigação foi
 *                        criada. É só um plano — pode nunca se realizar, e na
 *                        base de hoje 454 das 610 obrigações não têm nenhuma.
 *
 *   pagamentos           a conta onde o dinheiro REALMENTE passou. Todo
 *                        pagamento tem uma, sem exceção, porque toda baixa
 *                        mexe num caixa.
 *
 * Filtrar só pela prevista esconderia três quartos das obrigações. Filtrar só
 * pelos pagamentos esconderia tudo que ainda não foi pago — justamente o que
 * alguém procura ao perguntar "o que sai do Nubank este mês".
 *
 * Então vale qualquer um dos dois. Uma obrigação prevista para o cofre mas
 * paga pelo banco aparece nos dois filtros, o que é correto: ela tocou os dois.
 */

export interface ObrigacaoFiltravel {
    id: string;
    default_account_id?: string | null;
}

/**
 * @param contasPorObrigacao  id da obrigação -> contas onde houve movimento.
 *                            Só pagamentos vivos entram; estornado não conta,
 *                            senão uma baixa lançada na conta errada e
 *                            desfeita continuaria puxando a obrigação para o
 *                            filtro daquela conta para sempre.
 */
export function obrigacaoTocaAConta(
    ob: ObrigacaoFiltravel,
    contaId: string,
    contasPorObrigacao: Record<string, string[]>,
): boolean {
    if (!contaId) return true;              // sem filtro escolhido, passa tudo
    if (ob.default_account_id === contaId) return true;
    return (contasPorObrigacao[ob.id] || []).includes(contaId);
}

export function filtrarPorContaBancaria<T extends ObrigacaoFiltravel>(
    obrigacoes: T[],
    contaId: string,
    contasPorObrigacao: Record<string, string[]>,
): T[] {
    if (!contaId) return obrigacoes;
    return obrigacoes.filter(o => obrigacaoTocaAConta(o, contaId, contasPorObrigacao));
}

/**
 * Monta o índice a partir das linhas cruas de obligation_payments.
 *
 * Recebe as linhas em vez de fazer a consulta para poder ser testado sem banco
 * — e porque quem chama já sabe se quer o teto de linhas ou não.
 */
export function indexarContasPorObrigacao(
    pagamentos: Array<{
        obligation_id: string;
        account_id?: string | null;
        reversed_at?: string | null;
        reversal_of?: string | null;
    }>,
): Record<string, string[]> {
    const mapa: Record<string, string[]> = {};
    for (const p of pagamentos) {
        if (p.reversed_at || p.reversal_of) continue;
        if (!p.account_id) continue;
        const lista = mapa[p.obligation_id] || (mapa[p.obligation_id] = []);
        if (!lista.includes(p.account_id)) lista.push(p.account_id);
    }
    return mapa;
}
