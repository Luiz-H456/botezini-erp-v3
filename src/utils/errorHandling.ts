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
