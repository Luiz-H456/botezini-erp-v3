import { useState, useEffect, useCallback, useRef } from 'react';
import { storageService } from '@/services/storage';
import { BoardNote, BoardNoteColor, BoardConnection, BoardDrawing, BoardDrawingKind, BoardPoint, BOARD_COLORS } from '@/types/board';
import { proximaPosicaoCascata, proximoZIndex, clamp, corAleatoria } from '@/utils/board';
import { useCargaProgressiva } from '../useCargaProgressiva';

import { mensagemDeErro } from '@/utils/errorHandling';
const LARGURA_NOTA_PADRAO = 240;
const ALTURA_NOTA_PADRAO = 220;
const LARGURA_MINIMA = 140;
const ALTURA_MINIMA = 100;
const DEBOUNCE_MS = 700;

/**
 * Quadro de notas pessoal.
 *
 * Geometria (arrastar/redimensionar) e conteúdo (digitar) atualizam o estado
 * local IMEDIATAMENTE — a tela responde no mesmo frame — e persistem no banco
 * com debounce próprio por nota. Sem isso, cada pixel de arraste ou cada tecla
 * digitada viraria uma chamada de rede.
 *
 * Ligações e traços de desenho não têm debounce: nascem prontos num único
 * gesto (soltar o mouse), então uma chamada de rede por criação já é o mínimo.
 */
export function useBoard() {
    const [notes, setNotes] = useState<BoardNote[]>([]);
    const [connections, setConnections] = useState<BoardConnection[]>([]);
    const [drawings, setDrawings] = useState<BoardDrawing[]>([]);
    const carga = useCargaProgressiva();
    const [error, setError] = useState('');

    // Um timer de debounce por nota, para editar duas notas ao mesmo tempo não
    // fazer uma cancelar o salvamento da outra.
    const timersConteudo = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const timersGeometria = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const load = useCallback(async () => {
        carga.iniciar();
        setError('');
        try {
            const [n, c, d] = await Promise.all([
                storageService.getBoardNotes(),
                storageService.getBoardConnections(),
                storageService.getBoardDrawings(),
            ]);
            setNotes(n);
            setConnections(c);
            setDrawings(d);
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao carregar o quadro'));
        } finally {
            carga.terminar();
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Ref espelhando o estado, para o cleanup abaixo ler o valor mais recente
    // sem precisar recriar o efeito a cada mudança de nota.
    const notesRef = useRef<BoardNote[]>([]);
    notesRef.current = notes;

    // Ao desmontar (trocar de página), qualquer edição pendente é salva na
    // hora — senão a última tecla digitada antes de sair se perderia.
    useEffect(() => () => {
        for (const [id, t] of timersConteudo.current) {
            clearTimeout(t);
            const nota = notesRef.current.find(n => n.id === id);
            if (nota) storageService.updateBoardNoteContent(id, { content: nota.content, color: nota.color, is_done: nota.is_done }).catch(() => {});
        }
        for (const [id, t] of timersGeometria.current) {
            clearTimeout(t);
            const nota = notesRef.current.find(n => n.id === id);
            if (nota) storageService.updateBoardNoteGeometry(id, {
                pos_x: nota.pos_x, pos_y: nota.pos_y, width: nota.width, height: nota.height, z_index: nota.z_index,
            }).catch(() => {});
        }
    }, []);

    const addNote = useCallback(async (scrollX: number, scrollY: number, color?: BoardNoteColor) => {
        setError('');
        const { pos_x, pos_y } = proximaPosicaoCascata(notesRef.current.length, scrollX, scrollY);
        const z_index = proximoZIndex(notesRef.current);
        try {
            const criada = await storageService.createBoardNote({
                content: '', color: color ?? corAleatoria(BOARD_COLORS), pos_x, pos_y,
                width: LARGURA_NOTA_PADRAO, height: ALTURA_NOTA_PADRAO, z_index,
            });
            setNotes(prev => [...prev, criada]);
            return criada;
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao criar nota'));
            throw e;
        }
    }, []);

    /** Debounce por chave (nota) — evita uma chamada de rede por pixel/tecla. */
    const agendar = (
        timers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>,
        id: string,
        persistir: () => Promise<void>,
    ) => {
        const existente = timers.current.get(id);
        if (existente) clearTimeout(existente);
        timers.current.set(id, setTimeout(() => {
            timers.current.delete(id);
            persistir().catch((e: any) => setError(mensagemDeErro(e, 'Falha ao salvar')));
        }, DEBOUNCE_MS));
    };

    const updateContent = useCallback((id: string, content: string) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));
        agendar(timersConteudo, id, () => {
            const nota = notesRef.current.find(n => n.id === id);
            if (!nota) return Promise.resolve();
            return storageService.updateBoardNoteContent(id, { content: nota.content });
        });
    }, []);

    const updateColor = useCallback(async (id: string, color: BoardNoteColor) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, color } : n));
        try { await storageService.updateBoardNoteContent(id, { color }); }
        catch (e: any) { setError(mensagemDeErro(e, 'Falha ao salvar cor')); }
    }, []);

    const toggleDone = useCallback(async (id: string) => {
        const nota = notesRef.current.find(n => n.id === id);
        if (!nota) return;
        const is_done = !nota.is_done;
        setNotes(prev => prev.map(n => n.id === id ? { ...n, is_done } : n));
        try { await storageService.updateBoardNoteContent(id, { is_done }); }
        catch (e: any) { setError(mensagemDeErro(e, 'Falha ao salvar')); }
    }, []);

    /** Move/redimensiona localmente sem gravar — chamado a cada pixel do gesto. */
    const moveLocal = useCallback((id: string, patch: Partial<Pick<BoardNote, 'pos_x' | 'pos_y' | 'width' | 'height'>>) => {
        setNotes(prev => prev.map(n => n.id === id ? {
            ...n,
            pos_x: patch.pos_x != null ? clamp(patch.pos_x, 0) : n.pos_x,
            pos_y: patch.pos_y != null ? clamp(patch.pos_y, 0) : n.pos_y,
            width: patch.width != null ? clamp(patch.width, LARGURA_MINIMA) : n.width,
            height: patch.height != null ? clamp(patch.height, ALTURA_MINIMA) : n.height,
        } : n));
    }, []);

    /** Fim do gesto (soltar o mouse) — agenda a gravação da geometria. */
    const commitGeometry = useCallback((id: string) => {
        agendar(timersGeometria, id, () => {
            const nota = notesRef.current.find(n => n.id === id);
            if (!nota) return Promise.resolve();
            return storageService.updateBoardNoteGeometry(id, {
                pos_x: nota.pos_x, pos_y: nota.pos_y, width: nota.width, height: nota.height,
            });
        });
    }, []);

    const bringToFront = useCallback(async (id: string) => {
        const z_index = proximoZIndex(notesRef.current);
        setNotes(prev => prev.map(n => n.id === id ? { ...n, z_index } : n));
        try { await storageService.updateBoardNoteGeometry(id, { z_index }); }
        catch { /* trazer para frente é cosmético; falha aqui não precisa alarmar o usuário */ }
    }, []);

    const deleteNote = useCallback(async (id: string) => {
        const anterior = notesRef.current;
        setNotes(prev => prev.filter(n => n.id !== id));
        // Ligações da nota apagada caem junto no banco (ON DELETE CASCADE);
        // aqui só tiramos do estado local para a tela acompanhar na hora.
        setConnections(prev => prev.filter(c => c.from_note_id !== id && c.to_note_id !== id));
        try { await storageService.deleteBoardNote(id); }
        catch (e: any) {
            setNotes(anterior); // desfaz se o servidor recusar
            setError(mensagemDeErro(e, 'Falha ao apagar nota'));
        }
    }, []);

    // ── LIGAÇÕES ENTRE NOTAS ─────────────────────────────────────────────────

    const createConnection = useCallback(async (fromId: string, toId: string, color: BoardNoteColor) => {
        try {
            const criada = await storageService.createBoardConnection(fromId, toId, color);
            setConnections(prev => [...prev, criada]);
            return criada;
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao ligar notas'));
            throw e;
        }
    }, []);

    const deleteConnection = useCallback(async (id: string) => {
        const anterior = connections;
        setConnections(prev => prev.filter(c => c.id !== id));
        try { await storageService.deleteBoardConnection(id); }
        catch (e: any) {
            setConnections(anterior);
            setError(mensagemDeErro(e, 'Falha ao apagar ligação'));
        }
    }, [connections]);

    // ── DESENHO LIVRE (caneta / seta) ────────────────────────────────────────

    const createDrawing = useCallback(async (kind: BoardDrawingKind, points: BoardPoint[], color: BoardNoteColor, stroke_width: number) => {
        try {
            const criado = await storageService.createBoardDrawing({ kind, points, color, stroke_width });
            setDrawings(prev => [...prev, criado]);
            return criado;
        } catch (e: any) {
            setError(mensagemDeErro(e, 'Falha ao salvar o traço'));
            throw e;
        }
    }, []);

    const deleteDrawing = useCallback(async (id: string) => {
        const anterior = drawings;
        setDrawings(prev => prev.filter(d => d.id !== id));
        try { await storageService.deleteBoardDrawing(id); }
        catch (e: any) {
            setDrawings(anterior);
            setError(mensagemDeErro(e, 'Falha ao apagar traço'));
        }
    }, [drawings]);

    return {
        notes, connections, drawings, error, reload: load,
        loading: carga.carregando, recarregando: carga.recarregando,
        addNote, updateContent, updateColor, toggleDone,
        moveLocal, commitGeometry, bringToFront, deleteNote,
        createConnection, deleteConnection,
        createDrawing, deleteDrawing,
    };
}
