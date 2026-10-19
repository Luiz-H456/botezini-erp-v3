import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertTriangle, Zap } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  visible: boolean;
  message: string;
  title?: string;
  type?: ToastType;
}

const ICONS = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Zap,
};

const STYLES = {
  success: 'bg-emerald-950/90 border-emerald-800 text-emerald-200',
  error: 'bg-red-950/90 border-red-800 text-red-200',
  info: 'bg-blue-950/90 border-blue-800 text-blue-200',
};

export const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  title,
  type = 'success',
}) => {
  if (!visible) return null;

  const Icon = ICONS[type];
  const styleClass = STYLES[type];

  // Portal no body: o aviso precisa aparecer por cima de modal aberto (ex.: de dentro do modal de produto).
  return createPortal(
    <div
      className={`fixed bottom-4 right-4 px-4 py-3 rounded-sm border flex items-center gap-3 shadow-2xl z-aviso ease-out animate-in slide-in-from-bottom-2 duration-200 backdrop-blur-md ${styleClass}`}
    >
      <Icon size={20} />
      <div>
        {title && <h4 className="font-bold text-xs uppercase">{title}</h4>}
        <p className="text-sm">{message}</p>
      </div>
    </div>,
    document.body,
  );
};
