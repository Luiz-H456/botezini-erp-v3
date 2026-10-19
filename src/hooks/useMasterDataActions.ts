import { useState } from 'react';
import { storageService } from '@/services/storage';
import { clientSchema, productSchema, supplierSchema } from '@/utils';
import { Product } from '@/types';
import type { ToastType } from '@/components/common/Toast';

export type ModalEntityType = 'client' | 'supplier' | 'product';

interface UseMasterDataActionsProps {
  loadData: () => Promise<void>;
  setIsModalOpen: (open: boolean) => void;
  setItemToDelete: (item: any) => void;
  /** O toast da TELA: um useToast próprio aqui dentro guardaria estado que nenhum <Toast> renderiza. */
  showToast: (message: string, type?: ToastType, title?: string) => void;
}

export function useMasterDataActions({
  loadData,
  setIsModalOpen,
  setItemToDelete,
  showToast,
}: UseMasterDataActionsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Devolve o item salvo, ou null se não salvou (validação ou erro). */
  const handleSaveEntity = async (modalType: ModalEntityType | null, editingItem: any): Promise<any | null> => {
    setErrors({});
    const schema =
      modalType === 'client'
        ? clientSchema
        : modalType === 'supplier'
          ? supplierSchema
          : productSchema;
    
    const saveFn =
      modalType === 'client'
        ? storageService.saveClient
        : modalType === 'supplier'
          ? storageService.saveSupplier
          : storageService.saveProduct;

    if (!schema || !saveFn) return null;

    const payload = { ...editingItem };
    if (modalType === 'product') {
      const productPayload = payload as Partial<Product>;
      productPayload.price_tier1 = Number(productPayload.price_tier1 || 0);
      productPayload.price_tier2 = Number(productPayload.price_tier2 || 0);
      productPayload.price_tier3 = Number(productPayload.price_tier3 || 0);
      productPayload.average_unit_cost = Number(productPayload.average_unit_cost || 0);
      productPayload.fabric_consumption_m = Number(productPayload.fabric_consumption_m || 0);
      productPayload.labor_hourly_rate = Number(productPayload.labor_hourly_rate || 0);
      productPayload.labor_workers = Number(productPayload.labor_workers || 0);
      productPayload.pieces_daily_capacity = Number(productPayload.pieces_daily_capacity || 0);
      productPayload.overhead_percent = Number(productPayload.overhead_percent || 0);
    }

    const result = schema.safeParse(payload);
    if (!result.success) {
      const formattedErrors: Record<string, string> = {};
      result.error.issues.forEach(
        (issue) =>
          (formattedErrors[String(issue.path[0])] = issue.message)
      );
      setErrors(formattedErrors);
      return null;
    }

    setIsSaving(true);
    try {
      const savedItem = await saveFn(payload as any);

      if (modalType === 'product' && (payload as Product).default_fabric_insumo_id) {
        const prod = savedItem as Product;
        await storageService.saveProductInsumo({
          product_id: prod.id,
          insumo_id: prod.default_fabric_insumo_id,
          quantity: prod.fabric_consumption_m || 0,
        });
      }

      const clienteNovo = modalType === 'client' && !editingItem.id;
      showToast(clienteNovo ? `Cliente ${editingItem.company_name} cadastrado` : 'Registro salvo com sucesso!', 'success');
      setIsModalOpen(false);
      loadData();
      return savedItem ?? payload;
    } catch (err: any) {
      console.error('Error saving entity:', err);
      const msg = err?.message || 'Erro desconhecido';
      showToast(`Erro ao salvar: ${msg}`, 'error');
      // O modal segue aberto: o erro também aparece no rodapé dele.
      setErrors({ salvar: `Erro ao salvar: ${msg}` });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const executeDelete = async (itemToDelete: { id: string; type: ModalEntityType | 'costCenter'; name: string } | null) => {
    if (!itemToDelete || isSaving) return;
    setIsSaving(true);
    try {
      if (itemToDelete.type === 'client')
        await storageService.deleteClient(itemToDelete.id);
      if (itemToDelete.type === 'supplier')
        await storageService.deleteSupplier(itemToDelete.id);
      if (itemToDelete.type === 'product')
        await storageService.deleteProduct(itemToDelete.id);
      if (itemToDelete.type === 'costCenter')
        await storageService.deleteCostCenter(itemToDelete.id);
      showToast('Item excluído.', 'success');
      loadData();
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('foreign key constraint') || msg.includes('violates foreign key') || e?.code === '23503') {
        const typeName = itemToDelete.type === 'client' ? 'Cliente' : itemToDelete.type === 'supplier' ? 'Fornecedor' : itemToDelete.type === 'product' ? 'Produto' : 'Centro de custo';
        showToast(`Não é possível excluir. ${typeName} possui pedidos/cadastros vinculados.`, 'error');
      } else {
        showToast('Falha ao excluir.', 'error');
      }
    } finally {
      setItemToDelete(null);
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    setIsSaving,
    errors,
    setErrors,
    handleSaveEntity,
    executeDelete,
  };
}
