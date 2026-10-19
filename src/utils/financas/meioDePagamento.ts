/**
 * Meio de pagamento sugerido para "Já foi pago?".
 *
 * Função pura e sem imports do app: roda no `node --test`.
 */

export interface PagamentoDoMeio {
    obligation_id: string;
    method?: string | null;
    payment_date?: string | null;
    reversal_of?: string | null;
    reversed_at?: string | null;
}

/**
 * O meio mais usado nos pagamentos válidos das contas do cliente ou fornecedor.
 * Empate: fica o do pagamento mais recente. Sem histórico (ou sem nenhum meio
 * dentro de `permitidos`): `null`, e o campo fica vazio em vez de chutar.
 */
export function meioMaisUsado(
    pagamentos: PagamentoDoMeio[],
    contaPorId: Map<string, { client_id?: string | null; supplier_id?: string | null }>,
    parceiroId: string,
    permitidos?: readonly string[],
): string | null {
    if (!parceiroId) return null;
    const placar = new Map<string, { vezes: number; ultimo: string }>();
    for (const p of pagamentos) {
        if (p.reversal_of || p.reversed_at || !p.method) continue;
        if (permitidos && !permitidos.includes(p.method)) continue;
        const conta = contaPorId.get(p.obligation_id);
        if (!conta || (conta.client_id !== parceiroId && conta.supplier_id !== parceiroId)) continue;
        const atual = placar.get(p.method) ?? { vezes: 0, ultimo: '' };
        placar.set(p.method, { vezes: atual.vezes + 1, ultimo: (p.payment_date ?? '') > atual.ultimo ? (p.payment_date ?? '') : atual.ultimo });
    }
    let melhor: string | null = null;
    let m = { vezes: 0, ultimo: '' };
    for (const [meio, v] of placar) {
        if (v.vezes > m.vezes || (v.vezes === m.vezes && v.ultimo > m.ultimo)) { melhor = meio; m = v; }
    }
    return melhor;
}
