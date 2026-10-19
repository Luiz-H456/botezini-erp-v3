/**
 * O que conta como pagamento ativo depois de um estorno.
 *
 * O estorno não apaga nada — e faz certo, porque histórico apagado não se
 * audita. Ele faz DUAS coisas: carimba `reversed_at` no pagamento original e
 * INSERE uma segunda linha, o contra-lançamento, com `reversal_of` apontando
 * para o original.
 *
 * Logo, "pagamento ativo" exige as duas condições:
 *
 *     reversed_at IS NULL  AND  reversal_of IS NULL
 *
 * Testar só `reversed_at IS NULL` é o erro que morde: o original sai da conta,
 * mas a linha de estorno — que nasce sem `reversed_at` — entra no lugar dele.
 * O saldo "pago" não muda de valor, e estornar passa a ser inócuo: a conta fica
 * paga para sempre e o cancelamento nunca libera. Pior, é um erro que só
 * aparece DEPOIS do estorno, exatamente quando a pessoa está tentando consertar
 * outra coisa.
 *
 * Esta é a versão do cliente da mesma regra que a view `obligation_summary` e a
 * função `cancel_obligation` aplicam no banco. Ela existe para a tela poder
 * decidir a partir das linhas de pagamento em si, sem depender de a lista
 * carregada estar atualizada nem de qual versão da view está publicada.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface LinhaDePagamento {
    id: string;
    amount: number;
    reversed_at?: string | null;
    reversal_of?: string | null;
}

/** Um pagamento vale enquanto não foi estornado e não É um estorno. */
export const ehAtivo = (p: LinhaDePagamento | null | undefined): boolean =>
    !!p && !p.reversed_at && !p.reversal_of;

/** Só os pagamentos que ainda valem. */
export const pagamentosAtivos = <T extends LinhaDePagamento>(pagamentos: T[] | null | undefined): T[] =>
    (pagamentos || []).filter(ehAtivo);

/** Quanto a conta tem de pago de verdade, já descontado o que foi estornado. */
export function totalPago(pagamentos: LinhaDePagamento[] | null | undefined): number {
    const soma = pagamentosAtivos(pagamentos)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return Math.round(soma * 100) / 100;
}

/**
 * Se a conta pode ser cancelada, e por quê não.
 *
 * Cancelar por cima de um pagamento deixaria o saldo do banco apontando para um
 * lançamento que não existe mais — a recusa é correta. O que faltava era dizer
 * a saída junto: estornar primeiro, cancelar depois. Erro que só informa o
 * obstáculo é o que faz alguém lançar um valor inverso para "corrigir", e aí
 * são dois lançamentos errados no lugar de nenhum.
 */
export function motivoParaNaoCancelar(
    pagamentos: LinhaDePagamento[] | null | undefined,
): string | null {
    const ativos = pagamentosAtivos(pagamentos);
    if (ativos.length === 0) return null;
    return ativos.length === 1
        ? 'Esta conta tem 1 pagamento lançado. Estorne o pagamento primeiro — '
          + 'depois o cancelamento fica liberado.'
        : `Esta conta tem ${ativos.length} pagamentos lançados. Estorne todos `
          + 'antes de cancelar.';
}
