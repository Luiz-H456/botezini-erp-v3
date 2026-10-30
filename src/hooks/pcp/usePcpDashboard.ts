import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../../services/storage';
import { OrderStatus } from '../../types';
import { getTodayStr } from '../../utils';
import { PcpDashboard } from '../../types/pcp';
import { computePcpDashboard } from '../../utils/pcpDashboard';
import { useCargaProgressiva } from '../useCargaProgressiva';

import { mensagemDeErro } from '@/utils/errorHandling';
const EMPTY: PcpDashboard = {
    factory_occupancy_pct: 0, pending_count: 0, in_production_count: 0,
    late: [], upcoming: [], sector_loads: [], total_active_pieces: 0, total_capacity: 0,
};

export function usePcpDashboard() {
    const [data, setData] = useState<PcpDashboard>(EMPTY);
    const carga = useCargaProgressiva();
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [orders, sectors, clients] = await Promise.all([
                storageService.getOrders(),
                storageService.getSectors(false),
                storageService.getClients(),
            ]);
            const clientById = new Map(clients.map(c => [c.id, c]));
            const active = orders.filter(o =>
                o.status === OrderStatus.PENDING || o.status === OrderStatus.IN_PRODUCTION);
            setData(computePcpDashboard(
                active.map(o => {
                    const c = clientById.get(o.client_id);
                    return {
                        id: o.id, order_number: o.order_number,
                        client_name: c?.company_name, client_contact: c?.contact_person,
                        deadline: o.deadline,
                        production_stage: o.production_stage, status: o.status, items: o.items || [],
                    };
                }),
                sectors,
                getTodayStr(),
            ));
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao carregar o painel'));
            setData(EMPTY);
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return { data, error, reload: load, loading: carga.carregando, recarregando: carga.recarregando };
}
