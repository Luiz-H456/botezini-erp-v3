import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parecerDoMes, mesEmSaoPaulo } from './parecerDoMes.ts';
import { reais } from '../financas/base.ts';
import type { ContaResumo, PagamentoResumo } from '../financas/base.ts';

const conta = (o: Partial<ContaResumo> & { id: string }): ContaResumo => ({
    type: 'receivable', description: 'x', due_date: '2026-10-10', original_amount: 100, remaining_amount: 0,
    derived_status: 'paid', ...o,
});
const pag = (obligation_id: string, amount: number, payment_date: string): PagamentoResumo => ({ obligation_id, amount, payment_date });

const base = {
    orcamentos: [
        { id: 'b1', date: '2026-10-02', total_amount: 1000, status: 'Converted' },
        { id: 'b2', date: '2026-10-15', total_amount: 3000, status: 'Sent' },
        { id: 'b3', date: '2026-09-20', total_amount: 500, status: 'Converted' },
        { id: 'b4', date: '2026-10-31', total_amount: 600, status: 'Draft' },
    ],
    pedidos: [
        { id: 'p1', budget_id: 'b1', created_at: '2026-10-03T13:00:00+00:00', status: 'Em Produção', total_amount: 1000, delivered_at: null, items: [{ quantity: 10 }] },
        // 01/10 01:00 em UTC ainda é 30/09 em São Paulo: conta em setembro.
        { id: 'p2', budget_id: 'b3', created_at: '2026-10-01T01:00:00+00:00', status: 'Entregue', total_amount: 500, delivered_at: '2026-10-20', items: [{ quantity: 5 }] },
        { id: 'p3', budget_id: 'b9', created_at: '2026-10-28T12:00:00+00:00', status: 'Pendente', total_amount: 2000, delivered_at: null, items: [{ quantity: 20 }, { quantity: '4' }] },
    ],
    contas: [
        conta({ id: 'c1', original_amount: 400 }),
        conta({ id: 'c2', original_amount: 300 }),
        conta({ id: 'pg', type: 'payable', original_amount: 999 }),
        conta({ id: 'v1', due_date: '2026-10-01', remaining_amount: 250, derived_status: 'overdue', client_id: 'A' }),
        conta({ id: 'v2', due_date: '2026-10-05', remaining_amount: 100, derived_status: 'partial', client_id: 'A' }),
        conta({ id: 'v3', due_date: '2026-10-05', remaining_amount: 50, derived_status: 'overdue', client_id: 'B' }),
        // Vencida sem cliente: entra no total (igual ao Início), não na contagem de clientes a cobrar.
        conta({ id: 'v4', due_date: '2026-10-05', remaining_amount: 10, derived_status: 'overdue' }),
    ],
    pagamentos: [
        pag('c1', 400, '2026-10-05'),
        pag('c2', 300, '2026-09-28'),
        pag('pg', 999, '2026-10-06'),    // saída: não é recebimento
    ],
    dinheiro: reais,
};

test('mes do pedido e o de Sao Paulo, nao o do UTC', () => {
    assert.equal(mesEmSaoPaulo('2026-10-01T01:00:00+00:00'), '2026-09');
    assert.equal(mesEmSaoPaulo('2026-10-01T03:00:00+00:00'), '2026-10');
    assert.equal(mesEmSaoPaulo('2026-12-31'), '2026-12');          // dia puro: sem fuso
    assert.equal(mesEmSaoPaulo(null), '');
});

test('os quatro blocos do mes', () => {
    const p = parecerDoMes({ ...base, mes: '2026-10', hoje: '2026-10-16' });
    assert.deepEqual(p.orcamentos.atual, { quantidade: 3, valor: 4600, viraramPedido: 1 });
    assert.deepEqual(p.vendas.atual, { quantidade: 2, valor: 3000, pecas: 34 });          // p1 + p3; p2 é de setembro
    assert.deepEqual(p.entregas.atual, { quantidade: 1, valor: 500 });                     // pela data da entrega
    assert.equal(p.recebimentos.atual, 400);                                               // só a receber, só outubro
});

test('orcamento vira pedido pelo vinculo ou pelo status, mesmo que o pedido seja de outro mes', () => {
    const p = parecerDoMes({ ...base, mes: '2026-09', hoje: '2026-10-16' });
    assert.deepEqual(p.orcamentos.atual, { quantidade: 1, valor: 500, viraramPedido: 1 });
    const semStatus = parecerDoMes({
        ...base, mes: '2026-10', hoje: '2026-10-16',
        orcamentos: [{ id: 'b2', date: '2026-10-15', total_amount: 3000, status: 'Sent' }],
        pedidos: [{ id: 'p9', budget_id: 'b2', created_at: '2026-11-02T12:00:00+00:00', status: 'Pendente', total_amount: 3000, delivered_at: null, items: [] }],
    });
    assert.equal(semStatus.orcamentos.atual.viraramPedido, 1);
});

test('variacao contra o mes anterior; sem base, variacao nula', () => {
    const p = parecerDoMes({ ...base, mes: '2026-10', hoje: '2026-10-16' });
    assert.equal(p.vendas.anterior.valor, 500);                // setembro: p2
    assert.equal(p.vendas.variacao, 500);                       // 3000 vs 500 = +500%
    assert.equal(p.recebimentos.anterior, 300);
    const novembro = parecerDoMes({ ...base, mes: '2026-11', hoje: '2026-10-16' });
    assert.equal(novembro.vendas.variacao, -100);
    const agosto = parecerDoMes({ ...base, mes: '2026-08', hoje: '2026-10-16' });
    assert.equal(agosto.vendas.variacao, null);                 // 0 contra 0: não há base
});

test('mes sem movimento algum: zeros e uma frase so, sem inventar tendencia', () => {
    const p = parecerDoMes({ ...base, mes: '2025-01', hoje: '2026-10-16' });
    assert.deepEqual(p.vendas.atual, { quantidade: 0, valor: 0, pecas: 0 });
    assert.equal(p.frases.length, 1);
    assert.match(p.frases[0].texto, /Nenhum movimento/);
});

test('frases do mes: vendas com variacao, conversao, entregue x recebido', () => {
    const p = parecerDoMes({ ...base, mes: '2026-10', hoje: '2026-10-16' });
    const textos = p.frases.map(f => f.texto);
    assert.ok(textos.some(t => /Vendeu R\$ 3\.000,00 em 2 pedidos, 500% a mais que setembro/.test(t)), textos.join(' | '));
    assert.ok(textos.some(t => /De 3 orçamentos, 1 virou pedido \(33%\)/.test(t)), textos.join(' | '));
    assert.ok(textos.some(t => /Entregou R\$ 500,00 e recebeu R\$ 400,00/.test(t)), textos.join(' | '));
});

test('frase de queda vem marcada como alerta', () => {
    const p = parecerDoMes({ ...base, mes: '2026-11', hoje: '2026-10-16' });
    const venda = p.frases.find(f => /pedido/.test(f.texto) && /menos|Nenhum pedido/.test(f.texto));
    assert.ok(venda, p.frases.map(f => f.texto).join(' | '));
    assert.equal(venda!.alerta, true);
});

test('vencido a receber so aparece no mes corrente (e a foto de hoje), com clientes distintos', () => {
    const atual = parecerDoMes({ ...base, mes: '2026-10', hoje: '2026-10-16' });
    const vencido = atual.frases.find(f => /vencid/.test(f.texto));
    assert.ok(vencido);
    assert.match(vencido!.texto, /R\$ 410,00 a receber vencidos; 2 clientes para cobrar/);
    assert.equal(vencido!.alerta, true);
    const passado = parecerDoMes({ ...base, mes: '2026-09', hoje: '2026-10-16' });
    assert.equal(passado.frases.some(f => /vencid/.test(f.texto)), false);
});

test('valores passam pelo formatador recebido (para o modo de ocultar valores)', () => {
    const p = parecerDoMes({ ...base, mes: '2026-10', hoje: '2026-10-16', dinheiro: () => '•••' });
    assert.equal(p.frases.some(f => /R\$/.test(f.texto)), false);
});
