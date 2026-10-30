// O que cada operação perigosa FAZ, e o que ela custa se estiver errada.
//
// POR QUE ISTO EXISTE, E NÃO SÓ UM AVISO EM CADA TELA
// "Deseja realmente continuar? Esta ação é irreversível." não informa nada. Diz
// que existe risco sem dizer QUAL, e quem lê aprende a clicar em Sim — porque a
// frase é a mesma na exclusão de um rascunho e na sobrescrita de um saldo.
//
// O caso real: "Sincronizar Saldos" perguntava "deseja recalcular os saldos a
// partir dos lançamentos?". Soa em conserto. A operação APAGA o saldo guardado
// e escreve outro no lugar, sem desfazer — e o clique custou o saldo certo de
// uma conta.
//
// A regra que este arquivo carrega: antes de uma operação perigosa, a pessoa lê
// TRÊS coisas — o que vai acontecer, o que se perde, e se dá para desfazer.
// Nesta ordem, porque é a ordem em que a dúvida aparece.
//
// Sem imports do app, para ser testado direto com `node --test`.

export type Reversibilidade =
    /** Não há caminho de volta. O dado anterior deixa de existir. */
    | 'sem-volta'
    /** Dá para desfazer pela própria tela, com um clique equivalente. */
    | 'reversivel'
    /** Dá para corrigir, mas por outro caminho e com esforço. */
    | 'compensavel';

export const ROTULO_DA_REVERSIBILIDADE: Record<Reversibilidade, string> = {
    'sem-volta': 'Não tem desfazer',
    'reversivel': 'Dá para desfazer',
    'compensavel': 'Dá para corrigir depois',
};

export interface DescricaoDaOperacao {
    id: string;
    /** Título da caixa. Uma pergunta, no verbo real da ação. */
    titulo: string;
    /** O que o sistema vai fazer, em uma frase, no presente. */
    oQueFaz: string;
    /** O que se perde ou muda de forma difícil de reverter. */
    consequencia: string;
    reversibilidade: Reversibilidade;
    /** Como voltar atrás. Obrigatório quando não é 'sem-volta'. */
    comoDesfazer?: string;
    /** O que fazer ANTES, quando existe uma precaução barata. */
    antesDeContinuar?: string;
    /** Texto do botão. Nunca "Sim" — sempre o verbo da ação. */
    rotuloConfirmar: string;
    /** Vermelho quando destrói dado; neutro quando só muda estado. */
    perigo: boolean;
}

/**
 * O registro.
 *
 * Toda operação perigosa do app mora aqui, e a tela só escolhe pelo id. Ficar
 * num lugar só é o que permite conferir de uma olhada se alguma está com um
 * texto vago — e o que impede a próxima nascer com "tem certeza?".
 */
export const OPERACOES: Record<string, DescricaoDaOperacao> = {

    // ── Financeiro: onde o estrago é em dinheiro ────────────────────────────

    'sincronizar-saldos': {
        id: 'sincronizar-saldos',
        titulo: 'Sobrescrever o saldo de todas as contas?',
        oQueFaz: 'Apaga o saldo atual de cada conta e escreve no lugar '
            + 'saldo de partida + soma dos lançamentos.',
        consequencia: 'Se o saldo de hoje foi conferido no extrato e ajustado à mão, '
            + 'esse ajuste se perde. Conta que nunca teve saldo de partida informado '
            + 'vai parar num valor muito distante do real.',
        reversibilidade: 'compensavel',
        comoDesfazer: 'Só reinformando o saldo de cada conta, uma por uma, conferindo o extrato.',
        antesDeContinuar: 'Anote os saldos atuais antes de continuar.',
        rotuloConfirmar: 'Sobrescrever saldos',
        perigo: true,
    },

    'ajustar-saldo': {
        id: 'ajustar-saldo',
        titulo: 'Informar o saldo real desta conta?',
        oQueFaz: 'Grava o saldo que você informou e recalcula o saldo de partida '
            + 'para que a conta feche com os lançamentos já registrados.',
        consequencia: 'Não cria lançamento nem conta a pagar ou receber. '
            + 'O saldo de partida anterior é substituído.',
        reversibilidade: 'reversivel',
        comoDesfazer: 'Informando o saldo anterior da mesma forma.',
        rotuloConfirmar: 'Gravar saldo',
        perigo: false,
    },

    'estornar-pagamento': {
        id: 'estornar-pagamento',
        titulo: 'Estornar este pagamento?',
        oQueFaz: 'Cria um lançamento de estorno e devolve o valor ao saldo da conta. '
            + 'O pagamento original continua no histórico, marcado como estornado.',
        consequencia: 'O saldo da conta muda na hora, e a obrigação volta a constar '
            + 'como não paga.',
        reversibilidade: 'compensavel',
        comoDesfazer: 'Registrando o pagamento de novo. O estorno permanece no histórico.',
        rotuloConfirmar: 'Estornar',
        perigo: true,
    },

    'cancelar-lancamento': {
        id: 'cancelar-lancamento',
        titulo: 'Cancelar este lançamento?',
        oQueFaz: 'Marca a conta como cancelada. Ela sai das projeções de caixa '
            + 'e dos totais a pagar e a receber.',
        consequencia: 'Pagamento já registrado nela NÃO é estornado — '
            + 'o saldo da conta bancária não muda.',
        reversibilidade: 'sem-volta',
        rotuloConfirmar: 'Cancelar lançamento',
        perigo: true,
    },

    'cancelar-serie': {
        id: 'cancelar-serie',
        titulo: 'Cancelar a série inteira?',
        oQueFaz: 'Cancela de uma vez todas as parcelas em aberto desta recorrência '
            + 'ou deste parcelamento. Elas saem das projeções de caixa e dos totais '
            + 'a pagar e a receber.',
        consequencia: 'Parcela que já tem pagamento registrado NÃO é cancelada e '
            + 'NÃO é estornada — o dinheiro que entrou ou saiu continua no saldo. '
            + 'Para desfazer essas, estorne o pagamento primeiro, uma a uma.',
        reversibilidade: 'sem-volta',
        // Sem `comoDesfazer` de propósito, e o teste do registro cobra isso:
        // uma operação marcada como sem volta que traz um campo "como desfazer"
        // promete um caminho de volta com uma mão e o nega com a outra. Não há
        // "descancelar" em lote — cada parcela teria de ser lançada de novo à
        // mão, e as novas nasceriam sem o histórico das antigas. Isso é
        // consequência, e é onde está escrito.
        antesDeContinuar: 'Confira na lista abaixo quantas parcelas caem e quais '
            + 'ficam de pé. Não existe desfazer em lote: recriá-las seria lançar '
            + 'uma a uma, à mão, sem o histórico das originais.',
        rotuloConfirmar: 'Cancelar a série',
        perigo: true,
    },

    'conciliar': {
        id: 'conciliar',
        titulo: 'Marcar como conferido no extrato?',
        oQueFaz: 'Marca este lançamento como conciliado. Ele passa a somar '
            + 'no "saldo conciliado" do painel.',
        consequencia: 'É uma afirmação de que você conferiu no extrato do banco. '
            + 'Não move dinheiro nem altera saldo.',
        reversibilidade: 'reversivel',
        comoDesfazer: 'Desmarcando, o que pede um motivo.',
        rotuloConfirmar: 'Marcar conferido',
        perigo: false,
    },

    'desfazer-conciliacao': {
        id: 'desfazer-conciliacao',
        titulo: 'Desfazer a conciliação?',
        oQueFaz: 'Tira a marca de conferido e registra o motivo junto do lançamento.',
        consequencia: 'O lançamento sai do saldo conciliado. O motivo fica gravado '
            + 'e aparece no histórico.',
        reversibilidade: 'reversivel',
        comoDesfazer: 'Marcando como conferido de novo.',
        rotuloConfirmar: 'Desfazer conciliação',
        perigo: false,
    },

    'inativar-conta': {
        id: 'inativar-conta',
        titulo: 'Inativar esta conta bancária?',
        oQueFaz: 'A conta sai da lista de contas ativas e do saldo consolidado, '
            + 'e deixa de aparecer em lançamentos novos.',
        consequencia: 'O histórico e os lançamentos dela continuam existindo. '
            + 'O saldo dela vira uma fotografia de hoje.',
        reversibilidade: 'reversivel',
        comoDesfazer: 'Reativando em "Mostrar inativas".',
        rotuloConfirmar: 'Inativar conta',
        perigo: false,
    },

    // ── Cadastro e operação ────────────────────────────────────────────────

    'excluir-orcamento': {
        id: 'excluir-orcamento',
        titulo: 'Excluir este orçamento?',
        oQueFaz: 'Remove o orçamento e todos os itens dele.',
        consequencia: 'O histórico de preço deste cliente perde estas linhas — '
            + 'o badge de "já praticado" para de contá-las.',
        reversibilidade: 'sem-volta',
        rotuloConfirmar: 'Excluir orçamento',
        perigo: true,
    },

    'excluir-pedido': {
        id: 'excluir-pedido',
        titulo: 'Excluir este pedido?',
        oQueFaz: 'Remove o pedido, os itens e o vínculo com a produção.',
        consequencia: 'As contas a receber geradas por ele NÃO são removidas, '
            + 'e o estoque já baixado não volta.',
        reversibilidade: 'sem-volta',
        antesDeContinuar: 'Confira se existem cobranças abertas deste pedido.',
        rotuloConfirmar: 'Excluir pedido',
        perigo: true,
    },

    'excluir-lead': {
        id: 'excluir-lead',
        titulo: 'Excluir este lead?',
        oQueFaz: 'Remove a empresa do funil de prospecção.',
        consequencia: 'A taxa de conversão passa a ser calculada sem ele, '
            + 'como se nunca tivesse entrado.',
        reversibilidade: 'sem-volta',
        antesDeContinuar: 'Se ele não fechou, descartar com motivo ensina mais que excluir.',
        rotuloConfirmar: 'Excluir lead',
        perigo: true,
    },

    'excluir-insumo': {
        id: 'excluir-insumo',
        titulo: 'Excluir este insumo?',
        oQueFaz: 'Remove o insumo e o histórico de movimentação dele.',
        consequencia: 'Ficha técnica que o usa fica apontando para nada, '
            + 'e o custo dos produtos afetados deixa de fechar.',
        reversibilidade: 'sem-volta',
        rotuloConfirmar: 'Excluir insumo',
        perigo: true,
    },

    'descartar-alteracoes': {
        id: 'descartar-alteracoes',
        titulo: 'Sair sem salvar?',
        oQueFaz: 'Fecha a janela e joga fora o que foi digitado desde que ela abriu.',
        consequencia: 'As alterações que ainda não foram salvas se perdem; o que já estava salvo continua igual.',
        reversibilidade: 'sem-volta',
        antesDeContinuar: 'Para guardar, volte e use o botão de salvar.',
        rotuloConfirmar: 'Descartar alterações',
        perigo: true,
    },

    'excluir-contato': {
        id: 'excluir-contato',
        titulo: 'Excluir este contato?',
        oQueFaz: 'Remove a pessoa da agenda deste cliente.',
        consequencia: 'Se era o contato principal, o cliente fica sem ninguém '
            + 'marcado, e a mensagem automática passa a não ter destinatário.',
        reversibilidade: 'sem-volta',
        rotuloConfirmar: 'Excluir contato',
        perigo: true,
    },
};

export const operacao = (id: string): DescricaoDaOperacao | null => OPERACOES[id] || null;

/** Toda operação sem volta precisa dizer o que se perde; as outras, como voltar. */
export function descricaoEstaCompleta(d: DescricaoDaOperacao): boolean {
    if (!d.titulo.trim() || !d.oQueFaz.trim() || !d.consequencia.trim()) return false;
    if (!d.rotuloConfirmar.trim()) return false;
    if (d.reversibilidade !== 'sem-volta' && !d.comoDesfazer?.trim()) return false;
    return true;
}

/**
 * Rótulos proibidos no botão de confirmar.
 *
 * "Sim", "OK" e "Confirmar" não dizem o que vai acontecer. Quem clica num botão
 * escrito "Excluir pedido" sabe o que fez; quem clica em "Sim" só respondeu uma
 * pergunta que talvez não tenha lido.
 */
export const ROTULOS_VAGOS = ['sim', 'ok', 'confirmar', 'continuar', 'prosseguir'];

export const rotuloEhVago = (rotulo: string): boolean =>
    ROTULOS_VAGOS.includes(rotulo.trim().toLowerCase());
