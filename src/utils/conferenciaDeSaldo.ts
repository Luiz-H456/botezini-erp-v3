// O saldo do banco confere com os lançamentos?
//
// POR QUE ISTO EXISTE
// `current_balance` é um total corrente: cada baixa soma ou subtrai. Totais
// correntes derivam. Existir um botão "Sincronizar Saldos" na tela é a própria
// admissão de que ele deriva — e de que alguém precisa desconfiar antes de
// clicar.
//
// Desconfiar não é trabalho de quem opera. A conta é barata e a resposta é
// binária: saldo inicial mais a soma dos movimentos ativos tem de dar o saldo
// guardado. Quando não dá, alguma baixa entrou ou saiu por fora, e é melhor
// saber no dia do que no fechamento do mês.
//
// A REGRA DO MOVIMENTO ATIVO é a mesma do resto do sistema, e é justamente onde
// o saldo costuma escorregar: pagamento estornado não conta, o estorno em si não
// conta, e lançamento informativo (affects_balance = false) não move dinheiro.
//
// Sem imports do app, para ser testado direto com `node --test`.

export interface ContaParaConferir {
    id: string;
    name?: string | null;
    initial_balance?: number | null;
    current_balance?: number | null;
    is_active?: boolean | null;
}

/** Uma baixa, do jeito que ela chega de obligation_payments. */
export interface MovimentoDeConta {
    account_id?: string | null;
    amount?: number | null;
    /** 'receivable' entra, 'payable' sai. */
    tipo?: 'receivable' | 'payable' | string | null;
    reversed_at?: string | null;
    reversal_of?: string | null;
    /** Falso em lançamento informativo — registra, mas não move dinheiro. */
    affects_balance?: boolean | null;
}

/**
 * Um centavo de folga.
 *
 * Não é tolerância a erro: é aritmética de ponto flutuante. Somar duzentas
 * baixas de centavos produz resíduo na décima quinta casa, e sem a folga toda
 * conta do sistema apareceria divergente por 0,0000000001.
 */
export const FOLGA = 0.01;

export interface Divergencia {
    account_id: string;
    nome: string;
    guardado: number;
    calculado: number;
    /** guardado − calculado. Positivo = o sistema acha que tem mais do que tem. */
    diferenca: number;
    movimentos: number;
}

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Este movimento mexe no saldo?
 *
 * Espelha a mesma regra de `pagamentoAtivo.ts` e da view do banco. Se as três
 * discordarem, a conferência vira uma quarta opinião em vez de uma checagem.
 */
export const movimentoAtivo = (m: MovimentoDeConta): boolean =>
    !m.reversed_at && !m.reversal_of && m.affects_balance !== false;

export interface SomaDosMovimentos {
    total: number;
    /**
     * Movimentos cujo tipo (receber/pagar) não se sabe.
     *
     * Nunca zero de bom grado: se existe um só, a soma é ficção e a conta
     * inteira fica sem veredito.
     */
    semTipo: number;
}

/**
 * O quanto os movimentos ativos somam numa conta. Recebível entra, pagável sai.
 *
 * O TIPO DESCONHECIDO NÃO TEM PADRÃO, e essa é a regra mais importante daqui.
 * A primeira versão fazia `tipo === 'payable' ? -x : +x`, o que transformava
 * todo movimento de tipo ignorado em DINHEIRO ENTRANDO. Uma obrigação que não
 * veio na consulta — por filtro, por teto de linhas, por qualquer motivo —
 * virava receita silenciosamente, e o saldo calculado subia sozinho.
 *
 * O erro simétrico seria pior ainda: um pagável lido como recebível erra pelo
 * DOBRO do valor, porque troca o sinal em vez de só omitir a parcela.
 */
export function somaDosMovimentos(
    movimentos: MovimentoDeConta[] | null | undefined,
): SomaDosMovimentos {
    let total = 0;
    let semTipo = 0;

    for (const m of movimentos || []) {
        if (!movimentoAtivo(m)) continue;

        if (m.tipo === 'receivable') { total += num(m.amount); continue; }
        if (m.tipo === 'payable')    { total -= num(m.amount); continue; }

        semTipo++;
    }

    return { total, semTipo };
}

/** Saldo que a conta DEVERIA ter, e se dá para afirmá-lo. */
export const saldoEsperado = (
    conta: ContaParaConferir,
    movimentos: MovimentoDeConta[] | null | undefined,
): { valor: number; confiavel: boolean } => {
    const soma = somaDosMovimentos(movimentos);
    return {
        valor: num(conta.initial_balance) + soma.total,
        confiavel: soma.semTipo === 0,
    };
};

export interface ContaInconclusiva {
    account_id: string;
    nome: string;
    /** Quantos movimentos da conta ficaram sem tipo. */
    semTipo: number;
}

export interface ContaSemLinhaDeBase {
    account_id: string;
    nome: string;
    /** Quanto do saldo de hoje nao tem lancamento que o explique. */
    semHistorico: number;
    movimentos: number;
}

export interface ResultadoDaConferencia {
    divergencias: Divergencia[];
    /**
     * Contas que nunca tiveram o saldo ancorado.
     *
     * NAO sao erro. O saldo delas esta certo; o que falta e o historico que o
     * explica — dinheiro que entrou antes do sistema existir, ou por fora dos
     * lancamentos. Enquanto ninguem ancorar, a formula nunca vai fechar, e
     * cobrar isso todo dia e o tipo de aviso que ensina a equipe a ignorar
     * avisos.
     */
    semLinhaDeBase: ContaSemLinhaDeBase[];
    /**
     * Contas em que a conta não fecha porque falta informação — NÃO são
     * divergências. A diferença entre as duas listas é a diferença entre
     * "está errado" e "não sei", e ela decide se alguém deve mexer no saldo.
     */
    inconclusivas: ContaInconclusiva[];
    /** Contas efetivamente julgadas (ativas, e com dado completo). */
    conferidas: number;
    /** Soma das diferenças em módulo, para dizer o tamanho do problema. */
    totalDivergente: number;
    /**
     * Falso quando quem chamou avisou que não conseguiu trazer tudo.
     *
     * Com isto falso NADA é julgado: uma conferência que enxerga metade dos
     * lançamentos não acha metade dos erros, ela INVENTA erros — cada movimento
     * que ficou de fora vira uma diferença do tamanho dele.
     */
    completo: boolean;
}

export interface OpcoesDaConferencia {
    /**
     * Quem chamou conseguiu trazer TODOS os lançamentos?
     *
     * Consultas com teto de linhas (`.limit(n)`) devolvem exatamente `n` quando
     * há mais que isso, e não avisam. Quem tem esse teto precisa comparar o
     * número de linhas com o limite e passar `false` aqui.
     */
    dadosCompletos?: boolean;
}

const vazio = (completo: boolean): ResultadoDaConferencia => ({
    divergencias: [], semLinhaDeBase: [], inconclusivas: [],
    conferidas: 0, totalDivergente: 0, completo,
});

/**
 * Confere todas as contas ativas.
 *
 * Conta inativa fica de fora: ela não recebe lançamento novo e seu saldo é uma
 * fotografia do dia em que foi desativada. Cobrá-la produziria um alerta
 * permanente que ninguém pode resolver — o tipo de aviso que ensina a equipe a
 * ignorar avisos.
 *
 * A REGRA QUE ATRAVESSA A FUNÇÃO: informação incompleta produz SILÊNCIO, não
 * acusação. Um conferidor de saldo que não enxerga todos os lançamentos precisa
 * dizer "não sei" — porque do outro lado do aviso existe um botão que
 * SOBRESCREVE o saldo guardado pelo calculado, e um alerta falso ali custa o
 * número certo.
 */
export function conferirSaldos(
    contas: ContaParaConferir[] | null | undefined,
    movimentos: MovimentoDeConta[] | null | undefined,
    opcoes: OpcoesDaConferencia = {},
): ResultadoDaConferencia {
    if (opcoes.dadosCompletos === false) return vazio(false);

    const porConta = new Map<string, MovimentoDeConta[]>();
    for (const m of movimentos || []) {
        if (!m.account_id) continue;
        const lista = porConta.get(m.account_id) || [];
        lista.push(m);
        porConta.set(m.account_id, lista);
    }

    const divergencias: Divergencia[] = [];
    const semLinhaDeBase: ContaSemLinhaDeBase[] = [];
    const inconclusivas: ContaInconclusiva[] = [];
    let conferidas = 0;

    for (const c of contas || []) {
        if (c.is_active === false) continue;

        const doBanco = porConta.get(c.id) || [];
        const soma = somaDosMovimentos(doBanco);

        // Um único movimento sem tipo já derruba a conta inteira: não dá para
        // somar "quase tudo" e chamar o resultado de saldo.
        if (soma.semTipo > 0) {
            inconclusivas.push({
                account_id: c.id,
                nome: c.name || '(sem nome)',
                semTipo: soma.semTipo,
            });
            continue;
        }

        conferidas++;

        const calculado = num(c.initial_balance) + soma.total;
        const guardado = num(c.current_balance);
        const diferenca = guardado - calculado;

        if (Math.abs(diferenca) <= FOLGA) continue;

        /**
         * Nunca ancorada nao e o mesmo que quebrada.
         *
         * `initial_balance` zerado com movimento e diferenca e a assinatura de
         * uma conta que entrou no sistema sem o saldo de partida: os reais que
         * ja estavam la nunca viraram lancamento, e a formula nao tem como
         * fechar. O saldo exibido esta CERTO — falta a linha de base.
         *
         * Para `set_bank_balance` produzir exatamente zero seria preciso que o
         * saldo desejado batesse com a soma dos lancamentos no centavo. Na
         * pratica, zero aqui significa "ninguem ancorou".
         *
         * A diferenca entre as duas listas nao e cosmetica: uma pede conferir o
         * extrato e ajustar UMA vez; a outra diz que algo escapou e pede
         * investigacao. Misturar as duas foi o que pos um alerta critico e um
         * botao destrutivo ao lado de uma conta que estava certa.
         */
        if (num(c.initial_balance) === 0 && doBanco.length > 0) {
            semLinhaDeBase.push({
                account_id: c.id,
                nome: c.name || '(sem nome)',
                semHistorico: diferenca,
                movimentos: doBanco.filter(movimentoAtivo).length,
            });
            continue;
        }

        divergencias.push({
            account_id: c.id,
            nome: c.name || '(sem nome)',
            guardado,
            calculado,
            diferenca,
            movimentos: doBanco.filter(movimentoAtivo).length,
        });
    }

    // Pela maior diferença em módulo: sobrar e faltar são igualmente graves, e
    // o que interessa é qual conta está mais longe da verdade.
    divergencias.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));

    return {
        divergencias,
        semLinhaDeBase,
        inconclusivas,
        conferidas,
        totalDivergente: divergencias.reduce((s, d) => s + Math.abs(d.diferenca), 0),
        completo: true,
    };
}

/** Um pagamento como chega de getAllPaymentsComTeto — só o que a conferência usa. */
export interface PagamentoParaConferir {
    account_id?: string | null;
    amount?: number | null;
    obligation_id?: string | null;
    reversed_at?: string | null;
    reversal_of?: string | null;
    affects_balance?: boolean | null;
}

/**
 * Os movimentos de cada banco, com o tipo tirado da conta (a receber entra, a pagar sai).
 *
 * O painel antigo, a fila do Início e Cadastros › Bancos montavam isto cada um do seu jeito;
 * agora é um lugar só, para a fila e Bancos darem o mesmo veredito.
 */
export function movimentosDosPagamentos(
    pagamentos: PagamentoParaConferir[],
    contas: { id: string; type?: string | null }[],
): MovimentoDeConta[] {
    const tipoPorConta = new Map(contas.map(c => [c.id, c.type]));
    return pagamentos.map(p => ({
        account_id: p.account_id,
        amount: p.amount,
        tipo: p.obligation_id ? tipoPorConta.get(p.obligation_id) : undefined,
        reversed_at: p.reversed_at,
        reversal_of: p.reversal_of,
        affects_balance: p.affects_balance,
    }));
}

/** Com este tanto de contas, o mapa de tipos pode estar incompleto: a conferência se cala. */
export const TETO_DE_CONTAS = 5000;

export const dadosCompletosDaConferencia = (pagamentosTruncados: boolean, totalDeContas: number): boolean =>
    !pagamentosTruncados && totalDeContas < TETO_DE_CONTAS;

export type SituacaoDoSaldo =
    | { tipo: 'bate' }
    | { tipo: 'nao-bate'; guardado: number; calculado: number }
    | { tipo: 'sem-partida' }
    | { tipo: 'sem-dados' };

/** O veredito de UM banco. Informação incompleta produz silêncio ('sem-dados'), nunca acusação. */
export function situacaoDoSaldo(r: ResultadoDaConferencia, accountId: string): SituacaoDoSaldo {
    if (!r.completo) return { tipo: 'sem-dados' };
    const d = r.divergencias.find(x => x.account_id === accountId);
    if (d) return { tipo: 'nao-bate', guardado: d.guardado, calculado: d.calculado };
    if (r.semLinhaDeBase.some(x => x.account_id === accountId)) return { tipo: 'sem-partida' };
    if (r.inconclusivas.some(x => x.account_id === accountId)) return { tipo: 'sem-dados' };
    return { tipo: 'bate' };
}

export interface PreviaDaSincronizacao {
    id: string;
    nome: string;
    atual: number;
    /** O saldo que a conta passa a ter. null = não dá para prever (dados incompletos ou pagamento sem tipo). */
    depois: number | null;
    muda: boolean;
}

/**
 * O que "Sincronizar saldos" faz com cada conta, em número.
 *
 * A janela antiga mostrava "saldo atual → saldo de partida + lançamentos" sem somar,
 * e o saldo de partida (a âncora) parecia ser o novo saldo: R$ 59.071,57 → R$ 286.036,69.
 * Aqui sai o resultado, pela mesma regra de `recalculate_all_bank_balances`
 * (estorno, contrapartida e informativo não movem saldo).
 */
export function previaDaSincronizacao(
    contas: ContaParaConferir[],
    movimentos: MovimentoDeConta[],
    dadosCompletos: boolean,
): PreviaDaSincronizacao[] {
    return contas.map(c => {
        const atual = num(c.current_balance);
        const esperado = saldoEsperado(c, movimentos.filter(m => m.account_id === c.id));
        const depois = dadosCompletos && esperado.confiavel ? Math.round(esperado.valor * 100) / 100 : null;
        return {
            id: c.id,
            nome: c.name || '',
            atual,
            depois,
            muda: depois !== null && Math.abs(depois - atual) > FOLGA,
        };
    });
}
