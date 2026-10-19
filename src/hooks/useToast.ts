import { useState, useCallback } from 'react';
import type { ToastType } from '../components/common/Toast';

const DEFAULT_DURATION = 3000;

interface ToastState {
  visible: boolean;
  message: string;
  title: string;
  type: ToastType;
}

export function useToast(duration = DEFAULT_DURATION) {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    title: '',
    type: 'success',
  });

  const showToast = useCallback(
    (message: string, type: ToastType = 'success', title?: string) => {
      setToast({
        visible: true,
        message,
        title: title ?? (type === 'error' ? 'Erro' : type === 'success' ? 'Sucesso' : 'Info'),
        type,
      });
      setTimeout(
        () => setToast((prev) => ({ ...prev, visible: false })),
        duration
      );
    },
    [duration]
  );

  return { toast, showToast };
}
