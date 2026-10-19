import { useRef, useState, useEffect } from 'react';
import { Plus, NotebookPen, AlertTriangle, MousePointer2, Pencil, ArrowUpRight, Link2 } from 'lucide-react';
import { useBoard } from '@/hooks/board/useBoard';
import { BoardNoteCard, PALETA } from '@/components/board/BoardNoteCard';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ITEM, ROTULO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';
import {
    tamanhoCanvas, tamanhoCanvasComPontos, deveAdicionarPonto, pontoNaBorda,
    duploPressionamento, normalizarRetangulo, totalmenteDentro, caixaDosPontos, Retangulo,
} from '@/utils/board';
import { BOARD_COLORS, BoardNoteColor, BoardPoint } from '@/types/board';

type Ferramenta = 'select' | 'pen' | 'arrow' | 'connect';

/** Classes literais (não interpoladas) — o Tailwind só reconhece o que aparece como string fixa no código. */
const TRACO: Record<BoardNoteColor, { stroke: string; fill: string }> = {
    amber: { stroke: 'stroke-amber-500', fill: 'fill-amber-500' },
    emerald: { stroke: 'stroke-emerald-500', fill: 'fill-emerald-500' },
    sky: { stroke: 'stroke-sky-500', fill: 'fill-sky-500' },
    rose: { stroke: 'stroke-rose-500', fill: 'fill-rose-500' },
    violet: { stroke: 'stroke-violet-500', fill: 'fill-violet-500' },
    zinc: { stroke: 'stroke-zinc-400', fill: 'fill-zinc-400' },
};

// Traços (caneta/seta) NÃO passam por aqui — apagam com Delete 2x, sem modal
// (ver drawingsSelecionados). Nota (solo ou em lote) e ligação continuam
// pedindo confirmação: é mais fácil refazer um rabisco do que uma anotação.
type Pendencia =
    | { tipo: 'note'; id: string }
    | { tipo: 'connection'; id: string }
    | { tipo: 'notes-batch'; ids: string[] }
    | null;

/**
 * Quadro de notas pessoal — post-its livres, ligações entre eles, setas e
 * caneta de desenho. Sem estrutura imposta: a "ferramenta" ativa é a única
 * coisa que muda o que um clique no quadro significa.
 *
 * O canvas cresce sozinho conforme notas e traços se espalham — não existe
 * uma borda fixa do quadro (ver utils/board.ts).
 */
export default function Board() {
    const board = useBoard();
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const [ferramenta, setFerramenta] = useState<Ferramenta>('select');
    const [corTraco, setCorTraco] = useState<BoardNoteColor>('zinc');
    const [linkOrigin, setLinkOrigin] = useState<string | null>(null);
    const [pendente, setPendente] = useState<Pendencia>(null);
    const [apagando, setApagando] = useState(false);

    const desenhoAtual = useRef<{ tipo: 'pen' | 'arrow'; pontos: BoardPoint[] } | null>(null);
    const [previewPontos, setPreviewPontos] = useState<BoardPoint[] | null>(null);

    /**
     * Seleção múltipla — por clique (substitui a seleção anterior) ou pelo
     * retângulo de arrasto (substitui pelo que estiver TOTALMENTE dentro).
     * Traços apagam com Delete 2x, sem modal; notas selecionadas em lote pedem
     * UMA confirmação para todas, não uma por nota.
     */
    const [notasSelecionadas, setNotasSelecionadas] = useState<Set<string>>(new Set());
    const [drawingsSelecionados, setDrawingsSelecionados] = useState<Set<string>>(new Set());
    const ultimoDelMs = useRef(0);

    const marcacao = useRef<{ x1: number; y1: number } | null>(null);
    const [retanguloSelecao, setRetanguloSelecao] = useState<Retangulo | null>(null);

    const limparSelecao = () => {
        setNotasSelecionadas(new Set());
        setDrawingsSelecionados(new Set());
    };

    const baseCanvas = tamanhoCanvas(board.notes, 2400, 1400);
    const { largura, altura } = tamanhoCanvasComPontos(
        baseCanvas.largura, baseCanvas.altura,
        board.drawings.flatMap(d => d.points),
    );

    const trocarFerramenta = (f: Ferramenta) => {
        // Trocar de ferramenta no meio de um gesto cancela o gesto — não deixa
        // "ligação pela metade" ou traço órfão pendurado.
        setLinkOrigin(null);
        desenhoAtual.current = null;
        setPreviewPontos(null);
        marcacao.current = null;
        setRetanguloSelecao(null);
        limparSelecao();
        setFerramenta(f);
    };

    const handleAddNote = () => {
        const c = containerRef.current;
        board.addNote(c?.scrollLeft ?? 0, c?.scrollTop ?? 0);
    };

    /** Interagir com uma nota individualmente sai do modo "vários selecionados". */
    const bringToFrontEDeselecionar = (id: string) => {
        limparSelecao();
        board.bringToFront(id);
    };

    const coordenadasSvg = (e: React.PointerEvent): BoardPoint => {
        const rect = svgRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const iniciarDesenho = (e: React.PointerEvent) => {
        if (ferramenta !== 'pen' && ferramenta !== 'arrow') return;
        (e.currentTarget as unknown as Element).setPointerCapture(e.pointerId);
        const p = coordenadasSvg(e);
        desenhoAtual.current = { tipo: ferramenta, pontos: [p] };
        setPreviewPontos([p]);
    };

    const moverDesenho = (e: React.PointerEvent) => {
        if (!desenhoAtual.current) return;
        const p = coordenadasSvg(e);
        if (desenhoAtual.current.tipo === 'arrow') {
            desenhoAtual.current.pontos = [desenhoAtual.current.pontos[0], p];
        } else {
            const ultimo = desenhoAtual.current.pontos[desenhoAtual.current.pontos.length - 1];
            if (!deveAdicionarPonto(ultimo, p)) return;
            desenhoAtual.current.pontos.push(p);
        }
        setPreviewPontos([...desenhoAtual.current.pontos]);
    };

    const soltarDesenho = async () => {
        const atual = desenhoAtual.current;
        desenhoAtual.current = null;
        setPreviewPontos(null);
        if (!atual) return;

        if (atual.tipo === 'arrow') {
            const [a, b] = atual.pontos.length >= 2 ? atual.pontos : [atual.pontos[0], atual.pontos[0]];
            if (Math.hypot(b.x - a.x, b.y - a.y) < 8) return; // clique sem arrastar — nao cria seta de tamanho zero
            await board.createDrawing('arrow', [a, b], corTraco, 2.5);
        } else {
            if (atual.pontos.length < 2) return;
            await board.createDrawing('pen', atual.pontos, corTraco, 2.5);
        }
    };

    const clicarParaLigar = (id: string) => {
        if (!linkOrigin) { setLinkOrigin(id); return; }
        if (linkOrigin === id) { setLinkOrigin(null); return; } // clicar de novo na mesma cancela
        board.createConnection(linkOrigin, id, corTraco);
        setLinkOrigin(null);
    };

    // ── Retângulo de seleção (arrasto no fundo do quadro) ────────────────────
    // Só nasce quando o pointerdown é no PRÓPRIO fundo (e.target === e.currentTarget)
    // — clicar/arrastar uma nota não deve também iniciar uma marcação por cima.

    const coordenadasCanvas = (e: React.PointerEvent): BoardPoint => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const iniciarMarcacao = (e: React.PointerEvent) => {
        if (ferramenta !== 'select') return;
        if (e.target !== e.currentTarget) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const p = coordenadasCanvas(e);
        marcacao.current = { x1: p.x, y1: p.y };
        setRetanguloSelecao({ x: p.x, y: p.y, width: 0, height: 0 });
    };

    const moverMarcacao = (e: React.PointerEvent) => {
        if (!marcacao.current) return;
        const p = coordenadasCanvas(e);
        setRetanguloSelecao(normalizarRetangulo(marcacao.current.x1, marcacao.current.y1, p.x, p.y));
    };

    const soltarMarcacao = () => {
        if (!marcacao.current) return;
        marcacao.current = null;
        const ret = retanguloSelecao;
        setRetanguloSelecao(null);
        if (!ret) return;

        // Arraste pequeno demais (praticamente um clique) — trata como "clicar
        // no vazio": limpa a seleção em vez de rodar a contenção à toa.
        if (ret.width < 4 && ret.height < 4) { limparSelecao(); return; }

        const notasDentro = board.notes.filter(n => totalmenteDentro(n, ret)).map(n => n.id);
        const drawingsDentro = board.drawings
            .filter(d => totalmenteDentro(caixaDosPontos(d.points), ret))
            .map(d => d.id);
        setNotasSelecionadas(new Set(notasDentro));
        setDrawingsSelecionados(new Set(drawingsDentro));
    };

    // ── Apagar com Delete 2x (só traços) ou confirmação em lote (notas) ──────

    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            const alvo = e.target as HTMLElement;
            // Não intercepta Delete/Backspace enquanto o usuário edita texto —
            // senão apagar uma palavra numa nota também apagaria a seleção.
            if (alvo.tagName === 'TEXTAREA' || alvo.tagName === 'INPUT') return;
            if (notasSelecionadas.size === 0 && drawingsSelecionados.size === 0) return;

            const agora = Date.now();
            if (!duploPressionamento(ultimoDelMs.current, agora)) {
                ultimoDelMs.current = agora;
                return; // primeiro aperto so "arma"
            }
            ultimoDelMs.current = 0;

            // Traços somem na hora, sem confirmação.
            for (const id of drawingsSelecionados) board.deleteDrawing(id);
            setDrawingsSelecionados(new Set());

            // Notas pedem confirmação — uma só, mesmo que várias estejam selecionadas.
            if (notasSelecionadas.size > 0) {
                setPendente({ tipo: 'notes-batch', ids: [...notasSelecionadas] });
            }
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [notasSelecionadas, drawingsSelecionados, board]);

    const confirmarExclusao = async () => {
        if (!pendente) return;
        setApagando(true);
        try {
            if (pendente.tipo === 'note') await board.deleteNote(pendente.id);
            else if (pendente.tipo === 'connection') await board.deleteConnection(pendente.id);
            else await Promise.all(pendente.ids.map(id => board.deleteNote(id)));
        } finally {
            setApagando(false);
            setPendente(null);
            limparSelecao();
        }
    };

    const overlayCaptura = ferramenta === 'pen' || ferramenta === 'arrow';

    const tituloExclusao = !pendente ? '' :
        pendente.tipo === 'connection' ? 'Apagar ligação?' :
        pendente.tipo === 'notes-batch' ? `Apagar ${pendente.ids.length} notas?` :
        'Apagar nota?';
    const mensagemExclusao = !pendente ? '' :
        pendente.tipo === 'connection' ? 'A ligação entre as notas é removida. As notas em si continuam.' :
        pendente.tipo === 'notes-batch' ? `${pendente.ids.length} notas somem do quadro. Não tem como desfazer.` :
        'A nota some do quadro. Não tem como desfazer.';

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-4 sm:px-6 py-4 shrink-0 border-b border-zinc-800/60 flex-wrap">
                <NotebookPen size={18} className="text-amber-500" />
                <div>
                    <h1 className="text-sm font-black text-white uppercase tracking-tight">Quadro de notas</h1>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Só você vê — ideias, lembretes, anotações</p>
                </div>

                <div className={`flex items-center gap-1 ${ITEM} p-1 ml-2`}>
                    <BotaoFerramenta ativo={ferramenta === 'select'} onClick={() => trocarFerramenta('select')} titulo="Selecionar / mover" icone={<MousePointer2 size={18} />} />
                    <BotaoFerramenta ativo={ferramenta === 'pen'} onClick={() => trocarFerramenta('pen')} titulo="Caneta" icone={<Pencil size={18} />} />
                    <BotaoFerramenta ativo={ferramenta === 'arrow'} onClick={() => trocarFerramenta('arrow')} titulo="Seta" icone={<ArrowUpRight size={18} />} />
                    <BotaoFerramenta ativo={ferramenta === 'connect'} onClick={() => trocarFerramenta('connect')} titulo="Ligar notas" icone={<Link2 size={18} />} />
                </div>

                {(ferramenta === 'pen' || ferramenta === 'arrow' || ferramenta === 'connect') && (
                    <div className={`flex items-center gap-1.5 ${ITEM} p-2`}>
                        {BOARD_COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setCorTraco(c)}
                                title={c}
                                aria-label={`Cor ${c}`}
                                className={`w-5 h-5 rounded-full ${PALETA[c].dot} ${c === corTraco ? 'ring-2 ring-white/70' : ''}`}
                            />
                        ))}
                    </div>
                )}

                {ferramenta === 'connect' && (
                    <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">
                        {linkOrigin ? 'Clique na segunda nota' : 'Clique na primeira nota'}
                    </p>
                )}

                {ferramenta === 'select' && (notasSelecionadas.size > 0 || drawingsSelecionados.size > 0) && (
                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                        {notasSelecionadas.size + drawingsSelecionados.size} selecionado(s)
                        {drawingsSelecionados.size > 0 && ' · Delete 2x apaga os traços'}
                    </p>
                )}

                <button
                    onClick={handleAddNote}
                    className={`${BOTAO_PRINCIPAL} ml-auto`}
                >
                    <Plus size={14} strokeWidth={3} /> Nova nota
                </button>
            </div>

            {board.error && (
                <div className="mx-4 sm:mx-6 mt-3 flex items-start gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl shrink-0">
                    <AlertTriangle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-rose-400 font-bold">{board.error}</p>
                </div>
            )}

            <div
                ref={containerRef}
                className="flex-1 overflow-auto relative"
                style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
                    backgroundSize: '22px 22px',
                    cursor: overlayCaptura ? 'crosshair' : 'default',
                }}
            >
                {board.loading ? (
                    <div className="flex justify-center py-24">
                        <div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                    </div>
                ) : board.notes.length === 0 && board.drawings.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
                        <NotebookPen size={28} className="text-zinc-600" />
                        <p className={ROTULO}>Seu quadro está vazio</p>
                        <p className="text-xs text-zinc-500 font-bold">Clique em "Nova nota" para começar</p>
                    </div>
                ) : (
                    <div
                        ref={canvasRef}
                        className="relative"
                        style={{ width: largura, height: altura }}
                        onPointerDown={iniciarMarcacao}
                        onPointerMove={moverMarcacao}
                        onPointerUp={soltarMarcacao}
                        onPointerCancel={soltarMarcacao}
                    >
                        {board.notes.map(note => (
                            <BoardNoteCard
                                key={note.id}
                                note={note}
                                onContentChange={board.updateContent}
                                onColorChange={board.updateColor}
                                onToggleDone={board.toggleDone}
                                onMoveLocal={board.moveLocal}
                                onCommitGeometry={board.commitGeometry}
                                onBringToFront={bringToFrontEDeselecionar}
                                onRequestDelete={id => setPendente({ tipo: 'note', id })}
                                linkMode={ferramenta === 'connect'}
                                isLinkOrigin={linkOrigin === note.id}
                                onLinkClick={clicarParaLigar}
                                isSelecionada={notasSelecionadas.has(note.id)}
                            />
                        ))}

                        {/* Ligações, traços e a pré-visualização do gesto em andamento — tudo numa camada só, por cima das notas. */}
                        <svg
                            ref={svgRef}
                            className="absolute inset-0"
                            width={largura}
                            height={altura}
                            // camada-local: o quadro tem empilhamento PROPRIO — cada nota carrega o
                            // seu z_index vindo do banco, mexido por "trazer para a frente".
                            // Nao da para ancorar isto na escala do app: o teto aqui e o que o
                            // usuario empilhou, nao uma camada fixa.
                            style={{ pointerEvents: overlayCaptura ? 'auto' : 'none', zIndex: overlayCaptura ? 100000 : undefined }}
                            onPointerDown={iniciarDesenho}
                            onPointerMove={moverDesenho}
                            onPointerUp={soltarDesenho}
                            onPointerCancel={soltarDesenho}
                        >
                            <defs>
                                {BOARD_COLORS.map(c => (
                                    <marker key={c} id={`seta-${c}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                        <path d="M0,0 L10,5 L0,10 z" className={TRACO[c].fill} />
                                    </marker>
                                ))}
                            </defs>

                            {board.connections.map(conn => {
                                const de = board.notes.find(n => n.id === conn.from_note_id);
                                const para = board.notes.find(n => n.id === conn.to_note_id);
                                if (!de || !para) return null;
                                const centroDe = { x: de.pos_x + de.width / 2, y: de.pos_y + de.height / 2 };
                                const centroPara = { x: para.pos_x + para.width / 2, y: para.pos_y + para.height / 2 };
                                const p1 = pontoNaBorda(de, centroPara.x, centroPara.y);
                                const p2 = pontoNaBorda(para, centroDe.x, centroDe.y);
                                return (
                                    <line
                                        key={conn.id}
                                        x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                                        className={TRACO[conn.color].stroke}
                                        strokeWidth={2}
                                        markerEnd={`url(#seta-${conn.color})`}
                                        style={{ pointerEvents: ferramenta === 'select' ? 'stroke' : 'none', cursor: ferramenta === 'select' ? 'pointer' : undefined }}
                                        onClick={() => ferramenta === 'select' && setPendente({ tipo: 'connection', id: conn.id })}
                                    />
                                );
                            })}

                            {board.drawings.map(d => {
                                const selecionado = drawingsSelecionados.has(d.id);
                                const clicar = () => {
                                    if (ferramenta !== 'select') return;
                                    setDrawingsSelecionados(prev => {
                                        // clicar no já-selecionado desmarca; clicar em outro troca a seleção
                                        if (prev.has(d.id) && prev.size === 1) return new Set<string>();
                                        return new Set([d.id]);
                                    });
                                    setNotasSelecionadas(new Set());
                                };
                                const pontosSvg = d.points.map(p => `${p.x},${p.y}`).join(' ');
                                return (
                                    <g key={d.id}>
                                        {/* Halo por trás do traço real quando selecionado — nao intercepta clique. */}
                                        {selecionado && (d.kind === 'pen' ? (
                                            <polyline points={pontosSvg} className="stroke-amber-400/70 fill-none" strokeWidth={d.stroke_width + 6} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                                        ) : (
                                            <line x1={d.points[0].x} y1={d.points[0].y} x2={d.points[1].x} y2={d.points[1].y} className="stroke-amber-400/70" strokeWidth={d.stroke_width + 6} style={{ pointerEvents: 'none' }} />
                                        ))}
                                        {d.kind === 'pen' ? (
                                            <polyline
                                                points={pontosSvg}
                                                className={`${TRACO[d.color].stroke} fill-none`}
                                                strokeWidth={d.stroke_width}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                style={{ pointerEvents: ferramenta === 'select' ? 'stroke' : 'none', cursor: ferramenta === 'select' ? 'pointer' : undefined }}
                                                onClick={clicar}
                                            />
                                        ) : (
                                            <line
                                                x1={d.points[0].x} y1={d.points[0].y} x2={d.points[1].x} y2={d.points[1].y}
                                                className={TRACO[d.color].stroke}
                                                strokeWidth={d.stroke_width}
                                                markerEnd={`url(#seta-${d.color})`}
                                                style={{ pointerEvents: ferramenta === 'select' ? 'stroke' : 'none', cursor: ferramenta === 'select' ? 'pointer' : undefined }}
                                                onClick={clicar}
                                            />
                                        )}
                                    </g>
                                );
                            })}

                            {previewPontos && previewPontos.length > 0 && (
                                desenhoAtual.current?.tipo === 'arrow' && previewPontos.length === 2 ? (
                                    <line
                                        x1={previewPontos[0].x} y1={previewPontos[0].y} x2={previewPontos[1].x} y2={previewPontos[1].y}
                                        className={TRACO[corTraco].stroke} strokeWidth={2.5} strokeDasharray="4 3" markerEnd={`url(#seta-${corTraco})`}
                                    />
                                ) : (
                                    <polyline
                                        points={previewPontos.map(p => `${p.x},${p.y}`).join(' ')}
                                        className={`${TRACO[corTraco].stroke} fill-none`}
                                        strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                                    />
                                )
                            )}
                        </svg>

                        {/* Retângulo de seleção — só existe enquanto o usuário arrasta no fundo do quadro. */}
                        {retanguloSelecao && (
                            <div
                                className="absolute border-2 border-amber-400 bg-amber-400/10 pointer-events-none"
                                // camada-local: acima de qualquer nota, pelo mesmo motivo acima.
                                style={{ left: retanguloSelecao.x, top: retanguloSelecao.y, width: retanguloSelecao.width, height: retanguloSelecao.height, zIndex: 200000 }}
                            />
                        )}
                    </div>
                )}
            </div>

            <ConfirmDialog
                isOpen={!!pendente}
                title={tituloExclusao}
                message={mensagemExclusao}
                variant="danger"
                confirmLabel="Apagar"
                isLoading={apagando}
                onConfirm={confirmarExclusao}
                onCancel={() => setPendente(null)}
            />
        </div>
    );
}

function BotaoFerramenta({ ativo, onClick, titulo, icone }: { ativo: boolean; onClick: () => void; titulo: string; icone: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            title={titulo}
            aria-label={titulo}
            className={`${ativo ? BOTAO_PRINCIPAL : BOTAO_SECUNDARIO} w-10 px-0`}
        >
            {icone}
        </button>
    );
}
