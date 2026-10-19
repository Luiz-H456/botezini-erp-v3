import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vendasDoPeriodo } from './vendas.ts';
import type { ContaResumo } from './base.ts';

const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: 'x', type: 'receivable', description: 'c', due_date: '2026-09-01',
    original_amount: 800, remaining_amount: 500, derived_status: 'partial', ...c,
});

test('vendas contam pelo mês da entrega; antecipado é o já pago de pedido não entregue', () => {
    const r = vendasDoPeriodo({
        meses: ['2026-09'],
        pedidos: [
            { id: 'o1', status: 'Entregue', delivered_at: '2026-09-10', total_amount: 1000, items: [{ quantity: 10 }, { quantity: '5' }] },
            { id: 'o2', status: 'Entregue', delivered_at: '2026-10-01', total_amount: 500, items: [] },
            { id: 'o3', status: 'Em Produção', delivered_at: null, total_amount: 800 },
        ],
        contas: [
            conta({ awaiting_delivery: true }),
            conta({ id: 'y', awaiting_delivery: true, derived_status: 'cancelled' }),
            conta({ id: 'z', awaiting_delivery: false }),
        ],
    });
    assert.deepEqual(r, { pedidos: 1, pecas: 15, vendido: 1000, recebidoAntecipado: 300 });
});

test('antecipado inclui a entrada já paga, que não espera mais a entrega (pedido_em_aberto)', () => {
    const r = vendasDoPeriodo({
        meses: ['2026-09'],
        pedidos: [],
        contas: [
            conta({ id: 'entrada', awaiting_delivery: false, pedido_em_aberto: true }),
            conta({ id: 'saldo', awaiting_delivery: true, pedido_em_aberto: true }),
            conta({ id: 'entregue', awaiting_delivery: false, pedido_em_aberto: false }),
        ],
    });
    assert.equal(r.recebidoAntecipado, 600);
});
