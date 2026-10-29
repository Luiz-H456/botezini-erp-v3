import { test } from 'node:test';
import assert from 'node:assert/strict';
import { situacaoDaConta, diasDeAtraso, quandoVence } from './situacao.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: 'x', type: 'receivable', description: 'conta', due_date: HOJE,
    original_amount: 100, remaining_amount: 100, derived_status: 'open', ...c,
});

test('cancelada e paga vêm antes de tudo', () => {
    assert.equal(situacaoDaConta(conta({ derived_status: 'cancelled', awaiting_delivery: true }), HOJE), 'cancelada');
    assert.equal(situacaoDaConta(conta({ derived_status: 'paid', remaining_amount: 0 }), HOJE), 'paga');
    assert.equal(situacaoDaConta(conta({ derived_status: 'partial', remaining_amount: 0 }), HOJE), 'paga');
});

test('a receber de pedido não entregue aguarda entrega mesmo vencida', () => {
    assert.equal(situacaoDaConta(conta({ due_date: '2026-09-01', awaiting_delivery: true }), HOJE), 'aguardando_entrega');
});

test('awaiting_delivery numa conta a pagar não muda nada', () => {
    assert.equal(situacaoDaConta(conta({ type: 'payable', due_date: '2026-09-01', awaiting_delivery: true }), HOJE), 'vencida');
});

test('paga em parte e vencida é vencida; vence hoje é a vencer', () => {
    assert.equal(situacaoDaConta(conta({ derived_status: 'partial', due_date: '2026-10-01', remaining_amount: 40 }), HOJE), 'vencida');
    assert.equal(situacaoDaConta(conta({ due_date: HOJE }), HOJE), 'a_vencer');
});

test('dias de atraso nunca é negativo', () => {
    assert.equal(diasDeAtraso(conta({ due_date: '2026-09-24' }), HOJE), 12);
    assert.equal(diasDeAtraso(conta({ due_date: '2026-10-20' }), HOJE), 0);
});

test('quando vence: o texto relativo sempre traz a data original junto', () => {
    const c = (due_date: string) => conta({ due_date });
    const dia = '2026-10-29';
    assert.equal(quandoVence(c('2026-10-24'), dia), '24/10 · 5 dia(s) de atraso');
    assert.equal(quandoVence(c('2026-10-29'), dia), 'hoje · 29/10');
    assert.equal(quandoVence(c('2026-10-31'), dia), '31/10 · em 2 dia(s)');
    assert.equal(quandoVence(c('2026-11-20'), dia), '20/11');
    assert.equal(quandoVence(c('2025-12-20'), dia), '20/12/2025 · 313 dia(s) de atraso');
    assert.equal(quandoVence(c('2027-01-05'), dia), '05/01/2027');
});
