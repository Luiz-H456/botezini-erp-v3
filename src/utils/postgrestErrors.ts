/**
 * Reconhecimento de erros do PostgREST.
 *
 * Puro de propósito — sem imports — para poder ser testado direto.
 */

export interface ErroSupabase {
    code?: string | null;
    message?: string | null;
    details?: string | null;
}

/**
 * Verdadeiro quando o erro é "esta coluna não existe no schema".
 *
 * Serve para o app tolerar uma migração ainda não aplicada: em vez de impedir o
 * usuário de salvar o registro inteiro, grava sem o campo novo e avisa.
 *
 * O PostgREST responde de duas formas diferentes para o mesmo problema:
 *  - PGRST204 + "Could not find the 'x' column of 'y' in the schema cache"
 *  - 42703   + 'column "x" does not exist'  (erro cru do Postgres)
 */
export function isColunaAusente(erro: ErroSupabase | null | undefined, coluna: string): boolean {
    if (!erro || !coluna) return false;

    const codigo = (erro.code || '').toUpperCase();
    const texto = `${erro.message || ''} ${erro.details || ''}`.toLowerCase();
    const alvo = coluna.toLowerCase();

    if (!texto.includes(alvo)) return false;

    if (codigo === 'PGRST204' || codigo === '42703') return true;

    return texto.includes('does not exist')
        || texto.includes('could not find')
        || texto.includes('schema cache');
}

/**
 * Verdadeiro quando o erro é "já existe um registro com este valor".
 *
 * Postgres devolve 23505 (unique_violation) e cita o índice em `details`
 * ("Key (order_number)=(PED-2026-0031) already exists"). O PostgREST repassa
 * ambos, mas o `code` chega como '23505' e a mensagem vem em inglês.
 *
 * Passe `campo` para restringir a uma coluna — sem ele, qualquer duplicidade
 * responde verdadeiro, o que raramente é o que se quer numa mensagem ao
 * usuário: "já existe" só ajuda quando se diz já existe o quê.
 */
export function ehValorDuplicado(erro: ErroSupabase | null | undefined, campo?: string): boolean {
    if (!erro) return false;

    const codigo = (erro.code || '').toUpperCase();
    const texto = `${erro.message || ''} ${erro.details || ''}`.toLowerCase();

    const duplicado = codigo === '23505'
        || texto.includes('duplicate key value')
        || texto.includes('violates unique constraint');
    if (!duplicado) return false;

    if (!campo) return true;
    return texto.includes(campo.toLowerCase());
}

/**
 * Verdadeiro quando o erro é "esta função não existe no schema".
 *
 * Mesma ideia de `isColunaAusente`, um nível acima: uma migração que ainda não
 * foi rodada não pode impedir o resto da tela de funcionar. Quem chama decide
 * o que fazer sem a função — normalmente seguir e avisar no console.
 *
 * O PostgREST responde PGRST202 quando não acha a função no cache do schema; o
 * Postgres cru responde 42883 ("function ... does not exist").
 */
export function isFuncaoAusente(erro: ErroSupabase | null | undefined, nome?: string): boolean {
    if (!erro) return false;

    const codigo = (erro.code || '').toUpperCase();
    const texto = `${erro.message || ''} ${erro.details || ''}`.toLowerCase();

    const ausente = codigo === 'PGRST202'
        || codigo === '42883'
        || texto.includes('could not find the function')
        || texto.includes('does not exist') && texto.includes('function');
    if (!ausente) return false;

    return !nome || texto.includes(nome.toLowerCase());
}
