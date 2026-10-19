import { useEffect } from 'react';

/**
 * Esc fecha esta camada. Escuta na bolha, DEPOIS do campo focado: uma lista
 * aberta (SearchableSelect) trata o Esc antes e marca `preventDefault`, e aí a
 * camada fica aberta — Esc fecha só a lista. Ao fechar, marca `preventDefault`
 * também, para quem está por baixo (que confere `defaultPrevented`) não fechar
 * junto. `ativo` falso desliga — use quando um painel filho aberto já trata o Esc.
 */
export function useEscFecha(ativo: boolean, fechar: () => void) {
    useEffect(() => {
        if (!ativo) return;
        const aoTeclar = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            e.preventDefault();
            fechar();
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [ativo, fechar]);
}
