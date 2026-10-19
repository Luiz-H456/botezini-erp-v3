// Regras puras dos avisos operacionais que a fila do Início usa: pedidos atrasados,
// insumos abaixo do mínimo. Orçamentos parados vêm de filaDeFollowUp.
//
// Mínimo zero não é mínimo e prazo vazio não é atraso: aviso que se repete todo dia
// sem saída ensina a equipe a ignorar avisos.
//
// Sem imports do app, para ser testado direto com `node --test`.

export interface PedidoParaAlerta {
    id: string;
    order_number?: string | null;
    deadline?: string | null;
    status?: string | null;
}

export interface InsumoParaAlerta {
    id: string;
    name?: string | null;
    current_stock?: number | null;
    min_stock?: number | null;
}

/** Status de pedido que significam "já saiu daqui". */
const ENCERRADOS = new Set(['Entregue', 'Concluído', 'Concluido', 'Cancelado']);

/** Dias inteiros entre duas datas ISO. Negativo quando `ate` já passou. */
export function diasAte(de: string, ate: string): number {
    if (!de || !ate) return 0;
    const a = Date.parse(`${de}T00:00:00Z`);
    const b = Date.parse(`${ate}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.round((b - a) / 86400000);
}

/** Pedidos que passaram do prazo e ainda não saíram. */
export function pedidosAtrasados(
    pedidos: PedidoParaAlerta[] | null | undefined,
    hoje: string,
): PedidoParaAlerta[] {
    return (pedidos || [])
        .filter(p => !!p.deadline && !ENCERRADOS.has((p.status || '').trim()))
        .filter(p => diasAte(hoje, p.deadline!) < 0)
        .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
}

/**
 * Insumos abaixo do mínimo — na regra do próprio Estoque (saldo <= mínimo), para
 * a contagem bater com as marcas em rosa de lá.
 *
 * Mínimo zero não é mínimo: é "ninguém definiu". Alertar sobre saldo zero num
 * insumo sem mínimo cadastrado encheria a tela de avisos que ninguém pediu — e
 * o que falta ali é o cadastro, que já tem lugar próprio na Completude.
 */
export function insumosAbaixoDoMinimo(
    insumos: InsumoParaAlerta[] | null | undefined,
): InsumoParaAlerta[] {
    return (insumos || [])
        .filter(i => Number(i.min_stock) > 0 && Number(i.current_stock) <= Number(i.min_stock))
        .sort((a, b) =>
            (Number(a.current_stock) / Number(a.min_stock)) -
            (Number(b.current_stock) / Number(b.min_stock)));
}
