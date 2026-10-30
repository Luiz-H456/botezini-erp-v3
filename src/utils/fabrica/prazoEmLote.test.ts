import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atrasadosDoQuadro, erroDaNovaData } from './prazoEmLote.ts';

const card = (id: string, deadline: string | null) => ({ id, order_number: id, deadline });

test('atrasados: prazo antes de hoje, do mais antigo ao mais novo; sem prazo e em dia ficam fora', () => {
    const r = atrasadosDoQuadro([card('a', '2026-10-01'), card('b', null), card('c', '2026-08-20'), card('d', '2026-10-29'), card('e', '2026-11-05')], '2026-10-29');
    assert.deepEqual(r.map(x => x.id), ['c', 'a']);
});

test('nova data: obrigatória, não pode ser no passado', () => {
    assert.equal(erroDaNovaData('', '2026-10-29'), 'Escolha a nova data de entrega');
    assert.equal(erroDaNovaData('2026-10-28', '2026-10-29'), 'A nova data não pode ser antes de hoje');
    assert.equal(erroDaNovaData('2026-10-29', '2026-10-29'), null);
});
