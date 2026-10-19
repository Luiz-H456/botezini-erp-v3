
import { useState, useEffect, useMemo, useCallback } from 'react';
import { OrderRepository } from '@/repositories/orderRepository';
import { storageService } from '@/services/storage';
import { Order, OrderStatus, Client, Budget, Product, CompanyProfile, ObligationSummary } from '@/types';
import { useToast } from '@/hooks/useToast';
import { isDateInPeriod } from '@/utils';
import { ITENS_POR_PAGINA } from '@/utils/constants';
import { documentoCasa, indexarClientes } from '@/utils/buscaDeDocumentos';

export const useOrders = (initialSearch?: string) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
    const [receivables, setReceivables] = useState<ObligationSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState(initialSearch || '');
    const [filterClient, setFilterClient] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterPeriod, setFilterPeriod] = useState<'ALL' | 'DAY' | 'WEEK' | 'MONTH'>('ALL');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = ITENS_POR_PAGINA;

    const { toast, showToast } = useToast();
    const orderRepo = useMemo(() => new OrderRepository(), []);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [o, b, c, p, profile, obs] = await Promise.all([
                orderRepo.getOrders(),
                storageService.getBudgets(),
                storageService.getClients(),
                storageService.getProducts(),
                storageService.getCompanyProfile(),
                storageService.getObligations({ type: 'receivable' }),
            ]);
            setOrders(o);
            setBudgets(b);
            setClients(c);
            setProducts(p);
            setCompanyProfile(profile);
            setReceivables(obs);
        } catch (e) {
            console.error("Orders Load Error:", e);
            showToast('Erro ao carregar pedidos.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [orderRepo, showToast]);

    useEffect(() => { loadData(); }, [loadData]);

    useEffect(() => {
        if (initialSearch) setSearchTerm(initialSearch);
    }, [initialSearch]);

    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterClient, filterPeriod, filterStatus]);
    // Montado uma vez por lista de clientes, e nao a cada pedido conferido.
    const indiceDeClientes = useMemo(() => indexarClientes(clients), [clients]);


    const processedOrders = useMemo(() => {
        const filtered = orders.filter(order => {
            // A busca passou a olhar TAMBEM o nome da empresa, o nome fantasia
            // e o CNPJ. Antes so achava por numero — e ninguem guarda
            // "PED-BZ-2026-041" de cabeca; guarda o nome do cliente que acabou
            // de ligar. Para achar o pedido era preciso lembrar o numero do
            // pedido, que e justamente o que se estava procurando.
            if (!documentoCasa(order, searchTerm, indiceDeClientes)) return false;
            if (filterClient !== 'ALL' && order.client_id !== filterClient) return false;
            if (filterStatus !== 'ALL' && order.status !== filterStatus) return false;
            const createdDate = (order.created_at || '').substring(0, 10);
            if (!isDateInPeriod(createdDate, filterPeriod)) return false;
            return true;
        });

        return filtered.sort((a, b) => {
            const getStatusWeight = (status: OrderStatus) => {
                if (status === OrderStatus.DELIVERED) return 3;
                return 1;
            };

            const weightA = getStatusWeight(a.status);
            const weightB = getStatusWeight(b.status);

            if (weightA !== weightB) return weightA - weightB;

            const dateA = a.created_at || '';
            const dateB = b.created_at || '';

            return sortOrder === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
        });
    }, [orders, searchTerm, filterClient, filterStatus, filterPeriod, sortOrder, indiceDeClientes]);

    const paginatedOrders = useMemo(() => {
        return processedOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [processedOrders, currentPage]);

    const totalPages = Math.ceil(processedOrders.length / itemsPerPage);

    const deleteOrder = async (order_id: string) => {
        setIsLoading(true);
        try {
            await orderRepo.deleteOrderWithCascade(order_id);
            await loadData();
            showToast('Pedido excluído com sucesso.', 'success');
        } catch (e) {
            console.error(e);
            showToast('Erro ao excluir pedido.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const saveOrder = async (order: Order, _isNew: boolean = false) => {
        setIsLoading(true);
        try {
            await orderRepo.saveOrder(order);
            await loadData();
            showToast('Pedido salvo com sucesso.', 'success');
        } catch (e: any) {
            console.error(e);
            showToast('Erro ao salvar pedido.', 'error');
            throw e;
        } finally {
            setIsLoading(false);
        }
    };

    return {
        orders, budgets, clients, products, companyProfile, receivables,
        isLoading, searchTerm, setSearchTerm,
        filterClient, setFilterClient,
        filterStatus, setFilterStatus,
        filterPeriod, setFilterPeriod,
        sortOrder, setSortOrder,
        currentPage, setCurrentPage,
        paginatedOrders, totalPages, processedOrders,
        itemsPerPage,
        loadData, deleteOrder, saveOrder, toast, showToast
    };
};
