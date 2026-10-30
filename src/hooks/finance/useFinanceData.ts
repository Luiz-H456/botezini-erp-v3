import { useState, useCallback } from 'react';
import { storageService } from '../../services/storage';
import { ObligationSummary, ObligationPayment, BankAccount, Client, Supplier, CostCenter, GlobalCategory } from '../../types';
import type { CashEnvelope, EnvelopeOverview } from '@/types/finance';
import { useCargaProgressiva } from '../useCargaProgressiva';

import { avisar } from '../../utils/avisos';
export function useFinanceData() {
    const [obligations, setObligations] = useState<ObligationSummary[]>([]);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
    const [payments, setPayments] = useState<ObligationPayment[]>([]);
    const [envelopes, setEnvelopes] = useState<CashEnvelope[]>([]);
    const [envelopeOverview, setEnvelopeOverview] = useState<EnvelopeOverview>({ total_real: 0, allocated: 0, free: 0 });
    const carga = useCargaProgressiva();

    // Avisos vão para a central do app (utils/avisos): erro fica até fechar, sucesso some sozinho.
    const showAlert = useCallback((msg: string, type: 'success' | 'error' = 'success') => { avisar(msg, type); }, []);

    const loadData = useCallback(async () => {
        carga.iniciar();
        try {
            const [obs, accs, cls, sups, ccs, gCats, pag, envs, visao] = await Promise.all([
                storageService.getObligations(),
                storageService.getBankAccounts(true),
                storageService.getClients(),
                storageService.getSuppliers(),
                storageService.getCostCenters(),
                storageService.getGlobalCategories('finance'),
                storageService.getAllPaymentsComTeto(),
                storageService.getEnvelopes(),
                storageService.getEnvelopeOverview(),
            ]);
            setObligations(obs);
            setBankAccounts(accs);
            setClients(cls);
            setSuppliers(sups);
            setCostCenters(ccs);
            setGlobalCategories(gCats);
            setPayments(pag.pagamentos);
            setEnvelopes(envs);
            setEnvelopeOverview(visao);
        } catch (e: any) {
            showAlert('Erro ao carregar: ' + e.message, 'error');
        } finally {
            carga.terminar();
        }
    }, [showAlert]);

    // A carga inicial é de quem usa o hook (Finance.tsx chama loadData ao montar).

    return {
        obligations,
        bankAccounts,
        clients,
        suppliers,
        costCenters,
        globalCategories,
        payments,
        envelopes,
        envelopeOverview,
        loading: carga.carregando,
        recarregando: carga.recarregando,
        showAlert,
        loadData
    };
}
