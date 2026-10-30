/**
 * Navegação por objetivos — ver docs/superpowers/specs/2026-10-06-navegacao-por-objetivos-design.md.
 * Sem imports do app, para ser testado com node --test.
 */

export type View =
    | 'dashboard'
    | 'budgets' | 'orders'
    | 'quadro' | 'controle-parcial'
    | 'cronograma' | 'compras' | 'inventory'
    | 'finance' | 'receivables' | 'envelopes' | 'saude-caixa'
    | 'resultado' | 'itens-vendidos' | 'indicadores'
    | 'masterdata' | 'capacidade'
    | 'cadastros' | 'clientes' | 'fornecedores' | 'produtos' | 'bancos' | 'setores' | 'empresa' | 'categorias' | 'mensagens'
    | 'board'
    | 'leads'
    | 'pcp' | 'production'
    | 'login';

/** `notas` e não `quadro`: `quadro` já é a view do Kanban. */
export type SecaoId = 'inicio' | 'vender' | 'producao' | 'planejar' | 'dinheiro' | 'resultados' | 'cadastros' | 'notas';

export interface Secao {
    id: SecaoId;
    rotulo: string;
    /** Frase curta do que se faz aqui — vira a dica (title) no menu. */
    descricao: string;
    tipo: 'inicio' | 'objetivo' | 'apoio';
    /** Os passos, na ordem. */
    views: View[];
    /** Passos com ordem natural (1 → 2 → 3). Consultas irmãs não são numeradas. */
    numerado: boolean;
}

export const ROTULO_DA_VIEW: Record<View, string> = {
    dashboard: 'Início',
    budgets: 'Orçamentos',
    orders: 'Pedidos',
    quadro: 'Quadro',
    'controle-parcial': 'Controle parcial',
    cronograma: 'Cronograma',
    compras: 'Lista de compras',
    inventory: 'Estoque',
    finance: 'Contas',
    receivables: 'Clientes que devem',
    envelopes: 'Caixinhas',
    'saude-caixa': 'Saúde do caixa',
    resultado: 'Resultado',
    'itens-vendidos': 'Vendas',
    indicadores: 'Fábrica',
    masterdata: 'Cadastros',
    capacidade: 'Setores e capacidade',
    cadastros: 'Cadastros',
    clientes: 'Clientes',
    fornecedores: 'Fornecedores',
    produtos: 'Produtos',
    bancos: 'Bancos',
    setores: 'Setores e capacidade',
    empresa: 'Minha empresa',
    categorias: 'Categorias',
    mensagens: 'Mensagens',
    board: 'Quadro de notas',
    leads: 'Prospecção',
    pcp: 'Quadro',
    production: 'Quadro',
    login: 'Entrar',
};

export const SECOES: Secao[] = [
    { id: 'inicio', rotulo: 'Início', descricao: 'O que precisa de você hoje', tipo: 'inicio', views: ['dashboard'], numerado: false },
    { id: 'vender', rotulo: 'Vender', descricao: 'Do orçamento ao pedido', tipo: 'objetivo', views: ['budgets', 'orders'], numerado: true },
    { id: 'producao', rotulo: 'Como está a produção', descricao: 'O pedido andando pelos setores', tipo: 'objetivo', views: ['quadro', 'controle-parcial'], numerado: true },
    { id: 'planejar', rotulo: 'Planejar a semana', descricao: 'O que a fábrica faz e o que comprar', tipo: 'objetivo', views: ['cronograma', 'compras', 'inventory'], numerado: true },
    { id: 'dinheiro', rotulo: 'Dinheiro', descricao: 'Pagar, receber e reservar', tipo: 'objetivo', views: ['finance', 'receivables', 'envelopes', 'saude-caixa'], numerado: false },
    { id: 'resultados', rotulo: 'Como estamos indo', descricao: 'Lucro, vendas e fábrica', tipo: 'objetivo', views: ['resultado', 'itens-vendidos', 'indicadores'], numerado: false },
    { id: 'cadastros', rotulo: 'Cadastros', descricao: 'Clientes, produtos, empresa e setores', tipo: 'apoio', views: ['cadastros'], numerado: false },
    { id: 'notas', rotulo: 'Quadro de notas', descricao: 'Recados e rascunhos', tipo: 'apoio', views: ['board'], numerado: false },
];

/**
 * Os cartões do fichário de Cadastros. Não são passos: Cadastros é apoio, e a regra
 * dos 3 passos vale para os objetivos. Cada cartão é uma view da seção cadastros.
 */
export const CARTOES_DO_FICHARIO: View[] = [
    'clientes', 'produtos', 'fornecedores', 'bancos', 'setores', 'empresa', 'categorias', 'mensagens',
];

/** Rotas antigas que continuam valendo (links, alertas). */
export const ALIAS_DE_VIEW: Partial<Record<View, View>> = { pcp: 'quadro', production: 'quadro', masterdata: 'cadastros', capacidade: 'setores' };

/** Views que existem e não moram no menu — cada uma com o motivo. */
export const FORA_DO_MENU: View[] = [
    'leads',      // Prospecção em espera (o Luiz usa o Explee); o código fica
    'pcp',        // alias → quadro
    'production', // alias → quadro
    'masterdata', // alias → cadastros
    'capacidade', // alias → setores
    'login',
];

export const viewReal = (v: View): View => ALIAS_DE_VIEW[v] ?? v;

const POR_VIEW = new Map<View, SecaoId>();
for (const s of SECOES) for (const v of s.views) POR_VIEW.set(v, s.id);
for (const v of CARTOES_DO_FICHARIO) POR_VIEW.set(v, 'cadastros');

export const secaoDaView = (view: View | null | undefined): SecaoId | null =>
    (view && POR_VIEW.get(viewReal(view))) || null;

export const secaoPorId = (id: SecaoId | null | undefined): Secao | null =>
    SECOES.find(s => s.id === id) || null;

export const viewsDaSecao = (id: SecaoId | null | undefined): View[] =>
    secaoPorId(id)?.views || [];

export const viewInicialDaSecao = (id: SecaoId): View =>
    viewsDaSecao(id)[0] || 'dashboard';

/** A barra de passos só faz sentido com mais de um passo. */
export const temPassos = (id: SecaoId | null | undefined): boolean =>
    viewsDaSecao(id).length > 1;

export const todasAsViewsDoMenu = (): View[] => SECOES.flatMap(s => s.views);

// ── Endereço por tela (auditoria de 29/10, C1) ──────────────────────────────
//
// Sem endereço, F5 voltava ao Início e o "voltar" do navegador saía do app. O endereço é
// o rótulo da tela sem acento (`#/contas`, `#/lista-de-compras`): legível, e não muda se
// o nome interno da view mudar. Apelidos (pcp, masterdata…) levam ao endereço da tela real.

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugDe = (rotulo: string) => semAcento(rotulo).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const VIEW_POR_SLUG: Map<string, View> = (() => {
    const m = new Map<string, View>();
    for (const v of Object.keys(ROTULO_DA_VIEW) as View[]) {
        if (v === 'login' || ALIAS_DE_VIEW[v]) continue;
        const slug = v === 'board' ? 'notas' : slugDe(ROTULO_DA_VIEW[v]);
        if (!m.has(slug)) m.set(slug, v);
    }
    return m;
})();

export function enderecoDaView(view: View): string {
    const real = viewReal(view);
    for (const [slug, v] of VIEW_POR_SLUG) if (v === real) return `#/${slug}`;
    return '#/inicio';
}

export function viewDoEndereco(hash: string | null | undefined): View | null {
    const slug = (hash || '').replace(/^#\/?/, '').split(/[?/]/)[0];
    return slug ? VIEW_POR_SLUG.get(slug) ?? null : null;
}
