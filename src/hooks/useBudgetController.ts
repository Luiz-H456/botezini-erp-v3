import { useState, useEffect, useMemo } from 'react';
import { storageService } from '../services/storage';
import { idService } from '../services/idService';
import {
  Budget,
  Product,
  Client,
  Order,
  CompanyProfile,
} from '../types';
import { getTodayStr, isDateInPeriod, isBudgetExpired } from '../utils';
import { documentoCasa, indexarClientes } from '@/utils/buscaDeDocumentos';

export function useBudgetController(
  initialSearch?: string,
  clearSearch?: () => void
) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterClient, setFilterClient] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPeriod, setFilterPeriod] = useState<
    'ALL' | 'DAY' | 'WEEK' | 'MONTH'
  >('ALL');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const loadData = async () => {
    try {
      const [b, p, c, profile, o] = await Promise.all([
        storageService.getBudgets(),
        storageService.getProducts(),
        storageService.getClients(),
        storageService.getCompanyProfile(),
        storageService.getOrders(),
      ]);
      setBudgets(b);
      setOrders(o);
      setProducts(p);
      setClients(c);
      setCompanyProfile(profile);
    } catch (e) {
      console.error('Budgets Load Error:', e);
    }
  };

  const refreshProducts = async () => {
    try {
      const p = await storageService.getProducts();
      setProducts(p);
    } catch (e) {
      console.error('Refresh Products Error:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
      clearSearch?.();
    }
  }, [initialSearch, clearSearch]);

  const [showExpiredOnly, setShowExpiredOnly] = useState(false);
  const indiceDeClientes = useMemo(() => indexarClientes(clients), [clients]);


  const processedBudgets = useMemo(() => {
    const filtered = budgets.filter((b) => {
      // Passou a achar TAMBEM por nome da empresa, nome fantasia e CNPJ. Antes
      // so por numero, e ninguem guarda "ORC-2026-007" de cabeca.
      if (!documentoCasa(
            { client_id: b.client_id, serial_number: b.serial_number,
              order_number: b.generated_order_number },
            searchTerm, indiceDeClientes))
        return false;
      if (filterClient !== 'ALL' && b.client_id !== filterClient) return false;
      if (filterStatus !== 'ALL' && b.status !== filterStatus) return false;
      if (!isDateInPeriod(b.date, filterPeriod)) return false;
      // `?? 15`, não `|| 15`: zero é "sem validade" de propósito (ver
      // isBudgetExpired), e `||` trocaria esse zero pelo padrão de novo
      // registro, fazendo um orçamento sem validade aparecer como vencido.
      if (showExpiredOnly && !isBudgetExpired(b.date, b.validity_days ?? 15)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const mul = sortOrder === 'newest' ? -1 : 1;
      const dateComparison = a.date.localeCompare(b.date) * mul;
      if (dateComparison !== 0) return dateComparison;
      return a.serial_number.localeCompare(b.serial_number) * mul;
    });
  }, [budgets, searchTerm, filterClient, filterStatus, filterPeriod, sortOrder, showExpiredOnly, indiceDeClientes]);

  const prepareDuplicate = async (budget: Budget): Promise<Budget> => {
    const newSerial = await idService.getNextSequence('budget');
    return {
      ...budget,
      id: '',
      serial_number: newSerial,
      date: getTodayStr(),
      status: 'Draft',
      generated_order_number: undefined,
      customizations: (budget.customizations || []).map((c) => ({
        ...c,
        id: idService.generateUUID(),
      })),
      extras: (budget.extras || []).map((e) => ({
        ...e,
        id: idService.generateUUID(),
      })),
      items: (budget.items || []).map((i) => ({ ...i })),
      // Lista nova com os MESMOS caminhos: a duplicata aponta para os arquivos
      // do original de propósito (é a mesma arte), mas não pode compartilhar o
      // array — mexer num refletiria no outro em memória. Quem protege o
      // arquivo em si é a contagem de referências na remoção.
      reference_photos: [...(budget.reference_photos || [])],
      created_at: undefined,
      updated_at: undefined,
    };
  };

  const deleteBudget = async (id: string) => {
    await storageService.deleteBudget(id);
    await loadData();
  };

  return {
    budgets: processedBudgets,
    // A lista inteira, sem filtro nem busca. A fila de follow-up olha para
    // TODAS as propostas enviadas: filtrar por cliente ou por período
    // esconderia cobranças reais atrás de um filtro que alguém deixou ligado.
    todosOsBudgets: budgets,
    orders,
    products,
    clients,
    companyProfile,
    searchTerm,
    setSearchTerm,
    filterClient,
    setFilterClient,
    filterStatus,
    setFilterStatus,
    filterPeriod,
    setFilterPeriod,
    sortOrder,
    setSortOrder,
    refresh: loadData,
    refreshProducts,
    prepareDuplicate,
    deleteBudget,
    showExpiredOnly,
    setShowExpiredOnly,
  };
}
