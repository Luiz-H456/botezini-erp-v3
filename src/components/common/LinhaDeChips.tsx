import React, { useEffect, useRef } from 'react';

export interface ChipDeSugestao {
    chave: string;
    rotulo: string;
    ativo?: boolean;
    titulo?: string;
}

interface Props {
    itens: ChipDeSugestao[];
    onEscolher: (chave: string) => void;
}

/**
 * Fileira de atalhos de um clique — sempre uma linha só, nunca uma coluna.
 *
 * Era `flex-wrap`, e quebrava linha quando o container ficava estreito — o
 * caso comum, porque estes atalhos moram dentro de uma célula de grid de 1/2
 * ou 1/3 da largura do formulário (categoria ao lado de nome/CNPJ). Com rótulo
 * comprido e coluna estreita, a quebra deixava de significar "várias por
 * linha" e passava a significar "uma por linha": a fileira de sugestão virava
 * uma lista vertical que empurrava o resto do formulário para baixo.
 *
 * Rolagem horizontal resolve nos dois tamanhos de tela: no espaçoso, os chips
 * cabem todos e a barra nem aparece; no estreito, vira uma fileira que rola.
 */
export const LinhaDeChips: React.FC<Props> = ({ itens, onEscolher }) => {
    const faixa = useRef<HTMLDivElement>(null);

    /**
     * Roda do mouse rola a fileira na horizontal.
     *
     * Mouse comum só emite deltaY, então numa faixa que rola só na horizontal a
     * roda não fazia nada — o cursor ficava sobre uma lista rolável que se
     * recusava a rolar. Aqui o deltaY vira scrollLeft.
     *
     * Duas condições antes de sequestrar o evento, para não prender a página:
     * só quando existe transbordo horizontal de fato, e só enquanto ainda há
     * para onde rolar naquela direção. Chegando na ponta, o evento segue para o
     * pai e a página volta a rolar normalmente — sem isso o formulário travaria
     * toda vez que o ponteiro cruzasse a fileira.
     *
     * Listener nativo com `passive: false` porque preventDefault é ignorado em
     * listener passivo, e a roda entra como passiva por padrão nos navegadores.
     */
    useEffect(() => {
        const el = faixa.current;
        if (!el) return;

        const naRoda = (e: WheelEvent) => {
            const transbordo = el.scrollWidth - el.clientWidth;
            if (transbordo <= 0) return;

            // Trackpad com gesto horizontal já resolve sozinho; só traduzimos
            // quando o movimento dominante é vertical.
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (delta === 0) return;

            const noComeco = el.scrollLeft <= 0;
            const noFim = el.scrollLeft >= transbordo - 1;
            if ((delta < 0 && noComeco) || (delta > 0 && noFim)) return;

            e.preventDefault();
            el.scrollLeft += delta;
        };

        el.addEventListener('wheel', naRoda, { passive: false });
        return () => el.removeEventListener('wheel', naRoda);
    }, [itens.length]);

    if (itens.length === 0) return null;

    return (
        <div ref={faixa} className="flex gap-1.5 overflow-x-auto chips-scroll -mx-0.5 px-0.5 pb-1">
            {itens.map(it => (
                <button key={it.chave} type="button" onClick={() => onEscolher(it.chave)}
                    title={it.titulo}
                    className={`shrink-0 whitespace-nowrap px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${it.ativo
                        ? 'bg-amber-500 text-black border-amber-500'
                        : 'bg-zinc-950/60 text-zinc-500 border-zinc-800 hover:border-amber-500/30 hover:text-amber-500'}`}>
                    {it.rotulo}
                </button>
            ))}
        </div>
    );
};
