import { useCallback } from 'react';
import { avisar, type TipoDeAviso } from '../utils/avisos';

export type ToastType = TipoDeAviso;

/**
 * Avisos de uma tela. Desde a auditoria de 29/10 (C5/R5) eles vão para a central única do app
 * (utils/avisos + CentralDeAvisos, montada no App): erro fica até fechar, sucesso some sozinho,
 * erro técnico chega traduzido. O nome e a assinatura ficaram, para as telas não mudarem.
 */
export function useToast() {
  const showToast = useCallback((message: string, type: ToastType = 'success', title?: string) => {
    avisar(message, type, title);
  }, []);
  return { showToast };
}
