import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desdeDaRecuperacao, diaDaEntrega, entreguesSemSobra, agruparFichas } from './recuperarSobra.ts';

test('janela de 90 dias', () => {
    assert.equal(desdeDaRecuperacao('2026-10-14'), '2026-07-16');
    assert.equal(desdeDaRecuperacao('2026-03-01', 1), '2026-02-28');
});

test('sem delivered_at usa updated_at', () => {
    assert.equal(diaDaEntrega({ id: 'a', delivered_at: null, updated_at: '2026-10-01T10:00:00Z' }), '2026-10-01');
    assert.equal(diaDaEntrega({ id: 'a', delivered_at: '2026-09-30', updated_at: '2026-10-01T10:00:00Z' }), '2026-09-30');
});

test('só entregue com vínculo, sem sobra apurada e na janela; mais recente primeiro', () => {
    const e = [
        { id: 'a', delivered_at: '2026-10-01' },
        { id: 'b', delivered_at: '2026-10-10' },
        { id: 'c', delivered_at: null, updated_at: '2026-10-05T00:00:00Z' },
        { id: 'd', delivered_at: '2026-10-09' },      // sem vínculo
        { id: 'e', delivered_at: '2026-10-08' },      // já apurada
        { id: 'f', delivered_at: '2026-01-01' },      // fora da janela
    ];
    const r = entreguesSemSobra(e, new Set(['a', 'b', 'c', 'e', 'f']), new Set(['e']), '2026-07-16');
    assert.deepEqual(r.map(o => o.id), ['b', 'c', 'a']);
});

test('produto sem linha na leitura que deu certo = sem ficha (lista vazia); com linha = a ficha', () => {
    const m = agruparFichas(['p1', 'p2'], [{ product_id: 'p1', insumo_id: 'x', quantity: 1 }]);
    assert.equal(m.get('p1')!.length, 1);
    assert.deepEqual(m.get('p2'), []);
    assert.equal(m.has('p3'), false);
});
