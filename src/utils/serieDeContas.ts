/**
 * Cancelar uma série inteira de contas — a recorrência ou o parcelamento.
 *
 * O PROBLEMA. Uma folha de salário de doze meses vira doze obrigações. Para
 * tirar essa despesa dos livros era preciso cancelar uma por uma, doze vezes,
 * cada uma com sua confirmação. Ninguém faz isso doze vezes: faz três, cansa, e
 * fica com nove parcelas fantasmas projetando saída de caixa que não vai
 * acontecer — que é pior do que não ter cancelado nenhuma, porque agora a
 * previsão está errada e ninguém sabe.
 *
 * DUAS COLUNAS, NÃO UMA. "Recorrente" e "parcelada" são coisas diferentes no
 * banco, criadas por funções diferentes:
 *
 *   recurrence_id     create_recurrence_obligations — o salário de 12 meses
 *   split_group_id    apply_order_payment_plan — a entrada + 2x de um pedido
 *
 * Quem só olhasse recurrence_id acharia que o parcelamento de pedido não é
 * série, e ofereceria cancelar uma parcela só.
 *
 * CANCELAR NÃO É APAGAR. Aqui e no resto do sistema, uma obrigação cancelada
 * continua existindo com cancelled_at preenchido. É de propósito: a conferência
 * de saldo e o histórico precisam do registro de que aquilo existiu e foi
 * desfeito. Apagar de verdade deixaria um buraco que ninguém consegue explicar
 * seis meses depois.
 */

export interface ContaDaSerie {
    id: string;
    description?: string | null;
    due_date?: string | null;
    original_amount?: number | null;
    recurrence_id?: string | null;
    split_group_id?: string | null;
    /** Pagamentos ativos — estornado não conta. Vem da obligation_summary. */
    payment_count?: number | null;
    cancelled_at?: string | null;
}

export type TipoDeSerie = 'recorrencia' | 'parcelamento';

export interface ChaveDaSerie {
    tipo: TipoDeSerie;
    id: string;
}

/**
 * Qual série esta conta integra, se alguma.
 *
 * A recorrência ganha da parcela quando as duas existem: uma obrigação com as
 * duas colunas nasceu de uma recorrência que depois foi parcelada, e a
 * recorrência é o grupo maior — cancelar por ela pega tudo.
 */
export function chaveDaSerie(ob: ContaDaSerie): ChaveDaSerie | null {
    if (ob.recurrence_id) return { tipo: 'recorrencia', id: ob.recurrence_id };
    if (ob.split_group_id) return { tipo: 'parcelamento', id: ob.split_group_id };
    return null;
}

/** Todas as contas da mesma série, a própria inclusive, em ordem de vencimento. */
export function parcelasDaSerie(todas: ContaDaSerie[], ob: ContaDaSerie): ContaDaSerie[] {
    const chave = chaveDaSerie(ob);
    if (!chave) return [];
    const campo = chave.tipo === 'recorrencia' ? 'recurrence_id' : 'split_group_id';
    return (todas || [])
        .filter(c => c[campo] === chave.id)
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
}

export interface PrevisaoDoCancelamento {
    /** Serão canceladas. */
    cancelar: ContaDaSerie[];
    /**
     * Ficam de fora por terem pagamento ativo. Não é limitação técnica: é o
     * que aconteceu de verdade. Dinheiro que entrou ou saiu não vira "nunca
     * existiu" — para desfazer essas, estorne o pagamento primeiro.
     */
    manterPorPagamento: ContaDaSerie[];
    /** Já estavam canceladas antes; contam só para o total não surpreender. */
    jaCanceladas: ContaDaSerie[];
    /** Soma do que sai da previsão de caixa. */
    valorCancelado: number;
}

/**
 * O que vai acontecer, antes de acontecer.
 *
 * @param apenasFuturas  quando verdadeiro, mantém o que venceu até `hoje`.
 *   Existe porque as duas intenções são legítimas e o resultado é bem
 *   diferente: "essa despesa acabou, pare de projetá-la" quer só as futuras;
 *   "essa conta nunca deveria ter sido lançada" quer todas.
 * @param hoje  data em ISO (YYYY-MM-DD). Entra por parâmetro para o teste não
 *   depender do relógio.
 */
export function preverCancelamentoDaSerie(
    parcelas: ContaDaSerie[],
    opcoes: { apenasFuturas?: boolean; hoje?: string } = {},
): PrevisaoDoCancelamento {
    const { apenasFuturas = false, hoje = '' } = opcoes;

    const cancelar: ContaDaSerie[] = [];
    const manterPorPagamento: ContaDaSerie[] = [];
    const jaCanceladas: ContaDaSerie[] = [];

    for (const c of parcelas) {
        if (c.cancelled_at) { jaCanceladas.push(c); continue; }
        if ((c.payment_count || 0) > 0) { manterPorPagamento.push(c); continue; }
        if (apenasFuturas && hoje && (c.due_date || '') <= hoje) continue;
        cancelar.push(c);
    }

    return {
        cancelar,
        manterPorPagamento,
        jaCanceladas,
        valorCancelado: cancelar.reduce((s, c) => s + Number(c.original_amount || 0), 0),
    };
}

/**
 * A frase que a confirmação mostra. Fica aqui, e não no componente, porque é
 * ela que o teste consegue prender: um aviso que conta a consequência errada é
 * pior que nenhum aviso, e é o tipo de coisa que ninguém revisa numa string
 * solta no meio do JSX.
 */
export function resumoDoCancelamento(p: PrevisaoDoCancelamento, tipo: TipoDeSerie): string {
    const n = p.cancelar.length;
    if (n === 0) {
        return p.manterPorPagamento.length > 0
            ? 'Nenhuma parcela pode ser cancelada: todas as que restam já têm pagamento registrado.'
            : 'Não há nenhuma parcela em aberto para cancelar nesta série.';
    }
    // O artigo acompanha o genero: "desta recorrencia", "deste parcelamento".
    // Um `desta ${nome}` fixo dava "desta parcelamento" — o tipo de erro que
    // passa despercebido em revisao de codigo e salta aos olhos na tela.
    const nome = tipo === 'recorrencia' ? 'desta recorrência' : 'deste parcelamento';
    const partes = [
        `${n} ${n === 1 ? 'parcela' : 'parcelas'} ${nome} ${n === 1 ? 'será cancelada' : 'serão canceladas'}.`,
    ];
    if (p.manterPorPagamento.length > 0) {
        const m = p.manterPorPagamento.length;
        partes.push(
            `${m} ${m === 1 ? 'fica de fora por já ter' : 'ficam de fora por já terem'} pagamento registrado — ` +
            'para essas, estorne o pagamento antes.',
        );
    }
    return partes.join(' ');
}
