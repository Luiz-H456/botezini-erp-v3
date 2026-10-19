import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../../services/storage';
import { OrderStatus } from '../../types';
import { OrderDelay } from '../../types/pcp';
import { planSchedule, ScheduleResult, SchedOrder, TravasAtraso } from '../../utils/pcpScheduler';
import { segundaDaSemana } from '../../utils/pcpSemana';
import { getTodayStr } from '../../utils/date';
import { useCargaProgressiva } from '../useCargaProgressiva';

const EMPTY: ScheduleResult = { weeks: [], late_count: 0, setup_changes: 0, setup_changes_ungrouped: 0, setup_saved: 0 };

/**
 * A trava vigente de cada pedido é a de data mais distante — um pedido pode
 * ter atrasado várias vezes, e o que manda no plano é a última liberação.
 */
function travasVigentes(delays: OrderDelay[]): TravasAtraso {
    const t: TravasAtraso = {};
    for (const d of delays) {
        if (!t[d.order_id] || d.liberado_em > t[d.order_id]) t[d.order_id] = d.liberado_em;
    }
    return t;
}

export function usePcpSchedule() {
    const [result, setResult] = useState<ScheduleResult>(EMPTY);
    const [weeklyCapacity, setWeeklyCapacity] = useState(0);
    const [delays, setDelays] = useState<OrderDelay[]>([]);
    const carga = useCargaProgressiva();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    // Marca d'água do último recálculo, para a tela mostrar que o clique surtiu
    // efeito mesmo quando o plano não muda (nada atrasou → mesmo resultado).
    const [recalculadoEm, setRecalculadoEm] = useState<Date | null>(null);

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [orders, sectors, clients, insumos, delaysDb] = await Promise.all([
                storageService.getOrders(),
                storageService.getSectors(false),
                storageService.getClients(),
                storageService.getInsumos(),
                storageService.getOrderDelays(),
            ]);
            const clientById = new Map(clients.map(c => [c.id, c]));
            // Agrupa pela FAMÍLIA do tecido, não pelo insumo. As 3 faixas de
            // preço por cor são o mesmo tecido na máquina — contar como tecidos
            // diferentes inflaria a troca de setup (a cor já é contada à parte).
            const familyByInsumo = new Map(
                insumos.filter(i => i.fabric_family).map(i => [i.id, i.fabric_family!]));
            // Gargalo = menor capacidade positiva entre os setores (limita a linha).
            const positives = sectors.map(s => s.weekly_capacity_pieces).filter(c => c > 0);
            const capacity = positives.length ? Math.min(...positives) : 350;

            const active = orders.filter(o =>
                o.status === OrderStatus.PENDING || o.status === OrderStatus.IN_PRODUCTION);

            const sched: SchedOrder[] = active.map(o => {
                const first = (o.items || [])[0];
                const c = clientById.get(o.client_id);
                return {
                    id: o.id,
                    order_number: o.order_number,
                    client_name: c?.company_name,
                    client_contact: c?.contact_person,
                    deadline: o.deadline || '2999-12-31',
                    pieces: (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0),
                    fabric: (first?.fabric_insumo_id ? familyByInsumo.get(first.fabric_insumo_id) : undefined)
                        || first?.fabric_name || first?.fabric_insumo_id || first?.fabric || '',
                    color: first?.color || '',
                    product_type: first?.product_name || '',
                };
            });

            // Atraso de pedido que já saiu (entregue/cancelado) não tem mais o
            // que travar — some da lista para não poluir a tela para sempre.
            const ativos = new Set(active.map(o => o.id));
            const vivos = delaysDb.filter(d => ativos.has(d.order_id));

            setDelays(vivos);
            setWeeklyCapacity(capacity);
            setResult(planSchedule(sched, capacity, segundaDaSemana(getTodayStr()), travasVigentes(vivos)));
            setRecalculadoEm(new Date());
        } catch (e: any) {
            setError(e?.message || 'Falha ao gerar o cronograma');
            setResult(EMPTY);
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const registrarAtraso = useCallback(async (opts: { order_id: string; dias: number; motivo: string }) => {
        setBusy(true); setError('');
        try {
            await storageService.registrarOrderDelay(opts);
            await load();   // replaneja já com a trava nova
        } catch (e: any) {
            setError(e?.message || 'Falha ao registrar o atraso');
            throw e;
        } finally {
            setBusy(false);
        }
    }, [load]);

    const removerAtraso = useCallback(async (id: string) => {
        setBusy(true); setError('');
        try {
            await storageService.deleteOrderDelay(id);
            await load();
        } catch (e: any) {
            setError(e?.message || 'Falha ao remover o atraso');
        } finally {
            setBusy(false);
        }
    }, [load]);

    return {
        result, weeklyCapacity, delays, error,
        loading: carga.carregando, busy: busy || carga.recarregando,
        reload: load, recalcular: load, recalculadoEm,
        registrarAtraso, removerAtraso,
    };
}
