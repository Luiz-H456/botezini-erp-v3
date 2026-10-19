/**
 * Vínculo entre uma conta a pagar e o pedido a que ela se refere.
 *
 * É o único critério de custo por projeto desde que o casamento por client_id
 * foi removido — ele jogava toda despesa do cliente em cada um dos seus pedidos,
 * contando o mesmo valor várias vezes.
 *
 * Puro de propósito — sem imports — para poder ser testado direto.
 */

/**
 * Verdadeiro quando o número da OS aparece em `texto` como número inteiro.
 *
 * Por limite de dígito, não por substring: `includes('1')` casaria com "10",
 * "21" e "100", e um falso positivo aqui entra direto no custo do pedido errado.
 * Aceita as formas usuais de escrita — "OS 12", "OS-12", "#12", "ref 12".
 */
export function contaPertenceAoPedido(
    texto: string | null | undefined,
    orderNumber: string | null | undefined,
): boolean {
    if (!texto || orderNumber == null) return false;
    const alvo = String(orderNumber).trim();
    if (!alvo) return false;
    const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\D)${escapado}(\\D|$)`).test(texto);
}
