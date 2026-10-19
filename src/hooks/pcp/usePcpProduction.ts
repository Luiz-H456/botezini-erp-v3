import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../../services/storage';
import { OrderStatus, Order, Client, CompanyProfile } from '../../types';
import { ProductionSector, ProductionLog, OrderProgress } from '../../types/pcp';
import { computeOrderProgress } from '../../utils/pcpProduction';
import { saldoPorItem, feitoSemItem, SaldoItem } from '../../utils/baixaPorItem';
import { useCargaProgressiva } from '../useCargaProgressiva';

export interface ProdOrderRow {
    order: Order;
    progress: OrderProgress;
    client_name?: string;
    client_contact?: string;
    /** Cliente completo — o preview do pedido precisa de CNPJ, endereço etc. */
    client?: Client;
}

export function usePcpProduction() {
    const [rows, setRows] = useState<ProdOrderRow[]>([]);
    const [sectors, setSectors] = useState<ProductionSector[]>([]);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
    // Logs ficam em estado para o saldo por item sair sem uma segunda ida ao
    // banco a cada vez que o modal de baixa abre.
    const [logs, setLogs] = useState<ProductionLog[]>([]);
    const carga = useCargaProgressiva();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [orders, todosLogs, secs, clients, profile] = await Promise.all([
                storageService.getOrders(),
                storageService.getProductionLogs(),
                storageService.getSectors(false),
                storageService.getClients(),
                storageService.getCompanyProfile(),
            ]);
            setCompanyProfile(profile);
            setLogs(todosLogs as ProductionLog[]);
            const clientById = new Map(clients.map(c => [c.id, c]));
            const active = orders.filter(o =>
                o.status === OrderStatus.PENDING || o.status === OrderStatus.IN_PRODUCTION);
            const progress = computeOrderProgress(
                active.map(o => ({ id: o.id, items: o.items || [] })),
                todosLogs as ProductionLog[],
            );
            setSectors(secs);
            setRows(active.map(o => {
                const c = clientById.get(o.client_id);
                return { order: o, progress: progress.get(o.id)!, client: c, client_name: c?.company_name, client_contact: c?.contact_person };
            }));
        } catch (e: any) {
            setError(e?.message || 'Falha ao carregar controle de produção');
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const logProduction = useCallback(async (opts: Parameters<typeof storageService.logProduction>[0]) => {
        setBusy(true); setError('');
        try { await storageService.logProduction(opts); await load(); }
        catch (e: any) { setError(e?.message || 'Falha ao lançar baixa'); throw e; }
        finally { setBusy(false); }
    }, [load]);

    const getLogs = (orderId: string) => storageService.getProductionLogs(orderId);

    /** Saldo de cada peça do pedido — o que já saiu e o que ainda falta. */
    const saldosDoPedido = useCallback((order: Order): SaldoItem[] =>
        saldoPorItem(order.items || [], logs.filter(l => l.order_id === order.id)),
        [logs]);

    /** Baixas antigas, sem item identificado — mostradas à parte para a conta fechar. */
    const baixaSemItem = useCallback((orderId: string): number =>
        feitoSemItem(logs.filter(l => l.order_id === orderId)),
        [logs]);

    return { rows, sectors, companyProfile, error, reload: load, logProduction, getLogs,
        saldosDoPedido, baixaSemItem,
        loading: carga.carregando, busy: busy || carga.recarregando };
}
