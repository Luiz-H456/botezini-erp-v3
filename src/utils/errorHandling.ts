export interface AppError {
    message: string;
    code?: string;
    details?: any;
    severity: 'error' | 'warning' | 'info';
}

export function parseSupabaseError(error: any): AppError {
    if (!error) return { message: 'Erro desconhecido', severity: 'error' };

    // PostgrestError format
    const code = error.code as string;
    let message = error.message || 'Ocorreu um erro inesperado no banco de dados.';
    let severity: AppError['severity'] = 'error';

    // Map common PostgreSQL error codes
    switch (code) {
        case '23505': // unique_violation
            message = 'Este registro já existe (duplicidade detectada).';
            break;
        case '23503': // foreign_key_violation
            message = 'Não é possível realizar esta operação pois este item está sendo usado em outro lugar.';
            break;
        case '42P01': // undefined_table
            message = 'Tabela não encontrada no banco de dados.';
            severity = 'error';
            break;
        case 'PGRST116': // JSON object expected, more than one or no rows returned
            message = 'Nenhum registro encontrado ou registro duplicado inesperado.';
            severity = 'warning';
            break;
        case '42501': // Insufficient Privilege (RLS)
            message = 'Você não tem permissão para realizar esta operação.';
            break;
        default:
            if (message.includes('JWT')) {
                message = 'Sua sessão expirou. Por favor, faça login novamente.';
            }
            break;
    }

    return {
        message,
        code,
        details: error.details || error.hint,
        severity
    };
}

export function getErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    const parsed = parseSupabaseError(error);
    return parsed.message;
}

// ── Mensagens para quem usa (auditoria de 29/10, C4/C5) ──────────────────────
//
// Os repositórios relançam só o TEXTO do erro (`throw new Error(error.message)`), então o
// código do Postgres se perde no caminho: a tradução precisa funcionar pelo texto também.
// Mensagem que não casa com nada conhecido passa como está — as das nossas funções no banco
// (RAISE EXCEPTION) já vêm em português e dizem o que fazer.

const TRADUCOES: [RegExp, string][] = [
    [/failed to fetch|networkerror|load failed|network request failed|fetch failed/i,
        'Sem conexão com o servidor. Confira a internet e tente de novo em instantes.'],
    [/duplicate key value|unique constraint/i, 'Já existe um registro igual (nome ou número repetido).'],
    [/foreign key constraint/i, 'Este item está sendo usado em outro lugar e não pode ser alterado ou apagado assim.'],
    [/row-level security|permission denied|insufficient privilege/i, 'Você não tem permissão para isso. Fale com o administrador.'],
    [/jwt expired|invalid jwt|jwt.*expired|refresh token/i, 'Sua sessão expirou. Entre de novo.'],
    [/check constraint/i, 'Algum valor está fora do permitido. Confira números, datas e campos obrigatórios.'],
    [/invalid input syntax/i, 'Um campo está com formato inválido (número ou data). Confira e tente de novo.'],
    [/value too long/i, 'Um texto passou do tamanho permitido. Encurte e tente de novo.'],
    [/statement timeout|canceling statement/i, 'O servidor demorou demais para responder. Tente de novo.'],
    [/null value in column/i, 'Falta preencher um campo obrigatório.'],
];

const POR_CODIGO: Record<string, string> = {
    '23505': 'Já existe um registro igual (nome ou número repetido).',
    '23503': 'Este item está sendo usado em outro lugar e não pode ser alterado ou apagado assim.',
    '42501': 'Você não tem permissão para isso. Fale com o administrador.',
    '23514': 'Algum valor está fora do permitido. Confira números, datas e campos obrigatórios.',
};

function traduzirTexto(texto: string): string {
    for (const [padraoTecnico, amigavel] of TRADUCOES) if (padraoTecnico.test(texto)) return amigavel;
    return texto;
}

export function ehErroDeConexao(e: unknown): boolean {
    const err = e as { name?: string; message?: string } | null | undefined;
    if (!err) return false;
    if (err.name === 'AuthRetryableFetchError') return true;
    return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(err.message || '');
}

/** O texto que a tela mostra para um erro: traduzido quando é técnico; `padrao` quando não há texto. */
export function mensagemDeErro(e: unknown, padrao: string): string {
    if (typeof e === 'string') return traduzirTexto(e.trim()) || padrao;
    const err = e as { code?: string; message?: string } | null | undefined;
    if (!err) return padrao;
    if (err.code && POR_CODIGO[err.code]) return POR_CODIGO[err.code];
    const texto = (err.message || '').trim();
    if (!texto) return padrao;
    return traduzirTexto(texto);
}
