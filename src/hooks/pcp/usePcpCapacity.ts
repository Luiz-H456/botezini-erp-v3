import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../../services/storage';
import { ProductionSector, CapacityConfig } from '../../types/pcp';
import { useCargaProgressiva } from '../useCargaProgressiva';

export function usePcpCapacity() {
    const [sectors, setSectors] = useState<ProductionSector[]>([]);
    const [config, setConfig] = useState<CapacityConfig>({ id: 1, working_days: 5, holidays: [], overtime_enabled: false });
    const carga = useCargaProgressiva();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [secs, cfg] = await Promise.all([
                // estrito: falha de leitura vira erro na tela, não "nenhum setor".
                storageService.getSectors(false, { estrito: true }),
                storageService.getCapacityConfig(),
            ]);
            setSectors(secs);
            setConfig(cfg);
        } catch (e: any) {
            setError(e?.message || 'Falha ao carregar capacidade');
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const run = useCallback(async (fn: () => Promise<void>) => {
        setBusy(true); setError('');
        try { await fn(); await load(); }
        catch (e: any) { setError(e?.message || 'Operação falhou'); throw e; }
        finally { setBusy(false); }
    }, [load]);

    const saveSector = (s: Partial<ProductionSector>) => run(() => storageService.saveSector(s));
    const deleteSector = (id: string) => run(() => storageService.deleteSector(id));
    const saveConfig = (cfg: Partial<CapacityConfig>) => run(() => storageService.saveCapacityConfig(cfg));

    return { sectors, config, error, reload: load, saveSector, deleteSector, saveConfig,
        loading: carga.carregando, busy: busy || carga.recarregando };
}
