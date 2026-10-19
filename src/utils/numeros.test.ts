import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numero, percentual } from './numeros.ts';

test('numero: sem zeros sobrando, vírgula decimal, ponto só de milhar', () => {
    assert.equal(numero(1), '1');
    assert.equal(numero(6), '6');
    assert.equal(numero(0), '0');
    assert.equal(numero(2.4), '2,4');
    assert.equal(numero(0.5), '0,5');
    assert.equal(numero(1000), '1.000');
    assert.equal(numero(1234.5678), '1.234,568');
    assert.equal(numero(-3.6), '-3,6');
    assert.equal(numero(-0.0001), '0');
    assert.equal(numero(NaN), '0');
});

test('percentual: vírgula pt-BR, uma casa por padrão', () => {
    assert.equal(percentual(3.4), '3,4%');
    assert.equal(percentual(140.3), '140,3%');
    assert.equal(percentual(12), '12%');
    assert.equal(percentual(5, 1, true), '+5%');
    assert.equal(percentual(-2.25, 1, true), '-2,3%');
    assert.equal(percentual(0, 1, true), '0%');
});
