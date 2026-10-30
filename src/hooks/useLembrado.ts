import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Preferência de tela lembrada neste aparelho (auditoria de 29/10, R7): o último filtro e a última
 * aba de Contas, Orçamentos e Estoque. Voltar à tela reabria tudo no padrão.
 *
 * É conveniência de quem olha, não dado da empresa: fica no navegador, e sem armazenamento (aba
 * anônima, bloqueio) a tela só volta ao padrão. Valor lembrado de um formato antigo é completado
 * pelo `inicial`, para um campo novo nunca chegar vazio.
 */
const PREFIXO = 'botezini.lembrar.';

export function lerLembrado<T>(chave: string, inicial: T): T {
    try {
        const s = localStorage.getItem(PREFIXO + chave);
        if (s == null) return inicial;
        const v = JSON.parse(s) as T;
        if (inicial && typeof inicial === 'object' && !Array.isArray(inicial) && v && typeof v === 'object') return { ...inicial, ...v };
        return typeof v === typeof inicial ? v : inicial;
    } catch {
        return inicial;
    }
}

export function gravarLembrado(chave: string, valor: unknown): void {
    try { localStorage.setItem(PREFIXO + chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
}

export function useLembrado<T>(chave: string, inicial: T): [T, Dispatch<SetStateAction<T>>] {
    const [valor, setValor] = useState<T>(() => lerLembrado(chave, inicial));
    useEffect(() => { gravarLembrado(chave, valor); }, [chave, valor]);
    return [valor, setValor];
}
