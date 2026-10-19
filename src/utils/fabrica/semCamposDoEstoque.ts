/**
 * Tira do cadastro o que só os movimentos de estoque podem escrever: saldo e custo médio.
 *
 * O formulário de edição copia o insumo ao abrir. Se uma compra, sobra ou uso do estoque
 * mexer no saldo enquanto ele está aberto, salvar um renome devolveria o saldo antigo
 * sem nenhum movimento. Na edição, o payload não leva esses campos.
 */
export function semCamposDoEstoque<T extends object>(payload: T): Omit<T, 'current_stock' | 'average_unit_cost'> {
    const { current_stock: _saldo, average_unit_cost: _custo, ...resto } = payload as T & { current_stock?: unknown; average_unit_cost?: unknown };
    return resto;
}
