import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../../services/storage';
import { useCargaProgressiva } from '../useCargaProgressiva';
import type { Client, ObligationSummary } from '../../types';
import { DeliveredUnpaidRow, OrderReconciliationRow } from '../../types/finance';

import { avisar } from '../../utils/avisos';
import { mensagemDeErro } from '../../utils/errorHandling';
/**
 * "Clientes que devem": carrega os pedidos entregues com saldo, as divergências
 * de parcelas, as contas (base da tabela por cliente) e os clientes (telefone).
 * As RPCs de entregues e divergências são gated por assert_finance_access
 * (admin/manager); contas e clientes seguem as regras de acesso do próprio storage.
 */
export function useReceivablesControl() {
    const [delivered, setDelivered] = useState<DeliveredUnpaidRow[]>([]);
    const [reconciliation, setReconciliation] = useState<OrderReconciliationRow[]>([]);
    const [contas, setContas] = useState<ObligationSummary[]>([]);
    const [clientes, setClientes] = useState<Client[]>([]);
    const carga = useCargaProgressiva();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [d, r, o, c] = await Promise.all([
                storageService.getDeliveredUnpaid(),
                storageService.getOrdersNeedingReconciliation(),
                storageService.getObligations(),
                storageService.getClients(),
            ]);
            setDelivered(d);
            setReconciliation(r);
            setContas(o);
            setClientes(c);
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao carregar recebíveis'));
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    /** Fase 4: aplica o ajuste de um pedido divergente e recarrega. */
    const applyAdjustment = useCallback(async (orderId: string, delta: number) => {
        setBusy(true);
        setError('');
        try {
            await storageService.applyOrderAdjustment(orderId, delta, 'Reconciliação (pedido revisado)');
            await load();
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao aplicar ajuste'));
        } finally {
            setBusy(false);
        }
    }, [load]);

    /** Resultado do "Recalcular scores", para a tela mostrar em aviso (some sozinho). */
    const [recalculando, setRecalculando] = useState(false);

    /** Fase 3: materializa o score de todos os clientes no cache. */
    const refreshScores = useCallback(async () => {
        setRecalculando(true);
        try {
            await storageService.refreshClientScores();
            avisar('Scores recalculados', 'success');
        } catch (e: any) {
            avisar(mensagemDeErro(e, 'Falha ao recalcular scores'), 'error');
        } finally {
            setRecalculando(false);
        }
    }, []);

    return {
        delivered, reconciliation, contas, clientes,
        error, reload: load, applyAdjustment, refreshScores, recalculando,
        loading: carga.carregando, busy: busy || carga.recarregando,
    };
}
