import { useEffect, useState } from 'react';

/** Abaixo disto a lateral aberta custa mais largura do que entrega. */
export const LARGURA_DE_TELA_LARGA = 1024;

/**
 * A tela é larga o bastante para a lateral ficar aberta?
 *
 * POR QUE EXISTE. A lateral tem largura fixa — 208px aberta — em qualquer
 * tela. Num tablet de 768px isso é mais de um quarto da largura gasto com
 * cinco rótulos que os ícones já dizem; num celular de 375px é mais da
 * metade, e o que sobra não comporta nem uma tabela.
 *
 * A lateral não SOME abaixo de 1024: ela recolhe para os ícones, que é o
 * estado que o próprio app já tinha. O botão de expandir continua ali — quem
 * quiser abrir no tablet, abre. O que muda é só o padrão, e o padrão é o que
 * decide a experiência de quem nunca mexeu em nada.
 *
 * `matchMedia` e não `resize`: o navegador avisa na virada em vez de disparar
 * a cada pixel arrastado.
 */
export function useTelaLarga(): boolean {
    const [larga, setLarga] = useState(
        // No primeiro render já responde certo, sem um quadro com a lateral
        // no tamanho errado. `window` pode não existir se algum dia isto
        // renderizar fora do navegador.
        () => typeof window === 'undefined'
            ? true
            : window.matchMedia(`(min-width: ${LARGURA_DE_TELA_LARGA}px)`).matches,
    );

    useEffect(() => {
        const mq = window.matchMedia(`(min-width: ${LARGURA_DE_TELA_LARGA}px)`);
        const aoMudar = (e: MediaQueryListEvent) => setLarga(e.matches);
        mq.addEventListener('change', aoMudar);
        setLarga(mq.matches);
        return () => mq.removeEventListener('change', aoMudar);
    }, []);

    return larga;
}
