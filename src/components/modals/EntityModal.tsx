import React from 'react';
import { Save } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export type EntityType = 'client' | 'supplier' | 'product';

export interface EntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  entityType: EntityType;
  isEditing: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
  errors?: Record<string, string>;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
}

const LABELS: Record<EntityType, string> = {
  client: 'Cliente',
  supplier: 'Fornecedor',
  product: 'Produto',
};

export const EntityModal: React.FC<EntityModalProps> = ({
  isOpen,
  onClose,
  onSave,
  entityType,
  isEditing,
  isLoading = false,
  children,
  errors = {},
  maxWidth = 'lg',
}) => {
  const title = `${isEditing ? 'Editar' : 'Novo'} ${LABELS[entityType]}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth={maxWidth}
      footer={
        <div className="space-y-3">
          {Object.keys(errors).length > 0 && (
            <div className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-xl ease-out animate-in duration-200 slide-in-from-top-2">
              <p className="text-[10px] font-black text-rose-200 uppercase tracking-wide leading-relaxed">
                {Object.values(errors)[0]}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={isLoading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all shadow-xl shadow-amber-900/10 disabled:opacity-50 active:scale-95"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
            ) : (
              <Save size={18} />
            )}
            {isLoading ? 'SALVANDO...' : 'CONFIRMAR'}
          </button>
        </div>
      }
    >
      <div className="p-8 space-y-4">
        {children}
      </div>
    </Modal>
  );
};
