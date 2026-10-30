import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../../services/storage';
import type { Insumo, Supplier } from '../../types';
import { comprasRepository } from '../../repositories/comprasRepository';
import { useCargaProgressiva } from '../useCargaProgressiva';
import {
    computePurchaseList, PurchaseListResult, PLOrder, PLBomLine, PLInsumo,
} from '../../utils/purchaseList';
import { entraNasCompras } from '../../utils/fabrica/compras';

import { mensagemDeErro } from '@/utils/errorHandling';
export interface PedidoAtivo { id: string; order_number: string; deadline: string }

export type WeekFilter = 'open' | 'this_week' | 'next_week';

const EMPTY: PurchaseListResult = { lines: [], total_cost: 0, orders_count: 0, products_without_bom: [] };

// Segunda a domingo da semana que contém `ref` (offset em semanas).
function weekRange(offsetWeeks = 0): { start: Date; end: Date } {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7; // 0 = segunda
    const monday = new Date(d);
    monday.setDate(d.getDate() - dow + offsetWeeks * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
}

export function usePurchaseList(filtroInicial: WeekFilter = 'open') {
    const [filter, setFilter] = useState<WeekFilter>(filtroInicial);
    const [result, setResult] = useState<PurchaseListResult>(EMPTY);
    const [productNames, setProductNames] = useState<Map<string, string>>(new Map());
    const [pedidosAtivos, setPedidosAtivos] = useState<PedidoAtivo[]>([]);
    const [numerosDosPedidos, setNumerosDosPedidos] = useState<Map<string, string>>(new Map());
    const [insumos, setInsumos] = useState<Insumo[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [avisoVinculo, setAvisoVinculo] = useState('');
    const carga = useCargaProgressiva();
    const [error, setError] = useState('');

    const load = useCallback(async (f: WeekFilter) => {
        carga.iniciar();
        setError('');
        setAvisoVinculo('');
        try {
            const [orders, insumosAll, products, fornecedores] = await Promise.all([
                storageService.getOrders(),
                storageService.getInsumos(),
                storageService.getProducts(),
                // Só alimenta o seletor de fornecedor: se falhar, a lista não pode sumir junto.
                storageService.getSuppliers().catch(() => [] as Supplier[]),
            ]);

            // Só pedidos ativos e de depois da virada (os de antes são legado).
            let active = orders.filter(entraNasCompras);
            // Destinos possíveis de uma compra: todo pedido ativo, não só os do filtro de semana.
            const todosAtivos = active;

            if (f !== 'open') {
                const { start, end } = weekRange(f === 'next_week' ? 1 : 0);
                active = active.filter(o => {
                    if (!o.deadline) return false;
                    const dl = new Date(o.deadline + 'T12:00:00');
                    return dl >= start && dl <= end;
                });
            }

            // BOM por produto (só os produtos presentes nos pedidos ativos).
            const productIds = Array.from(new Set(
                active.flatMap(o => (o.items || []).map(i => i.product_id)).filter(Boolean)));
            // Leitura à risca (a mesma do Início): ficha que falhou lança e cai no `error` abaixo,
            // em vez de listar MENOS a comprar como se o produto não tivesse ficha.
            const bomByProduct: Map<string, PLBomLine[]> = await comprasRepository.fichasDoPedidoEstrito(productIds);

            // Falha ao ler as compras já lançadas não zera a lista: ela mostra tudo como falta, com aviso.
            let vinculados = new Map<string, Map<string, number>>();
            try {
                vinculados = await comprasRepository.vinculadoPorPedido(active.map(o => o.id));
            } catch (e) {
                console.error('vinculadoPorPedido:', e);
                setAvisoVinculo('Não consegui ler as compras já lançadas: a lista mostra tudo como falta.');
            }

            const insumoById = new Map<string, PLInsumo>(
                insumosAll.map(i => [i.id, {
                    id: i.id, name: i.name, unit: i.unit,
                    current_stock: Number(i.current_stock) || 0,
                    average_unit_cost: Number(i.average_unit_cost) || 0,
                    category: i.category,
                }]));

            const plOrders: PLOrder[] = active.map(o => ({
                id: o.id, order_number: o.order_number, deadline: o.deadline,
                items: (o.items || []).map(it => ({
                    product_id: it.product_id, quantity: Number(it.quantity) || 0,
                    fabric_insumo_id: it.fabric_insumo_id,
                })),
            }));

            setProductNames(new Map(products.map(p => [p.id, p.name])));
            setPedidosAtivos(todosAtivos.map(o => ({ id: o.id, order_number: o.order_number, deadline: o.deadline })));
            setNumerosDosPedidos(new Map(orders.map(o => [o.id, o.order_number])));
            setInsumos(insumosAll);
            setSuppliers(fornecedores);
            setResult(computePurchaseList(plOrders, bomByProduct, insumoById, vinculados));
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao gerar a lista de compras'));
            setResult(EMPTY);
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(filter); }, [filter, load]);

    return { filter, setFilter, result, productNames, error, avisoVinculo,
        pedidosAtivos, numerosDosPedidos, insumos, suppliers, reload: () => load(filter),
        loading: carga.carregando, recarregando: carga.recarregando };
}
