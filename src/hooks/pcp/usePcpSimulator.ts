import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../../services/storage';
import { OrderStatus } from '../../types';
import { simulateInsertion, SimulationResult, SchedOrder, TravasAtraso } from '../../utils/pcpScheduler';
import { segundaDaSemana } from '../../utils/pcpSemana';
import { getTodayStr } from '../../utils/date';

import { mensagemDeErro } from '@/utils/errorHandling';
export function usePcpSimulator() {
    const [baseOrders, setBaseOrders] = useState<SchedOrder[]>([]);
    const [families, setFamilies] = useState<string[]>([]);
    const [capacity, setCapacity] = useState(350);
    // Mesmas travas do cronograma — senão o simulador responderia sobre um
    // plano diferente do que a fábrica está vendo na tela ao lado.
    const [travas, setTravas] = useState<TravasAtraso>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [orders, sectors, insumos, delays] = await Promise.all([
                    storageService.getOrders(), storageService.getSectors(false),
                    storageService.getInsumos(), storageService.getOrderDelays(),
                ]);
                const t: TravasAtraso = {};
                for (const d of delays) {
                    if (!t[d.order_id] || d.liberado_em > t[d.order_id]) t[d.order_id] = d.liberado_em;
                }
                setTravas(t);
                const positives = sectors.map(s => s.weekly_capacity_pieces).filter(c => c > 0);
                setCapacity(positives.length ? Math.min(...positives) : 350);
                // Mesma regra do cronograma: agrupa pela família do tecido, não
                // pela faixa de preço, senão a troca de setup conta em dobro.
                const familyByInsumo = new Map(
                    insumos.filter(i => i.fabric_family).map(i => [i.id, i.fabric_family!]));
                setFamilies([...new Set(familyByInsumo.values())].sort());
                setBaseOrders(orders
                    .filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.IN_PRODUCTION)
                    .map(o => {
                        const first = (o.items || [])[0];
                        return {
                            id: o.id, order_number: o.order_number,
                            deadline: o.deadline || '2999-12-31',
                            pieces: (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0),
                            fabric: (first?.fabric_insumo_id ? familyByInsumo.get(first.fabric_insumo_id) : undefined)
                                || first?.fabric_name || '',
                            color: first?.color || '',
                            product_type: first?.product_name || '',
                        };
                    }));
            } catch (e: any) {
                setError(mensagemDeErro(e, 'Falha ao carregar dados para simulação'));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const simulate = useCallback((pieces: number, deadline: string, fabric?: string, color?: string, product_type?: string): SimulationResult => {
        return simulateInsertion(baseOrders, capacity, segundaDaSemana(getTodayStr()), {
            id: '__SIM__', order_number: 'NOVO', deadline, pieces, fabric, color, product_type,
        }, travas);
    }, [baseOrders, capacity, travas]);

    return { simulate, capacity, families, baseCount: baseOrders.length, loading, error };
}
