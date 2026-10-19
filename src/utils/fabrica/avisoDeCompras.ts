/** Aviso do Cronograma (spec S4 §4.3): só existe quando falta insumo; leitura falha ou carregando = null. */
export function avisoDeCompras(faltas: number | null): string | null {
    if (faltas === null || faltas <= 0) return null;
    return faltas === 1
        ? 'Falta 1 insumo para os pedidos em aberto'
        : `Faltam ${faltas} insumos para os pedidos em aberto`;
}
