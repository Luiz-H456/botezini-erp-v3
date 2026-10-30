/**
 * O que impede salvar o orçamento, tudo de uma vez (auditoria de 29/10, R2).
 *
 * Antes a tela avisava uma falta por vez numa janela "Atenção" — corrigir uma revelava a
 * próxima. Agora a lista inteira aparece no topo do editor e o campo do cliente fica marcado.
 * Sem import do app.
 */
export interface FaltaNoOrcamento { campo: 'cliente' | 'itens' | 'linha'; texto: string; linha?: number }

export function faltasDoOrcamento(o: {
    clienteId: string | null | undefined;
    itens: { product_id?: string | null; product_name?: string | null; quantity?: number | null }[];
    servicos: unknown[];
}): FaltaNoOrcamento[] {
    const faltas: FaltaNoOrcamento[] = [];
    if (!o.clienteId) faltas.push({ campo: 'cliente', texto: 'Escolha o cliente' });
    if (o.itens.length === 0 && o.servicos.length === 0) faltas.push({ campo: 'itens', texto: 'Adicione ao menos um item ou serviço' });
    o.itens.forEach((it, i) => {
        if (!it.product_id && !(it.product_name || '').trim()) faltas.push({ campo: 'linha', linha: i + 1, texto: `Linha ${i + 1}: escolha o produto` });
        else if (!(Number(it.quantity) > 0)) faltas.push({ campo: 'linha', linha: i + 1, texto: `Linha ${i + 1}: quantidade zerada` });
    });
    return faltas;
}
