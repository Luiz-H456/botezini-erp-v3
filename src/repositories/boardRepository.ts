import { supabase } from '@/services/supabase';
import { BoardNote, BoardNoteColor, BoardConnection, BoardDrawing, BoardDrawingKind, BoardPoint } from '@/types/board';

/**
 * Quadro de notas pessoal. RLS filtra por auth.uid() no banco — aqui não há
 * checagem de dono nas queries porque a política já garante que cada usuário
 * só enxerga e só edita as próprias notas.
 */
export class BoardRepository {
    async getNotes(): Promise<BoardNote[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('board_notes').select('*');
        if (error) { console.error('getNotes:', error); return []; }
        return (data || []).map(this.map);
    }

    async createNote(note: {
        content: string; color: BoardNoteColor;
        pos_x: number; pos_y: number; width: number; height: number; z_index: number;
    }): Promise<BoardNote> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabase
            .from('board_notes')
            .insert({ ...note, user_id: user.id })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return this.map(data);
    }

    /** Conteúdo e cor — chamado ao editar o texto ou trocar a cor. */
    async updateContent(id: string, patch: Partial<Pick<BoardNote, 'content' | 'color' | 'is_done'>>): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('board_notes').update(patch).eq('id', id);
        if (error) throw new Error(error.message);
    }

    /**
     * Posição/tamanho/camada — chamado ao final de um arraste ou redimensionamento.
     * Separado de updateContent para o gesto de mover não competir com o de
     * digitar: são eventos diferentes, disparados em momentos diferentes.
     */
    async updateGeometry(id: string, patch: Partial<Pick<BoardNote, 'pos_x' | 'pos_y' | 'width' | 'height' | 'z_index'>>): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('board_notes').update(patch).eq('id', id);
        if (error) throw new Error(error.message);
    }

    async deleteNote(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('board_notes').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    // ── LIGAÇÕES ENTRE NOTAS ────────────────────────────────────────────────

    async getConnections(): Promise<BoardConnection[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('board_connections').select('*');
        if (error) { console.error('getConnections:', error); return []; }
        return (data || []).map(this.mapConnection);
    }

    async createConnection(from_note_id: string, to_note_id: string, color: BoardNoteColor): Promise<BoardConnection> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabase
            .from('board_connections')
            .insert({ from_note_id, to_note_id, color, user_id: user.id })
            .select()
            .single();
        if (error) {
            // 23505 = unique_violation — já existe essa ligação exata.
            if (error.code === '23505') throw new Error('Essas notas já estão ligadas.');
            throw new Error(error.message);
        }
        return this.mapConnection(data);
    }

    async deleteConnection(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('board_connections').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    // ── DESENHO LIVRE (caneta / seta) ────────────────────────────────────────

    async getDrawings(): Promise<BoardDrawing[]> {
        if (!supabase) return [];
        const { data, error } = await supabase.from('board_drawings').select('*');
        if (error) { console.error('getDrawings:', error); return []; }
        return (data || []).map(this.mapDrawing);
    }

    async createDrawing(drawing: {
        kind: BoardDrawingKind; points: BoardPoint[]; color: BoardNoteColor; stroke_width: number;
    }): Promise<BoardDrawing> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabase
            .from('board_drawings')
            .insert({ ...drawing, user_id: user.id })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return this.mapDrawing(data);
    }

    async deleteDrawing(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.from('board_drawings').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    private mapConnection(r: any): BoardConnection {
        return {
            id: r.id,
            user_id: r.user_id,
            from_note_id: r.from_note_id,
            to_note_id: r.to_note_id,
            color: r.color ?? 'zinc',
            created_at: r.created_at,
        };
    }

    private mapDrawing(r: any): BoardDrawing {
        return {
            id: r.id,
            user_id: r.user_id,
            kind: r.kind,
            points: Array.isArray(r.points) ? r.points : [],
            color: r.color ?? 'zinc',
            stroke_width: Number(r.stroke_width) || 2.5,
            created_at: r.created_at,
        };
    }

    private map(r: any): BoardNote {
        return {
            id: r.id,
            user_id: r.user_id,
            content: r.content ?? '',
            color: r.color ?? 'amber',
            pos_x: Number(r.pos_x) || 0,
            pos_y: Number(r.pos_y) || 0,
            width: Number(r.width) || 240,
            height: Number(r.height) || 220,
            z_index: Number(r.z_index) || 1,
            is_done: !!r.is_done,
            created_at: r.created_at,
            updated_at: r.updated_at,
        };
    }
}

export const boardRepository = new BoardRepository();
