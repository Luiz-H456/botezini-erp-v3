/**
 * Tecidos usados em pedidos que não têm preço NENHUM (sugestões do lucro, 17/10).
 *
 * "Sem preço" pela mesma fila do lucro por pedido: sem referência da tabela do fornecedor, sem compra
 * (último preço pago) e sem custo médio.
 * Sem um dos dois, o material do pedido sai incompleto e o lucro vira teto. Só conta o que importa
 * agora — pedidos ativos e os entregues nos últimos 90 dias —, no espírito de produtosSemFichaQueVenderam.
 * Puro, sem import do app.
 */
import { previstoDoPedido } from './compras.ts';
import { somarDias } from '../financas/base.ts';
import { parseBRL } from '../currency.ts';
import type { PLBomLine, PLInsumo, PLOrder } from '../purchaseList.ts';

const ATIVOS = new Set(['Pendente', 'Em Produção']);
export const DIAS_DE_ENTREGUES = 90;

const ehTecido = (i: PLInsumo) => ['tecidos', 'tecido'].includes((i.category ?? '').toLowerCase());

export function tecidosSemPrecoUsados(e: {
    pedidos: Array<PLOrder & { status: string; delivered_at?: string | null }>;
    fichas: Map<string, PLBomLine[]>;
    insumos: Map<string, PLInsumo>;
    ultimoPreco: Map<string, number>;
    /** insumo_id → custo de referência da tabela verdade (mapaDeReferencia): vem antes da compra no lucro. */
    referencia?: Map<string, number>;
    hoje: string;
}): { id: string; name: string }[] {
    const desde = somarDias(e.hoje, -DIAS_DE_ENTREGUES);
    const relevantes = e.pedidos.filter(p => ATIVOS.has(p.status)
        || (p.status === 'Entregue' && (p.delivered_at ?? '').slice(0, 10) >= desde));

    const usados = new Set<string>();
    for (const p of relevantes) {
        for (const id of previstoDoPedido(p, e.fichas, e.insumos).porInsumo.keys()) usados.add(id);
        // O tecido escolhido no item conta mesmo quando o produto não tem ficha.
        for (const i of p.items || []) if (i.fabric_insumo_id) usados.add(i.fabric_insumo_id);
    }

    return [...usados]
        .map(id => e.insumos.get(id))
        .filter((i): i is PLInsumo => !!i && ehTecido(i) && !((e.referencia?.get(i.id) ?? 0) > 0)
            && !((e.ultimoPreco.get(i.id) ?? 0) > 0) && !(Number(i.average_unit_cost) > 0))
        .map(i => ({ id: i.id, name: i.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Preço digitado no formato brasileiro; zero, negativo ou ilegível = null (não grava). */
export function precoDeReferencia(texto: string): number | null {
    const v = parseBRL(texto);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 10000) / 10000 : null;
}
