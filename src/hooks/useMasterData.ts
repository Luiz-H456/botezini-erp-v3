import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../services/storage';
import { useCargaProgressiva } from './useCargaProgressiva';
import {
  Client,
  Product,
  Supplier,
  CompanyProfile,
  CostCenter,
  GlobalCategory,
} from '../types';

export function useMasterData() {
  const [clients, setClients] = useState<Client[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [productCategoryMetas, setProductCategoryMetas] = useState<Record<string, any>>({});
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const carga = useCargaProgressiva();

  const loadData = useCallback(async () => {
    carga.iniciar();
    try {
      const [c, s, p, profile, cc, pMeta, globalCatsCRM, globalCatsInv, globalCatsFin] = await Promise.all([
        storageService.getClients(),
        storageService.getSuppliers(),
        storageService.getProducts(),
        storageService.getCompanyProfile(),
        storageService.getCostCenters(),
        storageService.getCategoryMeta('product'),
        storageService.getGlobalCategories('crm'),
        storageService.getGlobalCategories('inventory'),
        storageService.getGlobalCategories('finance'),
      ]);
      setClients(c);
      setSuppliers(s);
      setProducts(p);
      setCostCenters(cc);
      setProductCategoryMetas(pMeta);
      setGlobalCategories([...globalCatsCRM, ...globalCatsInv, ...globalCatsFin]);
      if (profile) setCompanyProfile(profile);
    } catch (e) {
      console.error('MasterData Load Error:', e);
      throw e;
    } finally {
      carga.terminar();
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    clients,
    suppliers,
    products,
    costCenters,
    companyProfile,
    productCategoryMetas,
    globalCategories,
    isLoading: carga.carregando,
    recarregando: carga.recarregando,
    loadData,
  };
}
