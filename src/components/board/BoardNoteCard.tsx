import { useRef, useState } from 'react';
import { Trash2, Check, Link2 } from 'lucide-react';
import { BoardNote, BoardNoteColor, BOARD_COLORS } from '@/types/board';
import { calcularRedimensionamento, Canto } from '@/utils/board';

export const PALETA: Record<BoardNoteColor, { bg: string; border: string; text: string; dot: string }> = {
    amber: { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-50', dot: 'bg-amber-500' },
    emerald: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-50', dot: 'bg-emerald-500' },
    sky: { bg: 'bg-sky-500/15', border: 'border-sky-500/40', text: 'text-sky-50', dot: 'bg-sky-500' },
    rose: { bg: 'bg-rose-500/15', border: 'border-rose-500/40', text: 'text-rose-50', dot: 'bg-rose-500' },
    violet: { bg: 'bg-violet-500/15', border: 'border-violet-500/40', text: 'text-violet-50', dot: 'bg-violet-500' },
    zinc: { bg: 'bg-zinc-800', border: 'border-zinc-700', text: 'text-zinc-100', dot: 'bg-zinc-500' },
};

const CANTOS: { canto: Canto; classe: string; cursor: string }[] = [
    { canto: 'nw', classe: 'top-0 left-0', cursor: 'cursor-nwse-resize' },
    { canto: 'ne', classe: 'top-0 right-0', cursor: 'cursor-nesw-resize' },
    { canto: 'sw', classe: 'bottom-0 left-0', cursor: 'cursor-nesw-resize' },
    { canto: 'se', classe: 'bottom-0 right-0', cursor: 'cursor-nwse-resize' },
];

interface Props {
    note: BoardNote;
    onContentChange: (id: string, content: string) => void;
    onColorChange: (id: string, color: BoardNoteColor) => void;
    onToggleDone: (id: string) => void;
    onMoveLocal: (id: string, patch: { pos_x?: number; pos_y?: number; width?: number; height?: number }) => void;
    onCommitGeometry: (id: string) => void;
    onBringToFront: (id: string) => void;
    onRequestDelete: (id: string) => void;
    /** Ativa quando a ferramenta "Ligar" está selecionada — troca o card por uma área de clique só para escolher a nota. */
    linkMode?: boolean;
    isLinkOrigin?: boolean;
    onLinkClick?: (id: string) => void;
    /** Capturada pelo retângulo de seleção (arrasto no fundo do quadro). */
    isSelecionada?: boolean;
}

/**
 * Um post-it do quadro: arrasta pela faixa superior, redimensiona por
 * qualquer um dos 4 cantos, escreve livremente no corpo. Nada disso grava a
 * cada pixel — grava ao SOLTAR o gesto (ver commitGeometry no hook useBoard).
 */
export function BoardNoteCard({
    note, onContentChange, onColorChange, onToggleDone,
    onMoveLocal, onCommitGeometry, onBringToFront, onRequestDelete,
    linkMode, isLinkOrigin, onLinkClick, isSelecionada,
}: Props) {
    const [mostrarCores, setMostrarCores] = useState(false);
    const paleta = PALETA[note.color] || PALETA.amber;

    const arraste = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
    const redimensiona = useRef<{ canto: Canto; x: number; y: number; base: { pos_x: number; pos_y: number; width: number; height: number } } | null>(null);

    const iniciarArraste = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        arraste.current = { x: e.clientX, y: e.clientY, px: note.pos_x, py: note.pos_y };
        onBringToFront(note.id);
    };
    const moverArraste = (e: React.PointerEvent) => {
        if (!arraste.current) return;
        const dx = e.clientX - arraste.current.x;
        const dy = e.clientY - arraste.current.y;
        onMoveLocal(note.id, { pos_x: arraste.current.px + dx, pos_y: arraste.current.py + dy });
    };
    const soltarArraste = () => {
        if (!arraste.current) return;
        arraste.current = null;
        onCommitGeometry(note.id);
    };

    const iniciarRedimensionamento = (canto: Canto) => (e: React.PointerEvent) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        redimensiona.current = {
            canto, x: e.clientX, y: e.clientY,
            base: { pos_x: note.pos_x, pos_y: note.pos_y, width: note.width, height: note.height },
        };
        onBringToFront(note.id);
    };
    const moverRedimensionamento = (e: React.PointerEvent) => {
        if (!redimensiona.current) return;
        const dx = e.clientX - redimensiona.current.x;
        const dy = e.clientY - redimensiona.current.y;
        const r = calcularRedimensionamento(redimensiona.current.canto, redimensiona.current.base, dx, dy);
        onMoveLocal(note.id, r);
    };
    const soltarRedimensionamento = () => {
        if (!redimensiona.current) return;
        redimensiona.current = null;
        onCommitGeometry(note.id);
    };

    return (
        <div
            className={`absolute rounded-xl border shadow-lg shadow-black/30 flex flex-col select-none transition-opacity ${paleta.bg} ${paleta.border} ${note.is_done ? 'opacity-45' : ''} ${isLinkOrigin ? 'ring-2 ring-sky-400' : ''} ${isSelecionada ? 'ring-2 ring-amber-400' : ''}`}
            style={{ left: note.pos_x, top: note.pos_y, width: note.width, height: note.height, zIndex: note.z_index }}
            onPointerDown={() => !linkMode && onBringToFront(note.id)}
        >
            {linkMode ? (
                // Modo "ligar": o card inteiro vira um botão de escolha. Os
                // controles normais somem para não competir com o clique de
                // selecionar a nota como origem/destino da ligação.
                <button
                    onClick={() => onLinkClick?.(note.id)}
                    className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2 text-center"
                >
                    <Link2 size={16} className={isLinkOrigin ? 'text-sky-300' : paleta.text} />
                    <span className={`text-[11px] leading-snug line-clamp-3 font-medium ${paleta.text} opacity-90`}>
                        {note.content || '(nota vazia)'}
                    </span>
                </button>
            ) : (
                <>
                    <div
                        className="flex items-center gap-1.5 px-2 py-1.5 cursor-move shrink-0"
                        onPointerDown={iniciarArraste}
                        onPointerMove={moverArraste}
                        onPointerUp={soltarArraste}
                        onPointerCancel={soltarArraste}
                    >
                        <div className="relative" data-no-drag>
                            <button
                                onClick={() => setMostrarCores(v => !v)}
                                title="Cor da nota"
                                aria-label="Cor da nota"
                                className={`w-4 h-4 rounded-full border border-black/20 ${paleta.dot}`}
                            />
                            {mostrarCores && (
                                <div className="absolute top-6 left-0 z-10 flex items-center gap-2 p-2 bg-zinc-950 border border-zinc-800 rounded-xl shadow-lg">
                                    {BOARD_COLORS.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => { onColorChange(note.id, c); setMostrarCores(false); }}
                                            title={c}
                                            aria-label={`Cor ${c}`}
                                            className={`w-5 h-5 rounded-full ${PALETA[c].dot} ${c === note.color ? 'ring-2 ring-white/60' : ''}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            data-no-drag
                            onClick={() => onToggleDone(note.id)}
                            title={note.is_done ? 'Marcar como pendente' : 'Marcar como concluído'}
                            aria-label={note.is_done ? 'Marcar como pendente' : 'Marcar como concluído'}
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${note.is_done ? 'bg-white/80 border-white/80' : 'border-black/25 bg-black/10'}`}
                        >
                            {note.is_done && <Check size={12} strokeWidth={4} className="text-zinc-900" />}
                        </button>

                        <span className="ml-auto" />

                        <button
                            data-no-drag
                            onClick={() => onRequestDelete(note.id)}
                            title="Apagar nota"
                            aria-label="Apagar nota"
                            className="p-1 text-black/40 hover:text-rose-700 transition-colors"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>

                    <textarea
                        value={note.content}
                        onChange={e => onContentChange(note.id, e.target.value)}
                        onPointerDown={() => onBringToFront(note.id)}
                        placeholder="Escreva aqui..."
                        className={`flex-1 min-h-0 bg-transparent resize-none outline-none px-2.5 pb-2.5 text-base sm:text-[12.5px] leading-relaxed font-medium ${paleta.text} placeholder:opacity-40`}
                    />

                    {CANTOS.map(({ canto, classe, cursor }) => (
                        <div
                            key={canto}
                            className={`absolute w-4 h-4 ${classe} ${cursor}`}
                            onPointerDown={iniciarRedimensionamento(canto)}
                            onPointerMove={moverRedimensionamento}
                            onPointerUp={soltarRedimensionamento}
                            onPointerCancel={soltarRedimensionamento}
                        />
                    ))}
                </>
            )}
        </div>
    );
}
