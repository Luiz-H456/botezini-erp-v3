
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storageService } from '@/services/storage';
import { CashSnapshot, BudgetLine, BankAccount } from '@/types';

// ==========================================
// 1. QUERIES (Data Fetching Cacheado)
// ==========================================

export const useFinanceData = () => {
    return useQuery({
        queryKey: ['finance_all_data'],
        queryFn: async () => {
            const [
                obligations,
                orders,
                clients,
                suppliers,
                costCenters,
                budgetLines,
                bankAccounts,
                cashSnapshots
            ] = await Promise.all([
                storageService.getObligations(),
                storageService.getOrders(),
                storageService.getClients(),
                storageService.getSuppliers(),
                storageService.getCostCenters(),
                storageService.getBudgetLines(),
                storageService.getBankAccounts(),
                storageService.getCashSnapshots()
            ]);

            return {
                obligations,
                orders,
                clients,
                suppliers,
                costCenters,
                budgetLines,
                bankAccounts,
                cashSnapshots
            };
        },
        // Stale time: Considera os dados frescos por 2 minutos
        staleTime: 1000 * 60 * 2,
    });
};

// ==========================================
// 2. MUTATIONS (Data Saving/Updating c/ Invalidação)
// ==========================================

export const useFinanceMutations = () => {
    const queryClient = useQueryClient();

    const invalidateFinance = () => {
        queryClient.invalidateQueries({ queryKey: ['finance_all_data'] });
    };

    const saveObligationMutation = useMutation({
        mutationFn: async (data: any) => {
            if (data.id) {
                await storageService.updateObligation(data.id, data);
                return data;
            } else {
                return await storageService.createObligation(data);
            }
        },
        onSuccess: invalidateFinance,
    });

    const deleteObligationMutation = useMutation({
        mutationFn: (id: string) => storageService.cancelObligation(id, 'Deleção via UI'),
        onSuccess: invalidateFinance,
    });

    const saveBankAccountMutation = useMutation({
        mutationFn: (data: BankAccount) => storageService.saveBankAccount(data),
        onSuccess: invalidateFinance,
    });

    const saveBudgetLineMutation = useMutation({
        mutationFn: (data: BudgetLine) => storageService.saveBudgetLine(data),
        onSuccess: invalidateFinance,
    });

    const removeObligationMutation = useMutation({
        mutationFn: (id: string) => storageService.cancelObligation(id, 'Deleção via UI'),
        onSuccess: invalidateFinance,
    });

    const saveCashSnapshotMutation = useMutation({
        mutationFn: (data: CashSnapshot) => storageService.saveCashSnapshot(data),
        onSuccess: invalidateFinance,
    });

    return {
        saveObligationMutation,
        deleteObligationMutation,
        saveBankAccountMutation,
        saveBudgetLineMutation,
        removeObligationMutation,
        saveCashSnapshotMutation
    };
};
