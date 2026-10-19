/**
 * Especificação da linha do orçamento: o resumo curto e a cópia de uma linha para outras.
 * Spec do S3, seção 5B. Os campos são os do BudgetItem de hoje — nada novo no banco.
 */
export interface ItemComEspecificacao {
    sleeve_type?: string; gender?: string; fit?: string; has_band?: boolean; prod_notes?: string;
    fabric_insumo_id?: string; fabric_name?: string; fabric: string; color: string;
    quantity: number; unit_price: number; total: number;
}

export type GrupoCopiavel = 'opcionais' | 'detalhes' | 'tecido' | 'preco';

const CAMPOS: Record<GrupoCopiavel, (keyof ItemComEspecificacao)[]> = {
    opcionais: ['sleeve_type', 'gender', 'fit', 'has_band'],
    detalhes: ['prod_notes'],
    // O insumo carrega a faixa de preço da cor: tecido e cor só fazem sentido juntos.
    tecido: ['fabric_insumo_id', 'fabric_name', 'fabric', 'color'],
    preco: ['unit_price'],
};

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Copia da origem só os grupos pedidos. "Não definido" na origem também é copiado (limpa o destino). */
export function copiarEspecificacao<T extends ItemComEspecificacao>(origem: T, destino: T, grupos: GrupoCopiavel[]): T {
    const novo = { ...destino };
    for (const g of grupos) for (const campo of CAMPOS[g]) (novo as any)[campo] = (origem as any)[campo];
    if (grupos.includes('preco')) novo.total = centavos((Number(novo.quantity) || 0) * (Number(novo.unit_price) || 0));
    return novo;
}

const ROTULO: Record<string, string> = {
    manga_curta: 'Manga curta', manga_longa: 'Manga longa', sem_manga: 'Sem manga', outro: 'Manga: outro',
    masculino: 'Masc', feminino: 'Fem', infantil: 'Infantil', unissex: 'Unissex',
    slim: 'Slim', regular: 'Regular', oversized: 'Oversized', babylook: 'Babylook', plus_size: 'Plus size',
};

export function resumoDaEspecificacao(item: ItemComEspecificacao): string {
    const partes = [item.sleeve_type, item.gender, item.fit]
        .filter((v): v is string => !!v)
        .map(v => ROTULO[v] || v);
    if (item.has_band) partes.push('Faixa');
    if (item.prod_notes?.trim()) partes.push('Detalhes');
    return partes.length ? partes.join(' · ') : 'sem especificação';
}
