import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'success' | 'info';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  variant?: ConfirmVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const ICONS = {
  danger: AlertTriangle,
  success: CheckCircle,
  info: Info,
};

const STYLES = {
  danger: 'bg-red-900/20 border-red-900 text-red-500',
  success: 'bg-emerald-900/20 border-emerald-900 text-emerald-500',
  info: 'bg-blue-900/20 border-blue-900 text-blue-500',
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  variant = 'danger',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const Icon = ICONS[variant];
  const styleClass = STYLES[variant];

  const buttonClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500'
      : variant === 'success'
        ? 'bg-emerald-600 hover:bg-emerald-500'
        : 'bg-blue-600 hover:bg-blue-500';

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-confirmacao flex items-center justify-center p-4 ease-out animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm shadow-2xl max-w-sm w-full p-6 text-center transform transition-all scale-100">
        <div
          className={`mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center border ${styleClass}`}
        >
          <Icon size={24} />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <div className="text-zinc-400 text-sm mb-6">{message}</div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 rounded-sm font-bold text-xs uppercase tracking-wide transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 py-2.5 rounded-sm font-bold text-xs uppercase tracking-wide text-white transition-colors disabled:opacity-50 ${buttonClass}`}
          >
            {isLoading ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
