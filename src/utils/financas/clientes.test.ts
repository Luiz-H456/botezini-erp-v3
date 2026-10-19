import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientesQueDevem, parcelasParaReceber } from './clientes.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
let n = 0;
const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: `k${++n}`, type: 'receivable', description: 'c', due_date: HOJE,
    original_amount: 1, remaining_amount: 1, derived_status: 'open', ...c,
});

test('agrupa por cliente, separa em produção e ordena pelo atraso mais antigo', () => {
    const linhas = clientesQueDevem([
        conta({ client_id: 'c1', due_date: '2026-09-24', remaining_amount: 9600 }),
        conta({ client_id: 'c1', due_date: '2026-10-20', remaining_amount: 4800 }),
        conta({ client_id: 'c2', due_date: '2026-10-01', remaining_amount: 4200 }),
        conta({ client_id: 'c2', remaining_amount: 6200, awaiting_delivery: true }),
        conta({ client_id: 'c3', remaining_amount: 12400, awaiting_delivery: true }),
        conta({ client_id: 'c3', due_date: '2026-11-01', remaining_amount: 7500 }),
        conta({ client_id: null, due_date: '2026-09-01', remaining_amount: 100 }),
        conta({ client_id: 'c5', remaining_amount: 0, derived_status: 'paid' }),
        conta({ client_id: 'c6', type: 'payable', due_date: '2026-09-01' }),
    ], HOJE);
    assert.deepEqual(linhas.map(l => [l.clienteId, l.vencido, l.aVencer, l.emProducao, l.diasDoMaisAntigo]), [
        ['c1', 9600, 4800, 0, 12],
        ['c2', 4200, 0, 6200, 5],
        ['c3', 0, 7500, 12400, null],
    ]);
    assert.equal(linhas[0].vencidas.length, 1);
});

test('quantidade conta parcelas vencidas e a vencer, não as em produção, pagas ou canceladas', () => {
    const [l] = clientesQueDevem([
        conta({ client_id: 'c1', due_date: '2026-09-24' }),
        conta({ client_id: 'c1', due_date: '2026-09-30' }),
        conta({ client_id: 'c1', due_date: '2026-10-20' }),
        conta({ client_id: 'c1', awaiting_delivery: true }),
        conta({ client_id: 'c1', derived_status: 'paid', remaining_amount: 0 }),
        conta({ client_id: 'c1', derived_status: 'cancelled' }),
    ], HOJE);
    assert.equal(l.quantidade, 3);
});

test('parcelasParaReceber: só as em aberto e valendo do cliente, mais antiga primeiro', () => {
    const ok = parcelasParaReceber([
        conta({ id: 'b', client_id: 'c1', due_date: '2026-10-20' }),
        conta({ id: 'a', client_id: 'c1', due_date: '2026-09-24' }),
        conta({ id: 'x', client_id: 'c1', awaiting_delivery: true }),
        conta({ id: 'p', client_id: 'c1', remaining_amount: 0, derived_status: 'paid' }),
        conta({ id: 'o', client_id: 'c2' }),
        conta({ id: 'd', client_id: 'c1', type: 'payable' }),
    ], 'c1', HOJE);
    assert.deepEqual(ok.map(c => c.id), ['a', 'b']);
});
