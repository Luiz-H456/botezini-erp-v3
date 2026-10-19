import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { SECOES } from '@/utils/navegacao';
import type { SecaoId } from '@/utils/navegacao';
import { ICONE_DA_SECAO } from './icones';

type Contadores = Partial<Record<string, { n: number; urgente: boolean }>>;

interface Props {
    secaoAtual: SecaoId | null;
    contadores: Contadores;
    /** No computador: aberto (w-60) ou recolhido nos ícones (w-14). */
    aberto: boolean;
    onAlternar: () => void;
    /** No celular: a gaveta. */
    gavetaAberta: boolean;
    onFecharGaveta: () => void;
    onIrParaSecao: (id: SecaoId) => void;
}

/**
 * O menu do app inteiro: as oito seções, sempre à mão. No computador é a lateral;
 * no celular, a mesma lista numa gaveta aberta pelo botão da barra de cima.
 */
export function MenuDoApp({ secaoAtual, contadores, aberto, onAlternar, gavetaAberta, onFecharGaveta, onIrParaSecao }: Props) {
    const gaveta = useRef<HTMLDivElement>(null);
    // Esc fecha; Tab e Shift+Tab ficam presos na gaveta (do último item volta ao primeiro e vice-versa).
    useEffect(() => {
        if (!gavetaAberta) return;
        const aoTecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onFecharGaveta(); return; }
            if (e.key !== 'Tab') return;
            const itens = gaveta.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
            if (!itens?.length) return;
            const primeiro = itens[0], ultimo = itens[itens.length - 1];
            // Gaveta invisível (viewport passou a md com ela "aberta"): não prende o Tab.
            if (primeiro.getClientRects().length === 0) return;
            const dentro = gaveta.current!.contains(document.activeElement);
            if (e.shiftKey && (!dentro || document.activeElement === primeiro)) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) { e.preventDefault(); primeiro.focus(); }
        };
        document.addEventListener('keydown', aoTecla);
        return () => document.removeEventListener('keydown', aoTecla);
    }, [gavetaAberta, onFecharGaveta]);

    // Foco entra na gaveta (primeiro item) ao abrir e volta a quem a abriu ("Abrir menu") ao fechar.
    useEffect(() => {
        if (!gavetaAberta) return;
        const antes = document.activeElement as HTMLElement | null;
        gaveta.current?.querySelector('button')?.focus();
        return () => antes?.focus();
    }, [gavetaAberta]);

    const lista = (expandido: boolean) => {
        const primeiroApoio = SECOES.findIndex(s => s.tipo === 'apoio');
        return SECOES.map((s, i) => {
            const Icone = ICONE_DA_SECAO[s.id];
            const ativa = secaoAtual === s.id;
            const c = contadores[s.id];
            const contador = c && c.n > 0 ? c : null;
            return (
                <div key={s.id}>
                    {i === primeiroApoio && <div className="border-t border-zinc-800 my-2" />}
                    <button
                        type="button"
                        onClick={() => { onIrParaSecao(s.id); onFecharGaveta(); }}
                        title={expandido ? s.descricao : s.rotulo}
                        aria-current={ativa ? 'page' : undefined}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] border transition-colors ${expandido ? '' : 'justify-center px-0'} ${ativa
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60'}`}
                    >
                        <span className="relative shrink-0">
                            <Icone size={14} strokeWidth={ativa ? 2.5 : 2} />
                            {!expandido && contador && (
                                <span aria-hidden className={`absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full ${contador.urgente ? 'bg-rose-500' : 'bg-zinc-500'}`} />
                            )}
                        </span>
                        {expandido && <span className="min-w-0 text-left leading-tight">{s.rotulo}</span>}
                        {expandido && contador && (
                            <span className={`ml-auto rounded-md px-1.5 text-[10px] font-black tabular-nums ${contador.urgente ? 'bg-rose-500/15 text-rose-400' : 'bg-zinc-800 text-zinc-400'}`}>
                                {contador.n}
                            </span>
                        )}
                        {!expandido && <span className="sr-only">{s.rotulo}{contador ? `, ${contador.n}` : ''}</span>}
                    </button>
                </div>
            );
        });
    };

    return (
        <>
            <aside className={`${aberto ? 'w-60' : 'w-14'} hidden md:flex shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200 z-20 print:hidden`}>
                <div className={`h-10 shrink-0 flex items-center px-2 ${aberto ? 'justify-end' : 'justify-center'}`}>
                    <button
                        type="button"
                        onClick={onAlternar}
                        title={aberto ? 'Recolher' : 'Expandir'}
                        aria-label={aberto ? 'Recolher menu' : 'Expandir menu'}
                        className="p-1.5 text-zinc-700 hover:text-zinc-300 rounded-lg hover:bg-zinc-900 transition-colors"
                    >
                        {aberto ? <ChevronsLeft size={15} /> : <ChevronsRight size={15} />}
                    </button>
                </div>
                <nav aria-label="Menu do app" className="flex-1 px-2 pb-2 overflow-y-auto custom-scrollbar">{lista(aberto)}</nav>
            </aside>

            {gavetaAberta && createPortal(
                <div ref={gaveta} role="dialog" aria-modal="true" aria-label="Menu do app"
                    className="md:hidden fixed inset-0 z-modal bg-black/60 print:hidden" onClick={onFecharGaveta}>
                    <nav
                        aria-label="Menu do app"
                        onClick={e => e.stopPropagation()}
                        className="w-72 max-w-[85vw] h-full bg-zinc-950 border-r border-zinc-800 p-3 overflow-y-auto"
                    >
                        {lista(true)}
                    </nav>
                </div>,
                document.body,
            )}
        </>
    );
}
