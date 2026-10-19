/** Rótulo da origem de um movimento de estoque. Sem origem, ou origem desconhecida, é lançamento antigo. */
const ROTULOS: Record<string, string> = {
    compra: 'Compra',
    estorno_compra: 'Compra excluída',
    sobra: 'Sobra do pedido',
    uso_estoque: 'Usado no pedido',
    devolucao: 'Pedido excluído',
    ajuste: 'Ajuste de contagem',
    // Linhas da baixa automática antiga, que ainda existem no banco local.
    producao: 'Baixa antiga',
    manual: 'Lançamento antigo',
};

export function rotuloDaOrigem(origem?: string | null): string {
    return (origem && Object.hasOwn(ROTULOS, origem) ? ROTULOS[origem] : null) ?? 'Lançamento antigo';
}
