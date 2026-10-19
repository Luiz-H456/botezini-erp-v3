import { useCallback } from 'react';
import { usePrivacidade } from '@/hooks/usePrivacidade';
import { MASCARA } from '@/utils/privacidade';
import { formatCurrency } from '@/utils';

/** Todo valor em reais das telas do financeiro passa por aqui: respeita o modo privacidade. */
export function useMostrarValor() {
    const { oculto } = usePrivacidade();
    const mostrar = useCallback((n: number) => (oculto ? MASCARA : formatCurrency(n)), [oculto]);
    return { mostrar, oculto };
}
