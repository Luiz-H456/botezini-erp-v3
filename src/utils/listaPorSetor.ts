/**
 * Agrupamento da lista de cadastros por categoria, em seções por setor.
 *
 * A lista era plana e ordenada por nada em especial. Agrupar por categoria dá
 * a organização pedida — e, de brinde, torna VISÍVEL um problema que já
 * existia calado: categoria de produto e categoria financeira cadastradas como
 * categoria de cliente. Numa lista plana isso passava batido; separado em
 * seções nomeadas por setor, salta aos olhos e dá para arrumar.
 *
 * A seção do setor da própria página vem sempre primeiro: numa tela de
 * clientes, categorias de cliente são o assunto, e o resto é desvio.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export type Setor = 'crm' | 'inventory' | 'finance';

/** O que a linha precisa expor para ser agrupada. */
export interface LinhaCategorizavel {
    category?: string | null;
    global_category_id?: string | null;
}

/** O mínimo que precisamos saber de uma categoria do catálogo. */
export interface CategoriaConhecida {
    id: string;
    name?: string;
    domain?: string;
}

/** Sem categoria nenhuma — vai para o fim, sempre. */
export const SEM_CATEGORIA = 'Sem categoria';

export interface SecaoDaLinha {
    /** Setor a que a categoria REALMENTE pertence, ou null se não sabemos. */
    setor: Setor | null;
    /** Nome da categoria já resolvido, ou SEM_CATEGORIA. */
    categoria: string;
    /** true quando a categoria não é do setor desta página. */
    forasteira: boolean;
}

/**
 * Rótulo da seção como a tela mostra.
 *
 * O setor da página ganha nome próprio ("Categorias de cliente") em vez do nome
 * do domínio, porque `crm` cobre cliente E fornecedor — na tela de clientes o
 * que importa é que aquilo é categoria de cliente, não que é "CRM".
 */
export function rotuloDaSecao(setor: Setor | null, setorDaPagina: Setor, pagina: 'clients' | 'suppliers' | 'products'): string {
    if (setor === null) return SEM_CATEGORIA;
    if (setor === setorDaPagina) {
        if (pagina === 'clients') return 'Categorias de cliente';
        if (pagina === 'suppliers') return 'Categorias de fornecedor';
        return 'Categorias de produto';
    }
    if (setor === 'crm') return 'Categorias de cliente e fornecedor';
    if (setor === 'inventory') return 'Categorias de produto';
    return 'Categorias financeiras';
}

/**
 * A que seção esta linha pertence.
 *
 * O vínculo pelo id manda; o nome copiado é a rede de segurança do registro
 * antigo, criado antes do catálogo existir. Nome sem vínculo tenta casar por
 * nome no catálogo — é o que reconhece "Despesas fixas" cadastrada à mão num
 * cliente como sendo, na verdade, categoria financeira.
 */
export function secaoDaLinha(
    linha: LinhaCategorizavel,
    categorias: CategoriaConhecida[] | undefined,
    setorDaPagina: Setor,
): SecaoDaLinha {
    const lista = categorias || [];
    const porId = new Map(lista.map(c => [c.id, c]));

    const porVinculo = linha.global_category_id ? porId.get(linha.global_category_id) : undefined;
    const nomeCru = (linha.category || '').trim();

    const achada = porVinculo
        || (nomeCru
            ? lista.find(c => (c.name || '').trim().toLowerCase() === nomeCru.toLowerCase())
            : undefined);

    const categoria = (porVinculo?.name || '').trim() || nomeCru;
    if (!categoria) {
        return { setor: null, categoria: SEM_CATEGORIA, forasteira: false };
    }

    const setor = (achada?.domain as Setor | undefined) ?? null;
    return {
        setor,
        categoria,
        // Categoria que não existe no catálogo não é acusada de forasteira: ela
        // é só legado sem vínculo, e marcá-la de errado seria culpar o usuário
        // por um dado que o próprio sistema criou antes de ter catálogo.
        forasteira: setor !== null && setor !== setorDaPagina,
    };
}

/**
 * Ordem das seções: a da página primeiro, depois as outras numa ordem fixa,
 * sem categoria no fim.
 *
 * Pesos distintos para cada setor de propósito. Empatar dois setores faria a
 * ordem entre eles cair no nome da categoria, e aí as seções se intercalariam
 * — "Despesas fixas" antes de "Jaleco" só porque D vem antes de J, misturando
 * financeiro com produto no meio da lista.
 */
function pesoDoSetor(setor: Setor | null, setorDaPagina: Setor): number {
    if (setor === null) return 9;               // sem categoria, sempre por último
    if (setor === setorDaPagina) return 0;      // o assunto da página
    if (setor === 'crm') return 1;
    if (setor === 'inventory') return 2;
    return 3;                                   // finance
}

export interface LinhaAgrupada<T> {
    item: T;
    secao: SecaoDaLinha;
}

/**
 * Ordena para que as seções fiquem contíguas, e devolve cada linha já com a
 * sua seção.
 *
 * Ordenar ANTES de paginar é o que mantém a seção inteira junta: paginar
 * primeiro e agrupar depois espalharia a mesma categoria por várias páginas,
 * que é justamente a desorganização que se quer resolver.
 */
export function ordenarPorSecao<T extends LinhaCategorizavel>(
    itens: T[],
    categorias: CategoriaConhecida[] | undefined,
    setorDaPagina: Setor,
    nomeDoItem: (item: T) => string,
): LinhaAgrupada<T>[] {
    return (itens || [])
        .map(item => ({ item, secao: secaoDaLinha(item, categorias, setorDaPagina) }))
        .sort((a, b) => {
            const ps = pesoDoSetor(a.secao.setor, setorDaPagina) - pesoDoSetor(b.secao.setor, setorDaPagina);
            if (ps !== 0) return ps;
            const pc = a.secao.categoria.localeCompare(b.secao.categoria, 'pt-BR');
            if (pc !== 0) return pc;
            return nomeDoItem(a.item).localeCompare(nomeDoItem(b.item), 'pt-BR');
        });
}
