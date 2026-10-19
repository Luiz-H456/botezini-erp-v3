import type { Option } from '@/components/common/SearchableSelect';
import type { GlobalCategory } from '@/types';

/**
 * Divisórias dentro dos dropdowns.
 *
 * Lista longa e plana obriga a ler nome por nome até achar. Com a divisória o
 * olho pula direto para o bloco certo — e, no campo fechado, o grupo aparece
 * acima do valor, então dá para conferir de onde veio sem reabrir a lista.
 *
 * Vive fora dos componentes porque a mesma regra vale para fornecedor, produto,
 * conta e categoria: cada tela montava a sua e elas divergiam entre si.
 */

/** O balde do que não foi classificado. Vai por último, sempre. */
export const SEM_GRUPO = 'Sem categoria';

const porTexto = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

export interface ItemAgrupavel {
    value: string;
    label: string;
    /** Vazio ou ausente cai no balde do fim. */
    grupo?: string | null;
    swatch?: string;
}

/**
 * Transforma uma lista solta em opções com cabeçalho de grupo.
 *
 * Grupo único não vira divisória: um cabeçalho só, com tudo embaixo, é ruído —
 * não separa nada e ainda come uma linha da lista.
 */
export function agrupar(itens: ItemAgrupavel[], rotuloSemGrupo = SEM_GRUPO): Option[] {
    const porGrupo = new Map<string, ItemAgrupavel[]>();
    for (const it of itens) {
        const g = (it.grupo || '').trim() || rotuloSemGrupo;
        const lista = porGrupo.get(g) || [];
        lista.push(it);
        porGrupo.set(g, lista);
    }

    if (porGrupo.size <= 1) {
        return itens
            .slice()
            .sort((a, b) => porTexto(a.label, b.label))
            .map(({ value, label, swatch }) => ({ value, label, swatch }));
    }

    const nomes = [...porGrupo.keys()].sort((a, b) => {
        if (a === rotuloSemGrupo) return 1;
        if (b === rotuloSemGrupo) return -1;
        return porTexto(a, b);
    });

    const saida: Option[] = [];
    for (const g of nomes) {
        saida.push({ value: `__g__${g}`, label: g.toUpperCase(), isHeader: true });
        for (const it of porGrupo.get(g)!.sort((a, b) => porTexto(a.label, b.label))) {
            saida.push({ value: it.value, label: it.label, group: g, swatch: it.swatch });
        }
    }
    return saida;
}

/**
 * Cliente, fornecedor ou produto agrupado pela categoria de cada um.
 *
 * Lê os dois campos que o app grava juntos: o vínculo com o catálogo (que é a
 * verdade) e o nome copiado (que é a rede de segurança do registro antigo).
 */
export function agruparPorCategoria<T extends {
    id: string; category?: string | null; global_category_id?: string | null;
}>(
    itens: T[],
    rotulo: (item: T) => string,
    categorias?: GlobalCategory[],
): Option[] {
    const nomePorId = new Map((categorias || []).map(c => [c.id, c.name]));
    return agrupar(itens.map(it => ({
        value: it.id,
        label: rotulo(it),
        grupo: (it.global_category_id ? nomePorId.get(it.global_category_id) : null) || it.category,
    })));
}

/** Rótulos dos tipos de centro de custo — o que a tela diz, não o enum. */
export const TIPO_DE_CENTRO: Record<string, string> = {
    production: 'Produção',
    administrative: 'Administrativo',
    commercial: 'Comercial',
    financial: 'Financeiro',
};

/** Rótulos dos tipos de conta — dinheiro em banco não é dinheiro em caixa. */
export const TIPO_DE_CONTA: Record<string, string> = {
    checking: 'Conta corrente',
    savings: 'Poupança',
    cash: 'Caixa',
    credit_card: 'Cartão de crédito',
};

/** Agrupa por um campo de tipo, traduzindo o enum para o rótulo da tela. */
export function agruparPorTipo<T extends { id: string }>(
    itens: T[],
    rotulo: (item: T) => string,
    tipo: (item: T) => string | undefined,
    dicionario: Record<string, string>,
): Option[] {
    return agrupar(
        itens.map(it => {
            const t = tipo(it) || '';
            return { value: it.id, label: rotulo(it), grupo: dicionario[t] || t };
        }),
        'Sem tipo',
    );
}

export type DominioDeCategoria = 'crm' | 'inventory' | 'finance';

/** Nome de cada setor como aparece no cabeçalho de "outros setores". */
const NOME_DO_SETOR: Record<DominioDeCategoria, string> = {
    crm: 'clientes e fornecedores',
    inventory: 'produtos',
    finance: 'financeiro',
};

/** Ordem fixa quando o setor não é o da tela. */
const ORDEM_DOS_OUTROS: DominioDeCategoria[] = ['crm', 'inventory', 'finance'];

/** Monta os pares cabeçalho-de-grupo + filhas de um conjunto de categorias. */
function arvoreDoSetor(doSetor: GlobalCategory[], prefixo: string): Option[] {
    const porId = new Map(doSetor.map(c => [c.id, c]));

    const filhasPorPai = new Map<string, GlobalCategory[]>();
    for (const c of doSetor) {
        if (!c.parent_id || !porId.has(c.parent_id)) continue;
        const lista = filhasPorPai.get(c.parent_id) || [];
        lista.push(c);
        filhasPorPai.set(c.parent_id, lista);
    }

    const grupos = doSetor
        .filter(c => !c.parent_id)
        .sort((a, b) => porTexto(a.name || '', b.name || ''));

    const saida: Option[] = [];
    for (const g of grupos) {
        const filhas = (filhasPorPai.get(g.id) || [])
            .sort((a, b) => porTexto(a.name || '', b.name || ''));
        // Grupo vazio não vira cabeçalho sozinho: seria um título sem nada
        // embaixo, e o usuário tentaria clicar nele.
        if (filhas.length === 0) continue;
        saida.push({ value: `__g__${prefixo}${g.id}`, label: (g.name || '').toUpperCase(), isHeader: true });
        for (const f of filhas) {
            saida.push({ value: f.id, label: (f.name || 'SEM NOME').toUpperCase(), group: g.name });
        }
    }
    return saida;
}

/**
 * As categorias em dois níveis, ordenadas por utilidade para a tela.
 *
 * Só a categoria de dentro do grupo é escolhível: o grupo é cabeçalho e existe
 * para dar hierarquia, não para receber lançamento. `valorAtual` entra à parte
 * quando aponta para algo fora da regra — senão o campo ficaria em branco num
 * registro que TEM categoria, e pareceria dado perdido.
 *
 * Com `incluirOutrosSetores`, as categorias dos demais setores continuam
 * escolhíveis, mas DEPOIS das do setor da tela e sob um cabeçalho que diz de
 * onde vieram. Esconder por completo parecia mais limpo e não era: a casa já
 * tem cliente classificado com categoria financeira, e um filtro rígido fazia
 * a categoria certa "sumir" para quem estava procurando por ela. Mostrar em
 * segundo plano organiza sem esconder — e o cabeçalho denuncia o desalinhamento
 * em vez de escondê-lo.
 */
export function opcoesDeCategoria(
    categorias: GlobalCategory[],
    dominio: DominioDeCategoria,
    valorAtual?: string,
    incluirOutrosSetores = false,
): Option[] {
    const ativas = categorias.filter(c => c.is_active !== false);
    const saida: Option[] = arvoreDoSetor(ativas.filter(c => c.domain === dominio), '');

    if (incluirOutrosSetores) {
        for (const outro of ORDEM_DOS_OUTROS) {
            if (outro === dominio) continue;
            const arvore = arvoreDoSetor(ativas.filter(c => c.domain === outro), `${outro}:`);
            if (arvore.length === 0) continue;
            saida.push({
                value: `__setor__${outro}`,
                label: `▸ Categorias de ${NOME_DO_SETOR[outro]}`.toUpperCase(),
                isHeader: true,
            });
            saida.push(...arvore);
        }
    }

    if (valorAtual && !saida.some(o => o.value === valorAtual)) {
        const atual = ativas.find(c => c.id === valorAtual);
        if (atual) {
            saida.push({ value: '__g__legado', label: 'FORA DE GRUPO', isHeader: true });
            saida.push({
                value: atual.id,
                label: (atual.name || 'SEM NOME').toUpperCase(),
                group: 'Fora de grupo',
            });
        }
    }

    return saida;
}
