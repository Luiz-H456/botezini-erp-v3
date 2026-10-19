export interface PedidoParaAnalise { client_id: string; total_amount: number; items: { product_id: string; quantity: number }[] }

export function analiseDeProdutos(e: {
    pedidos: PedidoParaAnalise[]; produtos: { id: string; name: string }[]; clientes: { id: string; company_name: string }[];
}) {
    const qtd = new Map(e.produtos.map(p => [p.id, { id: p.id, nome: p.name, qtd: 0 }]));
    const porCliente = new Map<string, { id: string; nome: string; receita: number; pedidos: number }>();
    const nomeDoCliente = new Map(e.clientes.map(c => [c.id, c.company_name]));
    for (const p of e.pedidos) {
        for (const it of p.items || []) { const x = qtd.get(it.product_id); if (x) x.qtd += Number(it.quantity) || 0; }
        const c = porCliente.get(p.client_id) ?? { id: p.client_id, nome: nomeDoCliente.get(p.client_id) || 'Cliente', receita: 0, pedidos: 0 };
        c.receita += Number(p.total_amount) || 0; c.pedidos += 1; porCliente.set(p.client_id, c);
    }
    const todos = [...qtd.values()];
    return {
        topProdutos: [...todos].sort((a, b) => b.qtd - a.qtd).slice(0, 8),
        parados: todos.filter(p => p.qtd < 5).sort((a, b) => a.qtd - b.qtd).slice(0, 6),
        topClientes: [...porCliente.values()].sort((a, b) => b.receita - a.receita).slice(0, 5),
    };
}
