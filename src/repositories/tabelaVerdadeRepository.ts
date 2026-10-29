import { supabase } from '@/services/supabase';
import { lerEmPaginas } from '@/utils/financas/paginas';
import type { Catalogo, ModoFrete, TVPreco } from '@/utils/tabelaVerdade';

export interface PayloadComercial {
    fornecedor_id: string; linha_id?: string | null;
    usa_frete_do_fornecedor?: boolean; usa_condicoes_do_fornecedor?: boolean;
    frete?: { modo: ModoFrete; valor: number | null; remessa_tipica_kg: number | null };
    condicoes?: { id?: string; nome: string; ordem: number; padrao: boolean }[];
}
export interface PayloadTipo {
    id?: string; linha_id: string; nome: string; unidade: 'kg' | 'm'; rendimento_m_por_kg: number | null; composicao?: string | null;
    faixas: { id?: string; nome: string; ordem: number }[];
    cores: { nome: string; hex: string; faixa: string }[];
    precos?: { faixa: string; condicao_id: string; vale_desde?: string; valor: number | null }[];
}
export interface CompraDoInsumoTV { insumo_id: string; data: string; quantidade: number; custo_unitario: number; fornecedor_id: string | null; compra_id: string }

const LIMITE = 50000;

async function tudo<T>(buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const { linhas, truncado, erro } = await lerEmPaginas<T>(buscar, LIMITE);
    if (erro) throw new Error(erro);
    if (truncado) throw new Error('Tabela de preços: volume acima do limite de leitura');
    return linhas;
}

async function rpc<T>(nome: string, p: unknown): Promise<T> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase.rpc(nome, { p });
    if (error) throw new Error(error.message);
    return data as T;
}

type LinhaDeCompra = { insumo_id: string; quantidade: number | string; custo_unitario: number | string;
    compra: { id: string; data: string; fornecedor_id: string | null } | { id: string; data: string; fornecedor_id: string | null }[] | null };
const daCompra = (l: LinhaDeCompra): CompraDoInsumoTV | null => {
    const c = Array.isArray(l.compra) ? l.compra[0] : l.compra;
    if (!c) return null;
    return { insumo_id: l.insumo_id, data: c.data, quantidade: Number(l.quantidade), custo_unitario: Number(l.custo_unitario), fornecedor_id: c.fornecedor_id, compra_id: c.id };
};

/** Tabela verdade de tecidos (supabase/v3_1_tabela_verdade.sql). Toda escrita é RPC. */
export const tabelaVerdadeRepository = {
    /** Sem `fornecedorId`, o catálogo inteiro (para o mapa de referência). Preço/condição/frete voltam vazios para quem não é gestão (RLS). */
    async catalogo(fornecedorId?: string): Promise<Catalogo> {
        if (!supabase) return { linhas: [], condicoes: [], fretes: [], tipos: [], faixas: [], precos: [] };
        const s = supabase;
        let ql = s.from('tecido_linhas').select('*').order('ordem');
        if (fornecedorId) ql = ql.eq('fornecedor_id', fornecedorId);
        const { data: linhas, error: e1 } = await ql;
        if (e1) throw new Error(e1.message);
        const idsLinhas = (linhas || []).map(l => l.id);
        if (idsLinhas.length === 0) return { linhas: [], condicoes: [], fretes: [], tipos: [], faixas: [], precos: [] };
        let qTipos = s.from('tecido_tipos').select('*').order('ordem');
        if (fornecedorId) qTipos = qTipos.in('linha_id', idsLinhas);
        const [cond, fretes, tipos] = await Promise.all([
            s.from('fornecedor_condicoes').select('*').order('ordem'),
            s.from('fornecedor_frete').select('*'),
            qTipos,
        ]);
        for (const r of [cond, fretes, tipos]) if (r.error) throw new Error(r.error.message);
        const idsTipos = (tipos.data || []).map(t => t.id);
        const faixas = idsTipos.length
            ? await tudo((de, ate) => s.from('tecido_faixas').select('*').in('tipo_id', idsTipos).order('ordem').range(de, ate))
            : [];
        const idsFaixas = faixas.map((f: { id: string }) => f.id);
        const precos = idsFaixas.length
            ? await tudo<TVPreco>((de, ate) => s.from('tecido_precos').select('faixa_id, condicao_id, vale_desde, valor, origem')
                .in('faixa_id', idsFaixas).order('vale_desde').range(de, ate))
            : [];
        const cores = idsFaixas.length
            ? await tudo<{ color_name: string; hex: string; faixa_id: string }>((de, ate) => s.from('fabric_colors')
                .select('color_name, hex, faixa_id').in('faixa_id', idsFaixas).eq('is_active', true).order('sort_order').range(de, ate))
            : [];
        return {
            cores: cores.map(c => ({ nome: c.color_name, hex: c.hex, faixa_id: c.faixa_id })),
            linhas: linhas || [],
            condicoes: (cond.data || []).filter(c => !fornecedorId || c.fornecedor_id === fornecedorId),
            fretes: (fretes.data || []).filter(f => !fornecedorId || f.fornecedor_id === fornecedorId)
                .map(f => ({ ...f, valor: f.valor === null ? null : Number(f.valor), remessa_tipica_kg: f.remessa_tipica_kg === null ? null : Number(f.remessa_tipica_kg) })),
            tipos: (tipos.data || []).map(t => ({ ...t, rendimento_m_por_kg: t.rendimento_m_por_kg === null ? null : Number(t.rendimento_m_por_kg) })),
            faixas,
            precos: precos.map(p => ({ ...p, valor: Number(p.valor) })),
        };
    },

    async insumosComFaixa(): Promise<{ id: string; faixa_id: string }[]> {
        if (!supabase) return [];
        const s = supabase;
        return tudo((de, ate) => s.from('insumos').select('id, faixa_id').not('faixa_id', 'is', null).order('id').range(de, ate));
    },

    async comprasDosInsumos(insumoIds: string[], desde: string): Promise<CompraDoInsumoTV[]> {
        if (!supabase || insumoIds.length === 0) return [];
        const s = supabase;
        const linhas = await tudo<LinhaDeCompra>((de, ate) => s.from('compra_itens')
            .select('insumo_id, quantidade, custo_unitario, compra:compras!inner(id, data, fornecedor_id)')
            .in('insumo_id', insumoIds).gte('compra.data', desde).order('id').range(de, ate));
        return linhas.map(daCompra).filter((c): c is CompraDoInsumoTV => c !== null);
    },

    async comprasDoFornecedor(fornecedorId: string): Promise<CompraDoInsumoTV[]> {
        if (!supabase) return [];
        const s = supabase;
        const linhas = await tudo<LinhaDeCompra>((de, ate) => s.from('compra_itens')
            .select('insumo_id, quantidade, custo_unitario, compra:compras!inner(id, data, fornecedor_id)')
            .eq('compra.fornecedor_id', fornecedorId).order('id').range(de, ate));
        return linhas.map(daCompra).filter((c): c is CompraDoInsumoTV => c !== null)
            .sort((a, b) => b.data.localeCompare(a.data));
    },

    salvarComercial: (p: PayloadComercial) => rpc<void>('salvar_comercial', p),
    salvarLinha: (p: { id?: string; fornecedor_id: string; nome: string }) => rpc<string>('salvar_linha', p),
    salvarTipo: (p: PayloadTipo) => rpc<string>('salvar_tecido_tipo', p),
    reajustar: (p: { vale_desde: string; precos: { faixa_id: string; condicao_id: string; valor: number }[] }) => rpc<void>('reajustar_precos', p),
};
