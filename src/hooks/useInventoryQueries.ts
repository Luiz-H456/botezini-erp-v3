import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { storageService } from '@/services/storage';
import { Insumo, ProductInsumo } from '@/types';

// ==========================================
// 1. QUERIES
// ==========================================

export const useInsumos = () => {
    return useQuery({
        queryKey: ['inventory_insumos'],
        queryFn: () => storageService.getInsumos(),
        staleTime: 1000 * 60 * 5, // 5 min
    });
};

export const useInsumosPaginated = (page: number, pageSize: number, search?: string, category?: string) => {
    return useQuery({
        queryKey: ['inventory_insumos', page, pageSize, search, category],
        queryFn: () => storageService.getInsumosPaginated(page, pageSize, search, category),
        staleTime: 1000 * 60 * 5,
        // Trocar de página (ou digitar na busca) muda a queryKey, e sem isto o
        // react-query devolve `undefined` até a nova página chegar — a tabela
        // some e vira spinner a cada clique. Com keepPreviousData a página
        // anterior fica visível até a próxima estar pronta.
        placeholderData: keepPreviousData,
    });
};

export const useInsumoMovements = (insumoId?: string) => {
    return useQuery({
        queryKey: ['inventory_insumo_movements', insumoId],
        queryFn: () => storageService.getInsumoMovements(insumoId),
        staleTime: 1000 * 60 * 2,
    });
};

export const useProductInsumos = (productId: string) => {
    return useQuery({
        queryKey: ['inventory_product_insumos', productId],
        queryFn: () => storageService.getProductInsumos(productId),
        enabled: !!productId,
        staleTime: 1000 * 60 * 5,
    });
};

// ==========================================
// 2. MUTATIONS
// ==========================================

export const useInventoryMutations = () => {
    const queryClient = useQueryClient();

    const invalidateInsumos = () => {
        queryClient.invalidateQueries({ queryKey: ['inventory_insumos'] });
    };

    const invalidateProductInsumos = (productId: string) => {
        queryClient.invalidateQueries({ queryKey: ['inventory_product_insumos', productId] });
    };

    const saveInsumoMutation = useMutation({
        mutationFn: (data: Partial<Insumo>) => storageService.saveInsumo(data),
        onSuccess: () => invalidateInsumos(),
    });

    const deleteInsumoMutation = useMutation({
        mutationFn: (id: string) => storageService.deleteInsumo(id),
        onSuccess: () => invalidateInsumos(),
    });

    const saveProductInsumoMutation = useMutation({
        mutationFn: (data: Partial<ProductInsumo>) => storageService.saveProductInsumo(data),
        onSuccess: (_, variables) => {
            if (variables.product_id) invalidateProductInsumos(variables.product_id);
        },
    });

    const deleteProductInsumoMutation = useMutation({
        mutationFn: ({ id }: { id: string, productId: string }) => storageService.deleteProductInsumo(id),
        onSuccess: (_, variables) => {
            invalidateProductInsumos(variables.productId);
        },
    });

    return {
        saveInsumoMutation,
        deleteInsumoMutation,
        saveProductInsumoMutation,
        deleteProductInsumoMutation,
    };
};
