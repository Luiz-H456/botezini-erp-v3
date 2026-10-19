/**
 * Duplicatas e grupos econômicos de cliente.
 *
 * DUAS COISAS SEPARADAS, e a confusão entre elas é justamente o que este módulo
 * evita:
 *
 *  - MESCLAR: "Frigorífico Aurora" e "AURORA FRIGORIFICO LTDA" são a MESMA
 *    empresa, cadastrada duas vezes. Cada cadastro leva um pedaço do histórico,
 *    e nenhum tem a conta completa. A ligação é por apelido, não por fusão:
 *    nada é apagado, e desfazer é limpar um campo.
 *
 *  - AGRUPAR: "Granja Sol Matriz", "Granja Sol Filial BH" e "Sol Alimentos" são
 *    empresas DIFERENTES do mesmo dono. Cada uma tem CNPJ, nota e conta a
 *    receber próprios — continuam clientes separados. O grupo só existe para
 *    quem negocia ver o total.
 *
 * Mesclar filiais somaria CNPJs distintos num cadastro só e a nota sairia
 * errada. Agrupar duplicatas contaria o mesmo cliente duas vezes dentro do
 * próprio grupo. Por isso são campos diferentes, com regras diferentes.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface ClienteComApelido {
    id: string;
    company_name?: string;
    cnpj?: string | null;
    canonical_client_id?: string | null;
    grupo_economico?: string | null;
}

export type MapaDeCanonicos = Map<string, string>;

/**
 * Resolve a cadeia de duplicatas até o cadastro oficial.
 *
 * Segue A→B→C e devolve C. O teto de saltos existe porque o banco garante que
 * ninguém aponta para si mesmo, mas não impede um ciclo maior (A→B→A) montado
 * em duas gravações separadas — e um ciclo aqui travaria a tela inteira.
 */
export function resolverCanonico(
    id: string,
    porId: Map<string, ClienteComApelido>,
    maxSaltos = 8,
): string {
    let atual = id;
    const vistos = new Set<string>([id]);
    for (let i = 0; i < maxSaltos; i++) {
        const alvo = porId.get(atual)?.canonical_client_id;
        if (!alvo || alvo === atual) return atual;
        if (vistos.has(alvo)) return atual;          // ciclo
        if (!porId.has(alvo)) return atual;          // aponta para cadastro sumido
        vistos.add(alvo);
        atual = alvo;
    }
    return atual;
}

/** Índice id → id oficial, para todos os clientes de uma vez. */
export function mapaDeCanonicos(clientes: ClienteComApelido[] | undefined): MapaDeCanonicos {
    const porId = new Map((clientes || []).map(c => [c.id, c]));
    const mapa: MapaDeCanonicos = new Map();
    for (const c of clientes || []) mapa.set(c.id, resolverCanonico(c.id, porId));
    return mapa;
}

/** Aplica o mapa; cliente desconhecido continua sendo ele mesmo. */
export const canonico = (id: string, mapa?: MapaDeCanonicos) => mapa?.get(id) || id;

// ─── detecção de duplicados ──────────────────────────────────────────────────

/** Palavras que aparecem em toda razão social e não distinguem empresa nenhuma. */
const RUIDO = new Set([
    'ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'e', 'de', 'da', 'do',
    'comercio', 'comercial', 'industria', 'industrial', 'servicos', 'servico',
    'empresa', 'grupo', 'filial', 'matriz', 'unidade',
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

/** Só os dígitos — "12.345.678/0001-90" e "12345678000190" são o mesmo CNPJ. */
export const soDigitos = (v?: string | null) => (v || '').replace(/\D/g, '');

const palavras = (nome?: string | null) =>
    new Set(normalizarNome(nome).split(' ').filter(Boolean));

/** Semelhança de 0 a 1 (Jaccard sobre as palavras do nome normalizado). */
export function semelhanca(a?: string | null, b?: string | null): number {
    const pa = palavras(a), pb = palavras(b);
    if (pa.size === 0 || pb.size === 0) return 0;
    let comuns = 0;
    for (const t of pa) if (pb.has(t)) comuns++;
    return comuns / (pa.size + pb.size - comuns);
}

export const LIMITE_DE_SEMELHANCA = 0.5;

export interface CandidatoACliente {
    cliente: ClienteComApelido;
    semelhanca: number;
    /** CNPJ idêntico — a evidência mais forte que existe. */
    mesmoCnpj: boolean;
    mesmoNomeNormalizado: boolean;
}

/**
 * Clientes que provavelmente são a mesma empresa que `alvo`.
 *
 * CNPJ igual é a evidência decisiva e vem sempre primeiro: duas razões sociais
 * diferentes com o mesmo CNPJ são a mesma pessoa jurídica, ponto. Nome parecido
 * é indício, não prova — "Granja Sol Matriz" e "Granja Sol Filial" são muito
 * parecidos e NÃO devem ser mesclados, por isso o nome sozinho nunca basta para
 * o app decidir: ele sugere, quem confirma é a pessoa.
 *
 * Fica de fora quem já é duplicata de alguém e quem já é o canônico do alvo —
 * não faz sentido sugerir um vínculo que já existe.
 */
export function candidatosDeCliente(
    alvo: ClienteComApelido | undefined,
    clientes: ClienteComApelido[] | undefined,
    limite = LIMITE_DE_SEMELHANCA,
): CandidatoACliente[] {
    if (!alvo?.id) return [];
    const normalAlvo = normalizarNome(alvo.company_name);
    const cnpjAlvo = soDigitos(alvo.cnpj);
    if (!normalAlvo && !cnpjAlvo) return [];

    const fora = new Set<string>([alvo.id]);
    if (alvo.canonical_client_id) fora.add(alvo.canonical_client_id);

    return (clientes || [])
        .filter(c => c.id && !fora.has(c.id) && !c.canonical_client_id)
        .map(c => ({
            cliente: c,
            semelhanca: semelhanca(alvo.company_name, c.company_name),
            mesmoCnpj: !!cnpjAlvo && soDigitos(c.cnpj) === cnpjAlvo,
            mesmoNomeNormalizado: !!normalAlvo && normalizarNome(c.company_name) === normalAlvo,
        }))
        .filter(c => c.mesmoCnpj || c.mesmoNomeNormalizado || c.semelhanca >= limite)
        .sort((a, b) =>
            Number(b.mesmoCnpj) - Number(a.mesmoCnpj)
            || Number(b.mesmoNomeNormalizado) - Number(a.mesmoNomeNormalizado)
            || b.semelhanca - a.semelhanca
            || (a.cliente.company_name || '').localeCompare(b.cliente.company_name || '', 'pt-BR'));
}

/** Quem aponta para este cliente — para o cadastro mostrar o que ele absorve. */
export function duplicatasDe(
    id: string | undefined,
    clientes: ClienteComApelido[] | undefined,
): ClienteComApelido[] {
    if (!id) return [];
    return (clientes || [])
        .filter(c => c.canonical_client_id === id)
        .sort((a, b) => (a.company_name || '').localeCompare(b.company_name || '', 'pt-BR'));
}

// ─── grupos econômicos ───────────────────────────────────────────────────────

export interface GrupoDeClientes {
    nome: string;
    /** Empresas do grupo, sem as duplicatas — elas somariam duas vezes. */
    membros: ClienteComApelido[];
}

/** Nome do grupo já aparado; vazio conta como sem grupo. */
export const nomeDoGrupo = (c?: ClienteComApelido | null) =>
    (c?.grupo_economico || '').trim();

/**
 * Todos os grupos existentes, com seus membros.
 *
 * Duplicatas ficam de fora dos membros: elas já são representadas pelo cadastro
 * oficial, e contá-las somaria o mesmo faturamento duas vezes no total do grupo
 * — que é justamente o número pelo qual o grupo existe.
 */
export function gruposDeClientes(clientes: ClienteComApelido[] | undefined): GrupoDeClientes[] {
    const porGrupo = new Map<string, ClienteComApelido[]>();
    for (const c of clientes || []) {
        if (c.canonical_client_id) continue;
        const g = nomeDoGrupo(c);
        if (!g) continue;
        const lista = porGrupo.get(g) || [];
        lista.push(c);
        porGrupo.set(g, lista);
    }
    return [...porGrupo.entries()]
        .map(([nome, membros]) => ({
            nome,
            membros: membros.sort((a, b) =>
                (a.company_name || '').localeCompare(b.company_name || '', 'pt-BR')),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Os membros de um grupo específico. */
export function membrosDoGrupo(
    grupo: string | undefined | null,
    clientes: ClienteComApelido[] | undefined,
): ClienteComApelido[] {
    const alvo = (grupo || '').trim().toLowerCase();
    if (!alvo) return [];
    return (clientes || [])
        .filter(c => !c.canonical_client_id && nomeDoGrupo(c).toLowerCase() === alvo)
        .sort((a, b) => (a.company_name || '').localeCompare(b.company_name || '', 'pt-BR'));
}

/** Nomes de grupo já usados — alimenta o seletor, para não criar variação de grafia. */
export function nomesDeGrupo(clientes: ClienteComApelido[] | undefined): string[] {
    const nomes = new Set<string>();
    for (const c of clientes || []) {
        const g = nomeDoGrupo(c);
        if (g) nomes.add(g);
    }
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ─── quem é matriz, quem é filial ────────────────────────────────────────────

/**
 * Raiz do CNPJ — os 8 primeiros dígitos.
 *
 * É o que identifica a PESSOA JURÍDICA. Matriz e filiais compartilham a raiz e
 * diferem só no sufixo de ordem.
 */
export const raizDoCnpj = (cnpj?: string | null) => soDigitos(cnpj).slice(0, 8);

/** Sufixo de ordem do estabelecimento — 0001 é a matriz, 0002+ são filiais. */
export const ordemDoEstabelecimento = (cnpj?: string | null) => soDigitos(cnpj).slice(8, 12);

export type PapelNoGrupo = 'matriz' | 'filial' | 'coligada' | 'unica';

/**
 * O papel de cada empresa dentro do grupo, deduzido do próprio CNPJ.
 *
 * Não é palpite nem campo a preencher: o CNPJ brasileiro JÁ carrega essa
 * informação. XX.XXX.XXX/0001-YY é a matriz; /0002, /0003… são filiais da mesma
 * pessoa jurídica. Ler dali evita pedir ao usuário um dado que ele já digitou.
 *
 * COLIGADA é o terceiro caso, e é real: "Sol Alimentos" com CNPJ de raiz
 * diferente não é filial de ninguém — é outra empresa, do mesmo dono, que entra
 * no grupo por decisão comercial e não por vínculo societário no cadastro.
 * Chamá-la de filial seria mentira; deixá-la sem papel esconderia que ela está
 * ali por outro motivo.
 */
export function papelNoGrupo(
    cliente: ClienteComApelido,
    membros: ClienteComApelido[],
): PapelNoGrupo {
    const raiz = raizDoCnpj(cliente.cnpj);
    if (!raiz) return 'coligada';

    const irmaosDaMesmaRaiz = membros.filter(
        m => m.id !== cliente.id && raizDoCnpj(m.cnpj) === raiz);
    if (irmaosDaMesmaRaiz.length === 0) return 'coligada';

    return ordemDoEstabelecimento(cliente.cnpj) === '0001' ? 'matriz' : 'filial';
}

export const ROTULO_DO_PAPEL: Record<PapelNoGrupo, string> = {
    matriz: 'Matriz',
    filial: 'Filial',
    coligada: 'Coligada',
    unica: 'Única',
};

export interface MembroClassificado {
    cliente: ClienteComApelido;
    papel: PapelNoGrupo;
}

/**
 * Os membros do grupo já classificados e ordenados: matriz primeiro, depois as
 * filiais dela, depois as coligadas.
 *
 * A ordem é a resposta visual para "qual é a base?" — quem abre a tela lê de
 * cima para baixo e a hierarquia aparece sem precisar de legenda.
 */
export function membrosClassificados(
    grupo: string | undefined | null,
    clientes: ClienteComApelido[] | undefined,
): MembroClassificado[] {
    const membros = membrosDoGrupo(grupo, clientes);
    const peso: Record<PapelNoGrupo, number> = { matriz: 0, filial: 1, coligada: 2, unica: 3 };
    return membros
        .map(c => ({ cliente: c, papel: papelNoGrupo(c, membros) }))
        .sort((a, b) =>
            peso[a.papel] - peso[b.papel]
            // Dentro do mesmo papel, filiais da mesma raiz ficam juntas.
            || raizDoCnpj(a.cliente.cnpj).localeCompare(raizDoCnpj(b.cliente.cnpj))
            || (a.cliente.company_name || '').localeCompare(b.cliente.company_name || '', 'pt-BR'));
}
