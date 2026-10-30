import React from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export interface OrderDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  order_number: string;
  isLoading?: boolean;
}

export const OrderDeleteModal: React.FC<OrderDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  order_number,
  isLoading = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20 shadow-xl shadow-rose-900/10 transition-transform active:scale-95">
          <Trash2 size={28} className="text-rose-500" />
        </div>
        <div className="space-y-4 text-left bg-zinc-950/30 p-6 rounded-xl border border-zinc-900">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Excluir Pedido</h3>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Pedido <span className="text-white">#{order_number}</span> será removido permanentemente.</p>
          </div>
          <div className="space-y-2 border-t border-zinc-900 pt-4">
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2">Impactos da operação:</p>
            <ul className="space-y-1.5">
              <li className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                <div className="w-1 h-1 bg-zinc-800 rounded-full"></div> 1. Remoção total da lista de Produção
              </li>
              <li className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                <div className="w-1 h-1 bg-zinc-800 rounded-full"></div> 2. Estorno automático de transações financeiras
              </li>
              <li className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                <div className="w-1 h-1 bg-zinc-800 rounded-full"></div> 3. Liberação do orçamento Original
              </li>
            </ul>
          </div>
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
            className="flex-1 bg-rose-500 hover:bg-rose-400 text-black px-4 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-rose-900/20 active:scale-95"
          >
            {isLoading ? 'PROCESSANDO...' : 'EXCLUIR PEDIDO'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
