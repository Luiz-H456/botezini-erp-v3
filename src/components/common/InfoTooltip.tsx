import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export interface InfoTooltipProps {
    children: React.ReactNode; // conteúdo do tooltip
    width?: number;
    iconSize?: number;
}

/**
 * Quanto o ponteiro precisa ficar parado sobre o "i" para o tooltip abrir.
 *
 * Sem espera nenhuma, atravessar o ícone a caminho de outro campo abria o balão
 * em cima do formulário, e era preciso desviar o mouse para fechá-lo — o gesto
 * mais irritante da tela de orçamento, onde há um "i" no meio do caminho de
 * quase toda descida.
 *
 * Um segundo resolvia isso mas cobrava caro de quem QUERIA ler: parado sobre o
 * ícone, a espera passou a ser o incômodo. 200 ms ainda descartam a passagem
 * de raspão — nenhum trajeto casual fica parado esse tempo — e somem para quem
 * mirou no ícone de propósito.
 */
const ESPERA_MS = 200;

/**
 * Ícone "i" com tooltip renderizado via portal — fica por cima de TUDO
 * (inclusive modais com scroll), nunca é cortado por overflow:hidden/auto
 * do container pai.
 *
 * Abre depois de um segundo de permanência, com um anel que se preenche
 * durante a espera: sem esse retorno visual a demora parece o tooltip estar
 * quebrado, e a pessoa desiste antes de ele aparecer.
 */
export function InfoTooltip({ children, width = 288, iconSize = 13 }: InfoTooltipProps) {
    const [visible, setVisible] = useState(false);
    const [aguardando, setAguardando] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const anchorRef = useRef<HTMLSpanElement>(null);
    const timer = useRef<number | null>(null);

    const cancelarEspera = () => {
        if (timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
        setAguardando(false);
    };

    // Timer pendente com o componente desmontado dispararia setState em algo
    // que não existe mais.
    useEffect(() => cancelarEspera, []);

    const abrir = () => {
        cancelarEspera();
        if (anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            let left = rect.left;
            // Evita estourar a borda direita da viewport
            if (left + width > window.innerWidth - 12) {
                left = window.innerWidth - width - 12;
            }
            setPos({ top: rect.bottom + 8, left });
        }
        setVisible(true);
    };

    const aoEntrar = () => {
        if (visible) return;
        setAguardando(true);
        timer.current = window.setTimeout(abrir, ESPERA_MS);
    };

    const aoSair = () => {
        cancelarEspera();
        setVisible(false);
    };

    return (
        <span
            ref={anchorRef}
            className="relative inline-flex items-center"
            onMouseEnter={aoEntrar}
            onMouseLeave={aoSair}
            // Toque: sem mouse não existe hover, então em tablet/celular o
            // tooltip nunca abriria. O clique abre NA HORA — quem clicou já
            // declarou a intenção, e fazê-lo esperar um segundo seria punir
            // justamente o gesto mais explícito.
            onClick={(e) => { e.stopPropagation(); visible ? aoSair() : abrir(); }}
        >
            <span className="relative inline-flex items-center justify-center">
                <Info
                    size={iconSize}
                    className={`cursor-help transition-colors ${visible || aguardando ? 'text-amber-500' : 'text-zinc-600 hover:text-amber-500'}`}
                />
                {/* Anel de progresso da espera. `pointer-events-none` para não
                    roubar o hover do próprio ícone que ele decora. */}
                {aguardando && (
                    // O anel é MAIOR que o ícone que ele contorna (iconSize+8
                    // contra iconSize), e com `inset-0 m-auto` ficava 4 px à
                    // direita do centro — medido: borda esquerda colada na do
                    // container, sobrando tudo para a direita.
                    //
                    // A causa é a assimetria da regra: absoluto com as quatro
                    // bordas em 0 e largura maior que o container fica
                    // sobre-restringido, e no eixo horizontal a especificação
                    // manda ignorar uma das margens (a direita, em LTR), então
                    // `auto` à esquerda vira 0 e o elemento encosta. No eixo
                    // vertical não há essa regra: as duas margens dividem em
                    // partes iguais, aceitam valor negativo, e por isso o anel
                    // estava certo em Y e torto só em X — o tipo de desvio que
                    // se enxerga sem se conseguir nomear.
                    //
                    // Centralizar pelo ponto médio não depende de tamanho e vale
                    // para os dois eixos.
                    <svg
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none -rotate-90"
                        width={iconSize + 8} height={iconSize + 8} viewBox="0 0 20 20"
                    >
                        <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor"
                            className="text-zinc-800" strokeWidth="1.5" />
                        <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor"
                            className="text-amber-500" strokeWidth="1.5" strokeLinecap="round"
                            strokeDasharray="53.4" strokeDashoffset="53.4"
                            style={{ animation: `preencher-anel ${ESPERA_MS}ms linear forwards` }} />
                    </svg>
                )}
            </span>

            {visible && pos && createPortal(
                <div
                    style={{ position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 'var(--z-index-balao)' as unknown as number }}
                    className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl text-left normal-case tracking-normal ease-out animate-in fade-in zoom-in-95 duration-150"
                >
                    {children}
                </div>,
                document.body
            )}
        </span>
    );
}
