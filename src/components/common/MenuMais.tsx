import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ItemDoMenu { rotulo: string; onClick: () => void; perigo?: boolean }

const ALTURA_ITEM = 40;   // py-2.5 + linha de text-sm
const FOLGA = 4;
const MARGEM = 8;   // distância mínima da borda esquerda da tela

/**
 * Menu "⋯": guarda as ações de manutenção fora da vista, a um clique.
 *
 * O painel vive num portal com position: fixed, calculado pelo botão: nenhuma
 * tabela nem container com overflow o corta. Abre abaixo, alinhado à direita;
 * sem espaço embaixo, abre acima; se passaria da borda esquerda, desliza para dentro da tela.
 * Rolagem, redimensionar, Esc, clique fora e o foco sair do menu fecham.
 */
export function MenuMais({ rotulo, itens }: { rotulo: string; itens: ItemDoMenu[] }) {
    const botaoRef = useRef<HTMLButtonElement>(null);
    const painelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ right?: number; left?: number; top?: number; bottom?: number } | null>(null);

    const abre = () => {
        const r = botaoRef.current!.getBoundingClientRect();
        const right = document.documentElement.clientWidth - r.right;
        const altura = itens.length * ALTURA_ITEM + 10;
        setPos(window.innerHeight - r.bottom >= altura + FOLGA || r.top < altura + FOLGA
            ? { right, top: r.bottom + FOLGA }
            : { right, bottom: window.innerHeight - r.top + FOLGA });
    };

    // Painel alinhado à direita: se a borda esquerda cair a menos de MARGEM, encosta nela (left vence right).
    useLayoutEffect(() => {
        const p = painelRef.current;
        if (!pos || !p || pos.left !== undefined) return;
        const r = p.getBoundingClientRect();
        if (r.left < MARGEM) setPos({ ...pos, left: MARGEM, right: undefined });
    }, [pos]);

    useEffect(() => {
        if (!pos) return;
        painelRef.current?.querySelector('button')?.focus({ preventScroll: true });
        const fecha = () => setPos(null);
        const fora = (e: Event) => {
            const alvo = e.target as Node;
            if (!painelRef.current?.contains(alvo) && !botaoRef.current?.contains(alvo)) fecha();
        };
        const tecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { fecha(); botaoRef.current?.focus(); return; }
            // O portal fica no fim do body: Tab do último item (ou Shift+Tab do primeiro) vai para a barra do
            // navegador, onde o focusout não tem relatedTarget. Fecha aqui e devolve o foco ao botão.
            if (e.key !== 'Tab') return;
            const itens = painelRef.current?.querySelectorAll<HTMLElement>('button');
            if (!itens?.length || !painelRef.current?.contains(document.activeElement)) return;
            if (e.shiftKey ? document.activeElement === itens[0] : document.activeElement === itens[itens.length - 1]) {
                e.preventDefault(); fecha(); botaoRef.current?.focus();
            }
        };
        // Foco saiu do painel e do botão (Tab para fora): fecha. relatedTarget nulo = janela perdeu o foco, não fecha.
        const foco = (e: FocusEvent) => {
            const p = e.relatedTarget as Node | null;
            if (p && !painelRef.current?.contains(p) && !botaoRef.current?.contains(p)) fecha();
        };
        const painel = painelRef.current, botao = botaoRef.current;
        painel?.addEventListener('focusout', foco);
        botao?.addEventListener('focusout', foco);
        document.addEventListener('pointerdown', fora);
        document.addEventListener('keydown', tecla);
        window.addEventListener('scroll', fecha, true);
        window.addEventListener('resize', fecha);
        return () => {
            painel?.removeEventListener('focusout', foco);
            botao?.removeEventListener('focusout', foco);
            document.removeEventListener('pointerdown', fora);
            document.removeEventListener('keydown', tecla);
            window.removeEventListener('scroll', fecha, true);
            window.removeEventListener('resize', fecha);
        };
    }, [pos]);

    return (
        <>
            <button ref={botaoRef} type="button" aria-label={rotulo} title={rotulo} aria-haspopup="menu" aria-expanded={!!pos}
                onClick={() => (pos ? setPos(null) : abre())}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900">⋯</button>
            {pos && createPortal(
                <div ref={painelRef} role="menu" style={pos}
                    className="fixed z-balao min-w-48 rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl">
                    {itens.map((i, n) => (
                        <button key={`${n}-${i.rotulo}`} type="button" role="menuitem"
                            onClick={() => { setPos(null); botaoRef.current?.focus(); i.onClick(); }}
                            className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-zinc-900 ${i.perigo ? 'text-rose-400' : 'text-zinc-200'}`}>
                            {i.rotulo}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
}
