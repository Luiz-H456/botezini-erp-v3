import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export interface OrderRevertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  order_number: string;
  isLoading?: boolean;
}

export const OrderRevertModal: React.FC<OrderRevertModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  order_number,
  isLoading = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/20 shadow-xl shadow-amber-900/10">
          <RotateCcw size={28} className="text-amber-500" />
        </div>
        <div className="space-y-4 text-left bg-zinc-950/30 p-6 rounded-xl border border-zinc-900">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-white uppercase tracking-widest leading-relaxed">Desfazer Conversão</h3>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide leading-relaxed">
              O pedido <span className="text-white">#{order_number}</span> será removido e o orçamento retornará ao modo de edição.
            </p>
          </div>
          <div className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-lg">
            <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Atenção:</p>
            <p className="text-[10px] font-bold text-rose-200 uppercase tracking-wide mt-1">Todas as transações financeiras e registros de produção vinculados a este pedido serão eliminados.</p>
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
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-black px-4 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-amber-900/20 active:scale-95 disabled:opacity-50"
          >
            {isLoading ? 'PROCESSANDO...' : 'DESFAZER CONVERSÃO'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
