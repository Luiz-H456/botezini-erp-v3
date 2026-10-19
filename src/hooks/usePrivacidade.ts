import { useSyncExternalStore, useCallback } from 'react';
import {
    valoresOcultos, definirValoresOcultos, assinarPrivacidade,
} from '../utils/privacidade';

/**
 * Estado do modo privado, compartilhado por todo o app.
 *
 * `useSyncExternalStore` é o encaixe certo aqui: o estado de verdade vive fora
 * do React (o sinalizador que `formatCurrency` lê, e que precisa ser legível de
 * funções puras). Este hook só mantém os componentes em dia com ele — assim os
 * dois interruptores da interface mostram sempre a mesma coisa.
 */
export function usePrivacidade() {
    const oculto = useSyncExternalStore(assinarPrivacidade, valoresOcultos, () => false);
    const alternar = useCallback(() => definirValoresOcultos(!valoresOcultos()), []);
    return { oculto, alternar, definir: definirValoresOcultos };
}
