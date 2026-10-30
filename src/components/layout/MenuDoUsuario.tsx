import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, UserCog, ChevronDown, AlertCircle } from 'lucide-react';
import type { UserProfile } from '@/types';
import { useSignedUrl } from '@/components/common/GaleriaDeFotos';
import {
    nomeDeExibicao, iniciais, corDoAvatar, rotuloDoCargo, semNomeProprio,
} from '@/utils/perfilDoUsuario';

interface Props {
    perfil: UserProfile | null;
    onAbrirPerfil: () => void;
    onSair: () => void;
}

/**
 * O usuário no topo, e o que ele pode fazer consigo mesmo.
 *
 * Antes o "Sair do Sistema" era um botão permanente no pé da barra lateral —
 * ocupava espaço fixo para uma ação que se usa uma vez por dia, e ficava no
 * canto mais distante do olhar. Aqui ele mora dentro do próprio usuário, que é
 * onde se procura por ele.
 *
 * O ponto âmbar aparece enquanto o nome não foi preenchido: sem ele, ninguém
 * descobre que dá para arrumar — a tela nunca reclama de estar mostrando o
 * cargo no lugar do nome.
 */
export function MenuDoUsuario({ perfil, onAbrirPerfil, onSair }: Props) {
    const [aberto, setAberto] = useState(false);
    const caixaRef = useRef<HTMLDivElement>(null);
    const botaoRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

    const nome = nomeDeExibicao(perfil);
    const cargo = rotuloDoCargo(perfil?.role);
    const faltaNome = semNomeProprio(perfil);
    const { url: foto } = useSignedUrl(perfil?.avatar_url || '');

    // Fecha ao clicar fora e no Escape. O menu vive em portal, então "fora"
    // precisa considerar as duas caixas — botão e painel.
    useEffect(() => {
        if (!aberto) return;
        const foraDaCaixa = (e: MouseEvent) => {
            const alvo = e.target as Node;
            if (caixaRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return;
            setAberto(false);
        };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
        document.addEventListener('mousedown', foraDaCaixa);
        document.addEventListener('keydown', esc);
        return () => {
            document.removeEventListener('mousedown', foraDaCaixa);
            document.removeEventListener('keydown', esc);
        };
    }, [aberto]);

    const abrir = () => {
        const r = botaoRef.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right) });
        setAberto(a => !a);
    };

    const Avatar = ({ tamanho }: { tamanho: number }) => (
        <span
            className={`shrink-0 rounded-xl border flex items-center justify-center overflow-hidden font-black ${foto ? 'border-zinc-700 bg-zinc-900' : corDoAvatar(perfil)}`}
            style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.36 }}
        >
            {foto
                ? <img src={foto} alt="" className="w-full h-full object-cover" />
                : iniciais(perfil)}
        </span>
    );

    return (
        <>
            <button
                ref={botaoRef}
                onClick={abrir}
                aria-haspopup="menu"
                aria-expanded={aberto}
                title={perfil?.email || nome}
                className={`flex items-center gap-2.5 pl-1.5 pr-2 py-1.5 rounded-xl border transition-colors ${aberto
                    ? 'bg-zinc-900 border-zinc-700'
                    : 'border-transparent hover:bg-zinc-900/60 hover:border-zinc-800'}`}
            >
                <span className="relative">
                    <Avatar tamanho={28} />
                    {faltaNome && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-zinc-950"
                            title="Falta preencher seu nome" />
                    )}
                </span>
                <span className="hidden md:block text-left leading-tight min-w-0">
                    <span className="block text-[10px] font-black text-zinc-200 truncate max-w-[130px]">{nome}</span>
                    <span className="block text-[10px] font-black text-zinc-600 uppercase tracking-[0.15em]">{cargo}</span>
                </span>
                <ChevronDown size={13} className={`text-zinc-600 transition-transform ${aberto ? 'rotate-180' : ''}`} />
            </button>

            {aberto && pos && createPortal(
                <div
                    ref={caixaRef}
                    role="menu"
                    style={{
                        position: 'fixed', top: pos.top, right: pos.right,
                        // Camada 'painel' (ver @theme em index.css). Vai em style e
                        // nao em classe porque top/right ja sao calculados aqui —
                        // mas o VALOR sai da mesma escala, senao este menu volta a
                        // cobrir o modal de perfil que ele mesmo abre.
                        zIndex: 'var(--z-index-painel)' as unknown as number,
                    }}
                    className="w-64 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden ease-out animate-in fade-in slide-in-from-top-2 duration-200"
                >
                    <div className="px-4 py-3.5 border-b border-zinc-800/70 flex items-center gap-3">
                        <Avatar tamanho={40} />
                        <div className="min-w-0">
                            <p className="text-[11px] font-black text-white truncate">{nome}</p>
                            <p className="text-[10px] font-bold text-zinc-500 truncate">{perfil?.email}</p>
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mt-0.5">{cargo}</p>
                        </div>
                    </div>

                    {faltaNome && (
                        <button
                            onClick={() => { setAberto(false); onAbrirPerfil(); }}
                            className="w-full text-left px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-start gap-2.5 hover:bg-amber-500/15 transition-colors"
                        >
                            <AlertCircle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                            <span className="text-[10px] font-bold text-amber-300 leading-snug">
                                Seu nome ainda não está cadastrado — estamos mostrando o cargo no lugar dele.
                            </span>
                        </button>
                    )}

                    <div className="p-1.5">
                        <button
                            role="menuitem"
                            onClick={() => { setAberto(false); onAbrirPerfil(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
                        >
                            <UserCog size={14} /> Meu perfil
                        </button>
                        <button
                            role="menuitem"
                            onClick={() => { setAberto(false); onSair(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 hover:bg-rose-950/30 hover:text-rose-400 transition-colors"
                        >
                            <LogOut size={14} /> Sair
                        </button>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
