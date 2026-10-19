/**
 * Apelidos de insumo: "este tecido é o mesmo que aquele".
 *
 * O mesmo pano acaba cadastrado três vezes com nomes ligeiramente diferentes, e
 * cada cadastro carrega o seu próprio saldo e o seu próprio custo médio. O
 * estrago é maior que no produto: aqui o número errado não é só estatística de
 * preço, é o CMV da peça e o saldo que alguém vai conferir na prateleira.
 *
 * Ligar em vez de fundir mantém as movimentações de cada cadastro intactas — o
 * saldo continua sendo o resultado do que de fato entrou e saiu ali. A soma
 * acontece na leitura.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface InsumoComApelido {
    id: string;
    name?: string;
    unit?: string;
    current_stock?: number;
    average_unit_cost?: number;
    fabric_family?: string | null;
    color_tier?: string | null;
    canonical_insumo_id?: string | null;
}

export type MapaDeCanonicos = Map<string, string>;

/** Resolve a cadeia de apelidos até o cadastro oficial. */
export function resolverCanonico(
    id: string,
    porId: Map<string, InsumoComApelido>,
    maxSaltos = 8,
): string {
    let atual = id;
    const vistos = new Set<string>([id]);
    for (let i = 0; i < maxSaltos; i++) {
        const alvo = porId.get(atual)?.canonical_insumo_id;
        if (!alvo || alvo === atual) return atual;
        if (vistos.has(alvo)) return atual;          // ciclo
        if (!porId.has(alvo)) return atual;          // aponta para cadastro sumido
        vistos.add(alvo);
        atual = alvo;
    }
    return atual;
}

export function mapaDeCanonicos(insumos: InsumoComApelido[] | undefined): MapaDeCanonicos {
    const porId = new Map((insumos || []).map(i => [i.id, i]));
    const mapa: MapaDeCanonicos = new Map();
    for (const i of insumos || []) mapa.set(i.id, resolverCanonico(i.id, porId));
    return mapa;
}

export const canonico = (id: string, mapa?: MapaDeCanonicos) => mapa?.get(id) || id;

// ─── detecção de duplicados ──────────────────────────────────────────────────

/**
 * Palavras que descrevem composição ou embalagem e não distinguem o material.
 *
 * "100% algodão" e "poliéster" ficam de fora porque aparecem em quase todo
 * nome de tecido da casa; deixá-las aumentaria a semelhança de panos que não
 * têm nada a ver um com o outro.
 */
const RUIDO = new Set([
    'de', 'da', 'do', 'com', 'sem', 'e', 'em', 'para', 'p', 'a', 'o',
    'tecido', 'malha', 'rolo', 'peca', 'metro', 'metros', 'mt', 'm',
    'algodao', 'poliester', 'pa', 'pv', 'un', 'unid', 'unidade', 'kg',
]);

export function normalizarNome(nome: string | undefined | null): string {
    return (nome || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t && !RUIDO.has(t))
        .join(' ')
        .trim();
}

const palavras = (nome?: string | null) =>
    new Set(normalizarNome(nome).split(' ').filter(Boolean));

export function semelhanca(a?: string | null, b?: string | null): number {
    const pa = palavras(a), pb = palavras(b);
    if (pa.size === 0 || pb.size === 0) return 0;
    let comuns = 0;
    for (const t of pa) if (pb.has(t)) comuns++;
    return comuns / (pa.size + pb.size - comuns);
}

export const LIMITE_DE_SEMELHANCA = 0.5;

export interface CandidatoAInsumo {
    insumo: InsumoComApelido;
    semelhanca: number;
    mesmoNomeNormalizado: boolean;
    /** Mesma família de tecido cadastrada — indício forte de ser o mesmo pano. */
    mesmaFamilia: boolean;
    /** Unidades diferentes: mesclar somaria metro com quilo. */
    unidadeDiferente: boolean;
}

/**
 * Insumos que provavelmente são o mesmo material que `alvo`.
 *
 * Unidade diferente é sinalizada, não excluída: "BRIM" em metro e "BRIM" em
 * quilo podem ser o mesmo pano comprado de dois jeitos, e às vezes a mesclagem
 * é justamente o que se quer — mas somar metro com quilo dá um saldo que não
 * significa nada, então quem decide precisa ver o aviso antes.
 *
 * NÃO sugere entre faixas de cor da mesma família: Branco, Padrão e Especial
 * são três cadastros de propósito, porque o metro custa diferente em cada um.
 * Mesclá-los destruiria a única razão de eles existirem separados.
 */
export function candidatosDeInsumo(
    alvo: InsumoComApelido | undefined,
    insumos: InsumoComApelido[] | undefined,
    limite = LIMITE_DE_SEMELHANCA,
): CandidatoAInsumo[] {
    if (!alvo?.id) return [];
    const normalAlvo = normalizarNome(alvo.name);
    if (!normalAlvo) return [];

    const fora = new Set<string>([alvo.id]);
    if (alvo.canonical_insumo_id) fora.add(alvo.canonical_insumo_id);

    const familiaAlvo = (alvo.fabric_family || '').trim().toLowerCase();

    return (insumos || [])
        .filter(i => {
            if (!i.id || fora.has(i.id) || i.canonical_insumo_id) return false;
            // Faixas de cor da mesma família são separadas de propósito: o metro
            // custa diferente em cada uma. Mesclar apagaria essa diferença.
            const familia = (i.fabric_family || '').trim().toLowerCase();
            if (familiaAlvo && familia === familiaAlvo
                && (i.color_tier || null) !== (alvo.color_tier || null)) return false;
            return true;
        })
        .map(i => ({
            insumo: i,
            semelhanca: semelhanca(alvo.name, i.name),
            mesmoNomeNormalizado: normalizarNome(i.name) === normalAlvo,
            mesmaFamilia: !!familiaAlvo && (i.fabric_family || '').trim().toLowerCase() === familiaAlvo,
            unidadeDiferente: !!alvo.unit && !!i.unit && alvo.unit !== i.unit,
        }))
        .filter(c => c.mesmoNomeNormalizado || c.mesmaFamilia || c.semelhanca >= limite)
        .sort((a, b) =>
            Number(b.mesmoNomeNormalizado) - Number(a.mesmoNomeNormalizado)
            || Number(b.mesmaFamilia) - Number(a.mesmaFamilia)
            || b.semelhanca - a.semelhanca
            || (a.insumo.name || '').localeCompare(b.insumo.name || '', 'pt-BR'));
}

/** Quem aponta para este insumo — para o cadastro mostrar o que ele absorve. */
export function apelidosDe(
    id: string | undefined,
    insumos: InsumoComApelido[] | undefined,
): InsumoComApelido[] {
    if (!id) return [];
    return (insumos || [])
        .filter(i => i.canonical_insumo_id === id)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
}

export interface SaldoConsolidado {
    /** Soma do saldo do oficial e de todos os apelidos. */
    estoque: number;
    /** Custo médio ponderado pelo saldo de cada cadastro. */
    custoMedio: number;
    /** Quantos cadastros entraram na conta, incluindo o oficial. */
    cadastros: number;
}

/**
 * Saldo e custo do insumo somando os apelidos.
 *
 * Custo ponderado pelo SALDO, não média simples: 300 m a R$ 12 e 5 m a R$ 40
 * não fazem um custo de R$ 26 — fazem R$ 12,46. A média simples faria a peça
 * parecer muito mais cara do que é e contaminaria o CMV.
 *
 * Cadastro sem saldo entra na contagem mas não pesa no custo: ele não tem pano
 * para dizer por quanto o pano custa.
 */
export function saldoConsolidado(
    id: string,
    insumos: InsumoComApelido[] | undefined,
): SaldoConsolidado {
    const oficial = (insumos || []).find(i => i.id === id);
    if (!oficial) return { estoque: 0, custoMedio: 0, cadastros: 0 };

    const todos = [oficial, ...apelidosDe(id, insumos)];
    const estoque = todos.reduce((s, i) => s + (Number(i.current_stock) || 0), 0);
    const valor = todos.reduce(
        (s, i) => s + (Number(i.current_stock) || 0) * (Number(i.average_unit_cost) || 0), 0);

    return {
        estoque: Math.round(estoque * 1000) / 1000,
        custoMedio: estoque > 0 ? Math.round((valor / estoque) * 100) / 100 : (Number(oficial.average_unit_cost) || 0),
        cadastros: todos.length,
    };
}
