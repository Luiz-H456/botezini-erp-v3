import React from 'react';
import { Check, Minus } from 'lucide-react';

interface Props {
    marcada: boolean;
    onToggle: () => void;
    /** Estado intermediário: alguns marcados, nem todos. */
    parcial?: boolean;
    titulo?: string;
    /** Área de clique maior que a caixa, para linha de tabela. */
    className?: string;
}

/**
 * Caixa de seleção no visual do app.
 *
 * O `<input type="checkbox">` nativo, mesmo com `accent-color`, mantém o
 * desenho do sistema operacional: cantos, borda e tamanho do Windows no meio de
 * uma tabela de cantos arredondados e traço fino. Destoava de todas as outras
 * caixas do app — as marcas de custo fixo e CPV já eram quadrados desenhados à
 * mão, e esta precisava ser a mesma coisa.
 *
 * `button` e não `input`: já vem com foco, Enter e Espaço de graça, e o estado
 * vai em `aria-checked` — leitor de tela continua anunciando "caixa de
 * seleção", que é o que importa preservar ao trocar o elemento nativo.
 */
export const CaixaDeSelecao: React.FC<Props> = ({
    marcada, onToggle, parcial, titulo, className = '',
}) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={parcial ? 'mixed' : marcada}
        title={titulo}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`shrink-0 w-4 h-4 rounded-[5px] border flex items-center justify-center transition-all active:scale-90 ${marcada || parcial
            ? 'bg-amber-500 border-amber-500'
            : 'border-zinc-700 bg-zinc-950/60 hover:border-zinc-500'} ${className}`}
    >
        {parcial
            ? <Minus size={12} className="text-black" strokeWidth={4} />
            : marcada
                ? <Check size={12} className="text-black" strokeWidth={4} />
                : null}
    </button>
);
