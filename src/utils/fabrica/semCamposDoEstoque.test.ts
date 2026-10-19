import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semCamposDoEstoque } from './semCamposDoEstoque.ts';

test('tira saldo e custo médio e preserva o resto', () => {
    const original = { id: 'a', name: 'Linha', min_stock: 3, current_stock: 40, average_unit_cost: 2.5 };
    assert.deepEqual(semCamposDoEstoque(original), { id: 'a', name: 'Linha', min_stock: 3 });
    assert.equal(original.current_stock, 40); // não altera o original
});

test('payload sem esses campos fica igual', () => {
    assert.deepEqual(semCamposDoEstoque({ name: 'x' }), { name: 'x' });
});
