import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBRL } from './currency.ts';

test('ponto com grupos de 3 dígitos e sem vírgula é milhar', () => {
    assert.equal(parseBRL('1.000'), 1000);
    assert.equal(parseBRL('2.500'), 2500);
    assert.equal(parseBRL('1.234.567'), 1234567);
    assert.equal(parseBRL('-1.000'), -1000);
});

test('o resto continua como era', () => {
    assert.equal(parseBRL('0.500'), 0.5);
    assert.equal(parseBRL('1.5'), 1.5);
    assert.equal(parseBRL('12.50'), 12.5);
    assert.equal(parseBRL('1,5'), 1.5);
    assert.equal(parseBRL('1.000,50'), 1000.5);
    assert.equal(parseBRL('1,000.50'), 1000.5);
    assert.equal(parseBRL('R$ 2.345,67'), 2345.67);
    assert.equal(parseBRL(''), 0);
    assert.equal(parseBRL(null), 0);
    assert.equal(parseBRL(42), 42);
});
