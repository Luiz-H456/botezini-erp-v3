import test from 'node:test';
import assert from 'node:assert';
import { contaPertenceAoPedido } from './orderCostMatch.ts';

test('casa o número da OS isolado', () => {
    assert.ok(contaPertenceAoPedido('Tecido para OS 12', '12'));
    assert.ok(contaPertenceAoPedido('OS-12 malha', '12'));
    assert.ok(contaPertenceAoPedido('ref #12', '12'));
    assert.ok(contaPertenceAoPedido('12', '12'));
    assert.ok(contaPertenceAoPedido('pedido 12, urgente', '12'));
});

test('NÃO casa número que é só parte de outro — o bug que motivou isto', () => {
    assert.ok(!contaPertenceAoPedido('OS 120', '12'));
    assert.ok(!contaPertenceAoPedido('OS 512', '12'));
    assert.ok(!contaPertenceAoPedido('OS 3120', '12'));
    assert.ok(!contaPertenceAoPedido('compra 100 metros', '1'));
    assert.ok(!contaPertenceAoPedido('nota 21', '1'));
});

test('entrada vazia ou ausente nunca vincula', () => {
    assert.ok(!contaPertenceAoPedido(null, '12'));
    assert.ok(!contaPertenceAoPedido(undefined, '12'));
    assert.ok(!contaPertenceAoPedido('', '12'));
    assert.ok(!contaPertenceAoPedido('OS 12', ''));
    assert.ok(!contaPertenceAoPedido('OS 12', '   '));
    assert.ok(!contaPertenceAoPedido('OS 12', null));
    assert.ok(!contaPertenceAoPedido('OS 12', undefined));
});

test('número de OS com caractere especial não quebra a regex', () => {
    // um order_number tipo "12.5" ou "12+A" não pode virar metacaractere solto
    assert.ok(contaPertenceAoPedido('ref 12.5 malha', '12.5'));
    assert.ok(!contaPertenceAoPedido('ref 1265 malha', '12.5'));
    assert.doesNotThrow(() => contaPertenceAoPedido('qualquer', '('));
    assert.doesNotThrow(() => contaPertenceAoPedido('qualquer', '[a-z'));
});

test('OS alfanumérica funciona', () => {
    assert.ok(contaPertenceAoPedido('referente a OS A12 do cliente', 'A12'));
});
