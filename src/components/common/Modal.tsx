import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /** Rodapé fixo (ex.: botão Confirmar): fica sempre à vista; só o miolo rola. */
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
}

const MAX_WIDTH_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  footer,
  maxWidth = 'lg',
}) => {
  if (!isOpen) return null;

  // Portal no body: o véu cobre menu lateral e cabeçalho mesmo quando o modal
  // é aberto de dentro do <main>.
  return createPortal(
    <div className="fixed inset-0 bg-zinc-950/80 z-modal flex items-center justify-center p-4 backdrop-blur-md ease-out animate-in fade-in duration-200">
      <div
        className={`bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full backdrop-blur-xl relative overflow-hidden flex flex-col max-h-full ${MAX_WIDTH_CLASS[maxWidth]} ${className}`}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
        {title && (
          <div className="flex shrink-0 justify-between items-center p-6 border-b border-zinc-900 bg-zinc-950/30">
            <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 text-zinc-600 hover:text-white transition-colors hover:bg-zinc-800 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {children}
        </div>
        {footer && <div className="shrink-0 border-t border-zinc-900 bg-zinc-950/30 px-8 py-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
