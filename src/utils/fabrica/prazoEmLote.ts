/**
 * Nova data de entrega para vários pedidos atrasados de uma vez (auditoria de 29/10, R4): o Início
 * pede "Destravar 17 pedidos", e no Quadro era um por um. Sem import do app.
 */
export function atrasadosDoQuadro<T extends { deadline?: string | null }>(cards: T[], hoje: string): T[] {
    return cards.filter(c => !!c.deadline && c.deadline < hoje).sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
}

export function erroDaNovaData(data: string, hoje: string): string | null {
    if (!data) return 'Escolha a nova data de entrega';
    if (data < hoje) return 'A nova data não pode ser antes de hoje';
    return null;
}
