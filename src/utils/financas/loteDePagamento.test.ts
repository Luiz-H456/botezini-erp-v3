import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarLote } from './loteDePagamento.ts';
import type { ContaResumo } from './base.ts';

const c = (id: string, o: Partial<ContaResumo> = {}): ContaResumo => ({
    id, type: 'payable', description: id, due_date: '2026-10-05', original_amount: 100, remaining_amount: 100, derived_status: 'open', ...o,
});

test('lote: só contas abertas com saldo; paga e cancelada saem com o motivo', () => {
    const l = montarLote([c('a'), c('b', { derived_status: 'paid', remaining_amount: 0 }), c('x', { derived_status: 'cancelled' })], new Set(['a', 'b', 'x']));
    assert.deepEqual(l.aptas.map(x => x.id), ['a']);
    assert.deepEqual(l.ignoradas.map(i => [i.conta.id, i.motivo]), [['b', 'já paga'], ['x', 'cancelada']]);
});

test('lote: o total é o que falta pagar de cada uma (parcial conta o saldo)', () => {
    const l = montarLote([c('a', { remaining_amount: 40 }), c('b', { remaining_amount: 60.5 })], new Set(['a', 'b']));
    assert.equal(l.total, 100.5);
    assert.equal(l.tipo, 'payable');
});

test('lote: a pagar e a receber juntos não vão — cada um é uma baixa diferente', () => {
    const l = montarLote([c('a'), c('r', { type: 'receivable' })], new Set(['a', 'r']));
    assert.equal(l.tipo, 'misto');
});

test('lote vazio', () => {
    const l = montarLote([c('a')], new Set());
    assert.equal(l.tipo, null);
    assert.equal(l.total, 0);
});
