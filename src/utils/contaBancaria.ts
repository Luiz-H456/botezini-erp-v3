// Quem pode escrever o saldo de uma conta bancária — e quem não pode.
//
// O ACIDENTE QUE ISTO IMPEDE
// O formulário de conta carregava `initial_balance` ao abrir e o regravava ao
// salvar, junto com nome, agência e número. Parecia inofensivo: é o mesmo valor
// que estava lá.
//
// Só que `initial_balance` não é um campo do formulário — é uma ÂNCORA
// calculada. Quando alguém ajusta o saldo real, a RPC `set_bank_balance`
// resolve `initial_balance = saldo_desejado − soma_dos_lançamentos` para a
// conta fechar. O formulário, aberto ANTES disso, seguia com o valor velho em
// memória; um clique em Salvar depois do ajuste devolvia o valor velho e
// desfazia a âncora — sem erro, sem aviso, e com o saldo exibido certo.
//
// Foi assim que uma conta ficou com saldo 49.557,89 e âncora 0,00, divergindo
// em 76.640,84 de um jeito que só reaparece no dia seguinte.
//
// A REGRA: saldo é escrito por UM caminho só (a RPC). O formulário cuida do que
// é descritivo. Na CRIAÇÃO o saldo inicial é do formulário — ali ele é um fato
// informado, não uma âncora derivada.
//
// Sem imports do app, para ser testado direto com `node --test`.

export interface DadosDaConta {
    id?: string;
    name?: string | null;
    bank_name?: string | null;
    agency?: string | null;
    account_number?: string | null;
    type?: string | null;
    currency?: string | null;
    is_active?: boolean | null;
    initial_balance?: number | null;
    current_balance?: number | null;
    titular?: string | null;
    chave_pix?: string | null;
}

/** Campos que o formulário legitimamente possui, em qualquer situação. */
export const CAMPOS_DESCRITIVOS = [
    'name', 'bank_name', 'agency', 'account_number', 'type', 'currency', 'is_active',
] as const;

/** Campos de saldo. Só a criação e a RPC de ajuste podem escrevê-los. */
export const CAMPOS_DE_SALDO = ['initial_balance', 'current_balance'] as const;

/**
 * Campos que só existem depois de supabase/cadastros_v3_1.sql. Vão ao banco apenas
 * quando vieram na conta: antes do SQL o formulário nem os mostra, e mandar uma
 * coluna inexistente faria o PostgREST recusar a gravação inteira.
 */
export const CAMPOS_NOVOS = ['titular', 'chave_pix'] as const;

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

export interface CamposParaGravar {
    [campo: string]: unknown;
}

/**
 * O que vai para o banco quando alguém salva o formulário de conta.
 *
 * `ehNova` decide tudo:
 *   - conta NOVA: o saldo inicial é informado, e o atual nasce igual a ele.
 *     Não há lançamento nenhum ainda, então âncora e saldo coincidem.
 *   - conta EXISTENTE: nenhum campo de saldo sai daqui. Nem `current_balance`,
 *     nem `initial_balance`. Se o formulário pudesse tocá-los, bastaria abrir a
 *     tela e salvar para desfazer o ajuste de outra pessoa.
 */
export function camposDaConta(dados: DadosDaConta, ehNova: boolean): CamposParaGravar {
    const saida: CamposParaGravar = {};

    for (const campo of CAMPOS_DESCRITIVOS) {
        const valor = dados[campo];
        if (campo === 'is_active') { saida[campo] = valor !== false; continue; }
        if (campo === 'type') { saida[campo] = valor || 'checking'; continue; }
        if (campo === 'currency') { saida[campo] = valor || 'BRL'; continue; }
        if (campo === 'name') { saida[campo] = valor; continue; }
        saida[campo] = valor || null;
    }

    for (const campo of CAMPOS_NOVOS) {
        if (dados[campo] !== undefined) saida[campo] = dados[campo] || null;
    }

    if (ehNova) {
        const inicial = num(dados.initial_balance);
        saida.initial_balance = inicial;
        // Conta nova não tem lançamento: o saldo de hoje É o inicial. Aceitar um
        // current_balance diferente aqui criaria uma conta que já nasce sem
        // fechar.
        saida.current_balance = inicial;
    }

    return saida;
}

/** Verdadeiro quando o payload tentaria mexer em saldo de conta já existente. */
export const tocaEmSaldo = (campos: CamposParaGravar): boolean =>
    CAMPOS_DE_SALDO.some(c => c in campos);
