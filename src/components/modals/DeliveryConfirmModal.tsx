import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export interface DeliveryConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  order_number: string;
}

export const DeliveryConfirmModal: React.FC<DeliveryConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  order_number,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/20 shadow-xl shadow-emerald-900/10">
          <CheckCircle size={28} className="text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-black text-white uppercase tracking-widest leading-relaxed">Confirmar Entrega</h3>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide leading-relaxed">
            O pedido <span className="text-white">#{order_number}</span> será marcado como entregue e movido para o histórico.
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
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-900/20 active:scale-95"
          >
            Confirmar
          </button>
        </div>
      </div>
    </Modal>
  );
};
