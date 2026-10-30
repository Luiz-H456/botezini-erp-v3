import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../../services/storage';
import { CashEnvelope, EnvelopeOverview } from '../../types/finance';
import { useCargaProgressiva } from '../useCargaProgressiva';

import { mensagemDeErro } from '@/utils/errorHandling';
/** Fase 6 — estado das Caixinhas + operações. */
export function useEnvelopes() {
    const [envelopes, setEnvelopes] = useState<CashEnvelope[]>([]);
    const [overview, setOverview] = useState<EnvelopeOverview>({ total_real: 0, allocated: 0, free: 0 });
    const carga = useCargaProgressiva();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [envs, ov] = await Promise.all([
                storageService.getEnvelopes(false),
                storageService.getEnvelopeOverview(),
            ]);
            setEnvelopes(envs);
            setOverview(ov);
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao carregar caixinhas'));
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const run = useCallback(async (fn: () => Promise<void>) => {
        setBusy(true);
        setError('');
        try {
            await fn();
            await load();
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Operação falhou'));
            throw e;
        } finally {
            setBusy(false);
        }
    }, [load]);

    const saveEnvelope = (env: Partial<CashEnvelope>) => run(() => storageService.saveEnvelope(env));
    const deleteEnvelope = (id: string) => run(() => storageService.deleteEnvelope(id));
    const move = (id: string, delta: number, notes?: string) => run(() => storageService.moveEnvelope(id, delta, notes));
    const transfer = (from: string, to: string, amount: number, notes?: string) => run(() => storageService.transferEnvelope(from, to, amount, notes));
    const fund = (base: number) => run(() => storageService.fundEnvelopes(base).then(() => { /* void */ }));
    const getMovements = (id: string) => storageService.getEnvelopeMovements(id);

    return { envelopes, overview, error, reload: load, saveEnvelope, deleteEnvelope, move, transfer, fund, getMovements,
        loading: carga.carregando, busy: busy || carga.recarregando };
}
