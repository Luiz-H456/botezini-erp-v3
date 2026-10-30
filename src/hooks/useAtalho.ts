import { useEffect, useRef } from 'react';

/** Está digitando num campo? Atalho de uma letra só não pode roubar a tecla de quem escreve. */
export const digitandoEm = (alvo: EventTarget | null): boolean => {
    const el = alvo as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

/**
 * Atalhos de teclado de uma tela (auditoria de 29/10, N2):
 *  - `novo`: tecla N (fora de campo de texto e sem janela aberta) abre o "novo" da tela;
 *  - `salvar`: Ctrl/⌘+S salva o formulário aberto (o navegador não abre "salvar página").
 * A função é lida a cada tecla: muda de render em render sem refazer o ouvinte.
 */
export function useAtalho(opcoes: { novo?: () => void; salvar?: () => void; ativo?: boolean }) {
    const ref = useRef(opcoes);
    ref.current = opcoes;
    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => {
            const { novo, salvar, ativo = true } = ref.current;
            if (!ativo || e.defaultPrevented) return;
            if (salvar && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvar(); return; }
            if (novo && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !digitandoEm(e.target)
                && !document.querySelector('[role=dialog], [aria-modal=true]')) { e.preventDefault(); novo(); }
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, []);
}
