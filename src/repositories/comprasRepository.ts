import { supabase } from '@/services/supabase';
import type { Compra, Order } from '@/types';
import { getTodayStr } from '@/utils/date';
import { isFuncaoAusente } from '@/utils/postgrestErrors';
import { somarVinculado, somarCustoVinculado, ultimoPrecoPorInsumo } from '@/utils/fabrica/vinculado';
import type { CustoVinculado } from '@/utils/fabrica/vinculado';
import { lerEmPaginas } from '@/utils/financas/paginas';
import { agruparFichas, desdeDaRecuperacao, entreguesSemSobra } from '@/utils/fabrica/recuperarSobra';

const PEDIDOS_POR_BLOCO = 40;
const LIMITE_DE_LINHAS = 200000;
const PRODUTOS_POR_BLOCO = 200;

/** Pedido com o que a apuração da sobra precisa. */
export type PedidoParaSobra = Pick<Order, 'id' | 'order_number' | 'deadline' | 'items'>;

/** Lê uma consulta inteira (paginada) para `destino`. Qualquer falha ou corte por volume lança: nunca devolve leitura parcial. */
async function ler<T>(
    buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    destino: T[],
): Promise<void> {
    const { linhas, truncado, erro } = await lerEmPaginas<T>(buscar, LIMITE_DE_LINHAS);
    if (erro) throw new Error(erro);
    if (truncado) throw new Error('Compras vinculadas: volume acima do limite de leitura');
    destino.push(...linhas);
}

/** Compras por pedido (ver supabase/compras_por_pedido.sql). Tudo que grava passa por RPC. */
export const comprasRepository = {
    async lancarCompra(
        compra: { fornecedor_id?: string; fornecedor_nome?: string; data?: string; notas?: string },
        itens: { insumo_id: string; quantidade: number; custo_unitario: number; pedido_id?: string | null }[],
    ): Promise<string> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.rpc('lancar_compra', { p_compra: compra, p_itens: itens });
        if (error) throw new Error(error.message);
        return data as string;
    },

    async excluirCompra(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.rpc('excluir_compra', { p_compra_id: id });
        if (error) throw new Error(error.message);
    },

    async comprasDoPeriodo(de: string, ate: string): Promise<Compra[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('compras')
            .select('*, itens:compra_itens(*)')
            .gte('data', de)
            .lte('data', ate)
            .order('data', { ascending: false })
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return (data || []) as Compra[];
    },

    /**
     * Dados de gestão (compra_itens): só quem gerencia lê. pedido -> insumo -> quantidade.
     *
     * Blocos de 40 pedidos (a lista vai na URL) e cada consulta paginada: o PostgREST corta a
     * resposta em 1.000 linhas sem avisar, e uma soma parcial faria faltar mais do que falta.
     * Qualquer falha lança; nunca devolve soma parcial.
     */
    async vinculadoPorPedido(pedidoIds: string[]): Promise<Map<string, Map<string, number>>> {
        const ids = [...new Set(pedidoIds)];
        if (!supabase || ids.length === 0) return new Map();
        const client = supabase;
        const itens: Parameters<typeof somarVinculado>[0] = [];
        const usos: Parameters<typeof somarVinculado>[1] = [];
        for (let i = 0; i < ids.length; i += PEDIDOS_POR_BLOCO) {
            const bloco = ids.slice(i, i + PEDIDOS_POR_BLOCO);
            await Promise.all([
                ler((de, ate) => client.from('compra_itens').select('id, pedido_id, insumo_id, quantidade')
                    .in('pedido_id', bloco).order('id', { ascending: true }).range(de, ate), itens),
                ler((de, ate) => client.from('insumo_movements').select('id, reference_id, insumo_id, quantity')
                    .in('reference_id', bloco).eq('source', 'uso_estoque').eq('type', 'OUT')
                    .order('id', { ascending: true }).range(de, ate), usos),
            ]);
        }
        return somarVinculado(itens, usos);
    },

    /**
     * Como `vinculadoPorPedido`, com o valor (compra: custo_unitario; uso do estoque: unit_cost), para o
     * lucro por pedido usar o preço que o pedido pagou. Dado de gestão; lido à risca, paginado, em blocos.
     */
    async custoVinculadoPorPedido(pedidoIds: string[]): Promise<Map<string, Map<string, CustoVinculado>>> {
        const ids = [...new Set(pedidoIds)];
        if (!supabase || ids.length === 0) return new Map();
        const client = supabase;
        const itens: Parameters<typeof somarCustoVinculado>[0] = [];
        const usos: Parameters<typeof somarCustoVinculado>[1] = [];
        for (let i = 0; i < ids.length; i += PEDIDOS_POR_BLOCO) {
            const bloco = ids.slice(i, i + PEDIDOS_POR_BLOCO);
            await Promise.all([
                ler((de, ate) => client.from('compra_itens').select('id, pedido_id, insumo_id, quantidade, custo_unitario')
                    .in('pedido_id', bloco).order('id', { ascending: true }).range(de, ate), itens),
                ler((de, ate) => client.from('insumo_movements').select('id, reference_id, insumo_id, quantity, unit_cost')
                    .in('reference_id', bloco).eq('source', 'uso_estoque').eq('type', 'OUT')
                    .order('id', { ascending: true }).range(de, ate), usos),
            ]);
        }
        return somarCustoVinculado(itens, usos);
    },

    /** Último preço pago por insumo, em qualquer compra (vinculada ou não). Lido à risca. */
    async ultimoPrecoPorInsumo(): Promise<Map<string, number>> {
        if (!supabase) return new Map();
        const client = supabase;
        // item → compra é muitos-para-um: o PostgREST devolve um objeto; o tipo gerado diz lista. Aceita os dois.
        const linhas: { id: string; insumo_id: string; custo_unitario: number | string; compra: { data: string } | { data: string }[] | null }[] = [];
        await ler((de, ate) => client.from('compra_itens').select('id, insumo_id, custo_unitario, compra:compras(data)')
            .order('id', { ascending: true }).range(de, ate), linhas);
        const dataDa = (c: (typeof linhas)[number]['compra']) => (Array.isArray(c) ? c[0]?.data : c?.data) ?? '';
        return ultimoPrecoPorInsumo(linhas.map(l => ({ insumo_id: l.insumo_id, custo_unitario: l.custo_unitario, data: dataDa(l.compra), id: l.id })));
    },

    /** Pela RPC, para a fábrica (que não lê compra_itens). null = a função ainda não existe no banco (SQL não rodado). */
    async vinculadoAoPedido(orderId: string): Promise<Map<string, number> | null> {
        if (!supabase) return new Map();
        const { data, error } = await supabase.rpc('vinculado_ao_pedido', { p_order_id: orderId });
        if (error) {
            if (isFuncaoAusente(error, 'vinculado_ao_pedido')) return null;
            throw new Error(error.message);
        }
        const mapa = new Map<string, number>();
        for (const r of (data || []) as { insumo_id: string; quantidade: number | string }[]) {
            mapa.set(r.insumo_id, (mapa.get(r.insumo_id) ?? 0) + Number(r.quantidade));
        }
        return mapa;
    },

    /**
     * Insumos para a sobra, só o que a conta usa (id, nome, unidade, categoria): sem saldo nem custo,
     * porque a fábrica também chama isto. Lido à risca: erro ou corte por volume lança.
     */
    async insumosParaSobra(): Promise<{ id: string; name: string; unit: string; category?: string }[]> {
        if (!supabase) return [];
        const client = supabase;
        const linhas: { id: string; name: string; unit: string; category?: string }[] = [];
        await ler((de, ate) => client.from('insumos').select('id, name, unit, category')
            .order('id', { ascending: true }).range(de, ate), linhas);
        return linhas;
    },

    /**
     * Ficha dos produtos, LIDA À RISCA para a sobra: erro, ou corte por volume, lança.
     * (`getProductInsumosByProducts` engole erro e devolve lista vazia, o que aqui leria como
     * "produto sem ficha" e travaria o pedido com sobra zero.) Produto sem ficha de verdade
     * volta com lista vazia, só quando a leitura inteira deu certo.
     */
    async fichasDoPedidoEstrito(productIds: string[]): Promise<Map<string, { insumo_id: string; quantity: number }[]>> {
        const ids = [...new Set(productIds.filter(Boolean))];
        if (!supabase || ids.length === 0) return new Map(ids.map(id => [id, []]));
        const client = supabase;
        const linhas: { id: string; product_id: string; insumo_id: string; quantity: number | string }[] = [];
        for (let i = 0; i < ids.length; i += PRODUTOS_POR_BLOCO) {
            const bloco = ids.slice(i, i + PRODUTOS_POR_BLOCO);
            await ler((de, ate) => client.from('product_insumos').select('id, product_id, insumo_id, quantity')
                .in('product_id', bloco).order('id', { ascending: true }).range(de, ate), linhas);
        }
        const porProduto = agruparFichas(ids, linhas);
        return new Map([...porProduto].map(([pid, l]) => [pid, l.map(b => ({ insumo_id: b.insumo_id, quantity: Number(b.quantity) }))]));
    },

    /**
     * Pedidos entregues nos últimos 90 dias (delivered_at; sem ele, updated_at) que têm algo
     * vinculado (compra ou uso do estoque) e nenhuma sobra apurada — a fila de recuperação.
     * Dados de gestão (compra_itens): só quem gerencia lê. Qualquer falha lança.
     */
    async entreguesSemSobra(): Promise<PedidoParaSobra[]> {
        if (!supabase) return [];
        const client = supabase;
        const desde = desdeDaRecuperacao(getTodayStr());
        const entregues: { id: string; delivered_at: string | null; updated_at: string | null }[] = [];
        await ler((de, ate) => client.from('orders').select('id, delivered_at, updated_at').eq('status', 'Entregue')
            .or(`delivered_at.gte.${desde},and(delivered_at.is.null,updated_at.gte.${desde})`)
            .order('id', { ascending: true }).range(de, ate), entregues);

        const comVinculo = new Set<string>();
        const apuradas = new Set<string>();
        for (let i = 0; i < entregues.length; i += PEDIDOS_POR_BLOCO) {
            const bloco = entregues.slice(i, i + PEDIDOS_POR_BLOCO).map(o => o.id);
            const itens: { id: string; pedido_id: string }[] = [];
            const usos: { id: string; reference_id: string }[] = [];
            const feitas: { order_id: string }[] = [];
            await Promise.all([
                ler((de, ate) => client.from('compra_itens').select('id, pedido_id').in('pedido_id', bloco)
                    .order('id', { ascending: true }).range(de, ate), itens),
                ler((de, ate) => client.from('insumo_movements').select('id, reference_id').in('reference_id', bloco)
                    .eq('source', 'uso_estoque').eq('type', 'OUT').order('id', { ascending: true }).range(de, ate), usos),
                ler((de, ate) => client.from('pedido_sobra_apurada').select('order_id').in('order_id', bloco)
                    .order('order_id', { ascending: true }).range(de, ate), feitas),
            ]);
            itens.forEach(r => comVinculo.add(r.pedido_id));
            usos.forEach(r => comVinculo.add(r.reference_id));
            feitas.forEach(r => apuradas.add(r.order_id));
        }

        const fila = entreguesSemSobra(entregues, comVinculo, apuradas, desde);
        const porId = new Map<string, PedidoParaSobra>();
        for (let i = 0; i < fila.length; i += PEDIDOS_POR_BLOCO) {
            const bloco = fila.slice(i, i + PEDIDOS_POR_BLOCO).map(o => o.id);
            const pedidos: PedidoParaSobra[] = [];
            await ler((de, ate) => client.from('orders').select('id, order_number, deadline, items').in('id', bloco)
                .order('id', { ascending: true }).range(de, ate), pedidos);
            pedidos.forEach(p => porId.set(p.id, p));
        }
        return fila.map(o => porId.get(o.id)).filter((p): p is PedidoParaSobra => !!p);
    },

    /** `null` quando a função ainda não existe no banco (SQL não rodado); a entrega segue sem apurar. */
    async apurarSobras(
        orderId: string,
        sobras: { insumo_id: string; quantidade: number }[],
    ): Promise<{ jaFeita: boolean; movimentos: number } | null> {
        if (!supabase) return null;
        const { data, error } = await supabase.rpc('apurar_sobras_do_pedido', {
            p_order_id: orderId, p_sobras: sobras,
        });
        if (error) {
            if (isFuncaoAusente(error, 'apurar_sobras_do_pedido')) {
                console.warn('[compras] apuração de sobras indisponível: rode supabase/compras_por_pedido.sql.');
                return null;
            }
            throw new Error(error.message);
        }
        const r = (data || {}) as Record<string, unknown>;
        return { jaFeita: Boolean(r.ja_feita), movimentos: Number(r.movimentos) || 0 };
    },
};
