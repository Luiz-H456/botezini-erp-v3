import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDeCompras } from './avisoDeCompras.ts';

test('sem leitura, ou sem falta, não há aviso', () => {
    assert.equal(avisoDeCompras(null), null);
    assert.equal(avisoDeCompras(0), null);
});

test('singular e plural', () => {
    assert.equal(avisoDeCompras(1), 'Falta 1 insumo para os pedidos em aberto');
    assert.equal(avisoDeCompras(3), 'Faltam 3 insumos para os pedidos em aberto');
});
