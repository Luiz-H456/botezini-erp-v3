/**
 * Lê uma consulta do PostgREST em páginas de 1.000 linhas.
 *
 * O servidor corta toda resposta em `max_rows` (1.000) sem avisar; um
 * `.limit(5000)` devolve 1.000 e parece completo. Aqui a página é pedida com
 * `.range(de, ate)` até vir uma curta — e só se marca `truncado` quando o teto
 * de segurança (`limite`) foi atingido, que é quando de fato pode haver mais.
 *
 * `buscar` precisa ter ordem estável (inclua o id como desempate), senão as
 * páginas se sobrepõem ou pulam linhas.
 */
export const TAMANHO_DA_PAGINA = 1000;

export interface ResultadoPaginado<T> { linhas: T[]; truncado: boolean; erro: string | null }

export async function lerEmPaginas<T>(
    buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    limite: number,
    tamanho = TAMANHO_DA_PAGINA,
): Promise<ResultadoPaginado<T>> {
    const linhas: T[] = [];
    while (linhas.length < limite) {
        const de = linhas.length;
        const { data, error } = await buscar(de, de + tamanho - 1);
        if (error) return { linhas: [], truncado: false, erro: error.message };
        const pagina = data ?? [];
        linhas.push(...pagina);
        if (pagina.length < tamanho) break;
    }
    const truncado = linhas.length >= limite;
    return { linhas: truncado ? linhas.slice(0, limite) : linhas, truncado, erro: null };
}
