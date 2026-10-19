import React from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  itemName: string;
  itemType?: string;
  isLoading?: boolean;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  isLoading = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20 shadow-xl shadow-rose-900/10">
          <Trash2 size={28} className="text-rose-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-black text-white uppercase tracking-widest leading-relaxed">Excluir {itemName}?</h3>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide leading-relaxed">
            Esta ação é irreversível e removerá permanentemente o registro e seus vínculos.
          </p>
        </div>
        <div className="flex gap-4 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-all active:scale-95"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 bg-rose-500 hover:bg-rose-400 text-black px-4 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all disabled:opacity-50 shadow-xl shadow-rose-900/20 active:scale-95"
          >
            {isLoading ? 'Excluindo...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
