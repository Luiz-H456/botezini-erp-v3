import { useCallback, useEffect, useState } from 'react';
import { storageService } from '@/services/storage';
import type { BankAccount, Client, GlobalCategory, ObligationPayment, ObligationSummary, Order, Supplier } from '@/types';
import type { CashEnvelope, EnvelopeOverview } from '@/types/finance';

export interface DadosDasFinancas {
    contas: ObligationSummary[];
    pagamentos: ObligationPayment[];
    /** O teto de 5.000 pagamentos foi atingido: somas de caixa podem estar incompletas. */
    pagamentosIncompletos: boolean;
    /** Todos os bancos, ativos e inativos. */
    bancos: BankAccount[];
    caixinhas: CashEnvelope[];
    visaoDasCaixinhas: EnvelopeOverview;
    contasPorObrigacao: Record<string, string[]>;
    clientes: Client[];
    fornecedores: Supplier[];
    categorias: GlobalCategory[];
    pedidos: Order[];
}

/** Uma carga só para as quatro páginas do módulo. */
export function useDadosDasFinancas() {
    const [dados, setDados] = useState<DadosDasFinancas | null>(null);
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(true);

    const recarregar = useCallback(async () => {
        setCarregando(true);
        setErro('');
        try {
            const [contas, pag, bancos, caixinhas, visao, porObrigacao, clientes, fornecedores, categorias, pedidos] = await Promise.all([
                storageService.getObligations(),
                storageService.getAllPaymentsComTeto(),
                storageService.getBankAccounts(false),
                storageService.getEnvelopes(),
                storageService.getEnvelopeOverview(),
                storageService.getContasPorObrigacao(),
                storageService.getClients(),
                storageService.getSuppliers(),
                storageService.getGlobalCategories('finance'),
                storageService.getOrders(),
            ]);
            setDados({
                contas, pagamentos: pag.pagamentos, pagamentosIncompletos: pag.truncado, bancos, caixinhas,
                visaoDasCaixinhas: visao, contasPorObrigacao: porObrigacao, clientes, fornecedores, categorias, pedidos,
            });
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não consegui carregar o financeiro.');
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { void recarregar(); }, [recarregar]);
    return { dados, erro, carregando, recarregar };
}
