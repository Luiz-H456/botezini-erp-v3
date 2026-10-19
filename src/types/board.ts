import { DbEntity } from './index';

export type BoardNoteColor = 'amber' | 'emerald' | 'sky' | 'rose' | 'violet' | 'zinc';

/** Única fonte da paleta — usada tanto para notas quanto para traços/ligações. */
export const BOARD_COLORS: readonly BoardNoteColor[] = ['amber', 'emerald', 'sky', 'rose', 'violet', 'zinc'];

/** Nota do quadro pessoal — conteúdo livre, posição e tamanho livres. */
export interface BoardNote extends DbEntity {
    content: string;
    color: BoardNoteColor;
    pos_x: number;
    pos_y: number;
    width: number;
    height: number;
    z_index: number;
    is_done: boolean;
}

/**
 * Ligação ancorada entre duas notas (tipo linha de fluxograma). Sem
 * coordenadas próprias — a posição é recalculada a partir da posição atual
 * das notas, então a linha acompanha sozinha quando uma nota se move.
 */
export interface BoardConnection extends DbEntity {
    from_note_id: string;
    to_note_id: string;
    color: BoardNoteColor;
}

export type BoardDrawingKind = 'pen' | 'arrow';

export interface BoardPoint {
    x: number;
    y: number;
}

/** Traço livre no canvas: caneta (muitos pontos) ou seta avulsa (2 pontos). */
export interface BoardDrawing extends DbEntity {
    kind: BoardDrawingKind;
    points: BoardPoint[];
    color: BoardNoteColor;
    stroke_width: number;
}
