/**
 * Apelidos de produto: "esta peça é a mesma que aquela".
 *
 * A mesma peça acaba cadastrada mais de uma vez com nomes ligeiramente
 * diferentes. Cada cadastro leva um pedaço do histórico, então nenhum tem
 * amostra para dizer nada sobre preço — e a análise de preço inteira depende
 * de amostra.
 *
 * Puro de propósito — sem imports do app — para poder ser testado direto.
 */

export interface ProdutoComApelido {
    id: string;
    name?: string;
    category?: string;
    canonical_product_id?: string | null;
}

/** Um nó do índice de canônicos: id do apelido → id do oficial. */
export type MapaDeCanonicos = Map<string, string>;

/**
 * Resolve a cadeia de apelidos até o cadastro oficial.
 *
 * Segue A→B→C e devolve C. O teto de saltos existe porque o banco garante que
 * ninguém aponta para si mesmo, mas não impede um ciclo maior (A→B→A) montado
 * em duas gravações separadas — e um ciclo aqui travaria a tela inteira.
 */
export function resolverCanonico(
    id: string,
    porId: Map<string, ProdutoComApelido>,
    maxSaltos = 8,
): string {
    let atual = id;
    const vistos = new Set<string>([id]);
    for (let i = 0; i < maxSaltos; i++) {
        const alvo = porId.get(atual)?.canonical_product_id;
        if (!alvo || alvo === atual) return atual;
        // Ciclo: para no primeiro repetido em vez de girar para sempre.
        if (vistos.has(alvo)) return atual;
        if (!porId.has(alvo)) return atual;   // aponta para produto sumido
        vistos.add(alvo);
        atual = alvo;
    }
    return atual;
}

/**
 * Índice id → id oficial, para todos os produtos de uma vez.
 *
 * Quem consome o histórico chama isto uma vez e usa o mapa em cada linha, em
 * vez de percorrer a cadeia de apelidos por item.
 */
export function mapaDeCanonicos(produtos: ProdutoComApelido[] | undefined): MapaDeCanonicos {
    const porId = new Map((produtos || []).map(p => [p.id, p]));
    const mapa: MapaDeCanonicos = new Map();
    for (const p of produtos || []) mapa.set(p.id, resolverCanonico(p.id, porId));
    return mapa;
}

/** Aplica o mapa; produto desconhecido continua sendo ele mesmo. */
export const canonico = (id: string, mapa?: MapaDeCanonicos) => mapa?.get(id) || id;

// ─── detecção de duplicados ──────────────────────────────────────────────────

/**
 * Normaliza o nome para comparação: sem acento, sem pontuação, sem caixa e sem
 * as palavras que não distinguem peça nenhuma.
 *
 * "Camisa de Brim Profissional" e "CAMISA BRIM" viram ambas "camisa brim" — que
 * é o ponto: são a mesma peça escrita de dois jeitos.
 */
const RUIDO = new Set([
    'de', 'da', 'do', 'com', 'sem', 'e', 'em', 'para', 'p', 'a', 'o',
    'profissional', 'padrao', 'basico', 'basica', 'simples', 'novo', 'nova',
    'un', 'unid', 'unidade', 'pc', 'pca', 'peca',
]);

export function normalizarNome(nome: string | undefined): string {
    return (nome || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t && !RUIDO.has(t))
        .join(' ')
        .trim();
}

/** Conjunto de palavras do nome normalizado. */
const palavras = (nome: string | undefined) =>
    new Set(normalizarNome(nome).split(' ').filter(Boolean));

/**
 * Semelhança entre dois nomes, de 0 a 1 (Jaccard sobre as palavras).
 *
 * Palavras, e não letras: "CAMISA BRIM" e "CAMISA BRIM PROFISSIONAL" têm
 * distância de edição grande mas dividem todas as palavras que importam. Uma
 * medida por caractere daria as duas como diferentes justamente no caso que
 * mais aparece aqui, que é o nome ganhando um complemento.
 */
export function semelhanca(a: string | undefined, b: string | undefined): number {
    const pa = palavras(a), pb = palavras(b);
    if (pa.size === 0 || pb.size === 0) return 0;
    let comuns = 0;
    for (const t of pa) if (pb.has(t)) comuns++;
    return comuns / (pa.size + pb.size - comuns);
}

/** A partir daqui dois nomes são candidatos a ser a mesma peça. */
export const LIMITE_DE_SEMELHANCA = 0.5;

export interface Candidato {
    produto: ProdutoComApelido;
    semelhanca: number;
    /** Nomes idênticos depois de normalizados — o caso mais claro. */
    mesmoNomeNormalizado: boolean;
}

/**
 * Produtos que provavelmente são a mesma peça que `alvo`.
 *
 * Fica de fora quem já é apelido de alguém e quem já é o canônico do alvo — não
 * faz sentido sugerir um vínculo que já existe. Ordena pelo mais parecido.
 */
export function candidatosDeApelido(
    alvo: ProdutoComApelido | undefined,
    produtos: ProdutoComApelido[] | undefined,
    limite = LIMITE_DE_SEMELHANCA,
): Candidato[] {
    if (!alvo?.id) return [];
    const normalAlvo = normalizarNome(alvo.name);
    if (!normalAlvo) return [];

    const fora = new Set<string>([alvo.id]);
    if (alvo.canonical_product_id) fora.add(alvo.canonical_product_id);

    return (produtos || [])
        .filter(p => p.id && !fora.has(p.id) && !p.canonical_product_id)
        .map(p => ({
            produto: p,
            semelhanca: semelhanca(alvo.name, p.name),
            mesmoNomeNormalizado: normalizarNome(p.name) === normalAlvo,
        }))
        .filter(c => c.mesmoNomeNormalizado || c.semelhanca >= limite)
        .sort((a, b) =>
            Number(b.mesmoNomeNormalizado) - Number(a.mesmoNomeNormalizado)
            || b.semelhanca - a.semelhanca
            || (a.produto.name || '').localeCompare(b.produto.name || '', 'pt-BR'));
}

/** Quem aponta para este produto — para o cadastro mostrar o que ele absorve. */
export function apelidosDe(
    id: string | undefined,
    produtos: ProdutoComApelido[] | undefined,
): ProdutoComApelido[] {
    if (!id) return [];
    return (produtos || [])
        .filter(p => p.canonical_product_id === id)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
}
