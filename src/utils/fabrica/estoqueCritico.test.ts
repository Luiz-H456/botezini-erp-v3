import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehCritico, filtrarCriticos } from './estoqueCritico.ts';

const i = (name: string, current_stock: number, min_stock: number, category?: string) => ({ name, current_stock, min_stock, category });

test('crítico = no mínimo ou abaixo, só com mínimo definido', () => {
    assert.equal(ehCritico(i('a', 5, 5)), true);
    assert.equal(ehCritico(i('a', 4, 5)), true);
    assert.equal(ehCritico(i('a', 6, 5)), false);
    assert.equal(ehCritico(i('a', 0, 0)), false);
});

test('busca e categoria somam ao filtro de crítico', () => {
    const itens = [i('Oxford branco', 1, 5, 'Tecidos'), i('Botão', 1, 5, 'Aviamentos'), i('Oxford azul', 9, 5, 'Tecidos'), i('Linha', 0, 2)];
    assert.deepEqual(filtrarCriticos(itens, '', '', '__sem__').map(x => x.name), ['Oxford branco', 'Botão', 'Linha']);
    assert.deepEqual(filtrarCriticos(itens, 'oxf', '', '__sem__').map(x => x.name), ['Oxford branco']);
    assert.deepEqual(filtrarCriticos(itens, 'tecid', '', '__sem__').map(x => x.name), ['Oxford branco']);
    assert.deepEqual(filtrarCriticos(itens, '', 'Tecidos', '__sem__').map(x => x.name), ['Oxford branco']);
    assert.deepEqual(filtrarCriticos(itens, '', '__sem__', '__sem__').map(x => x.name), ['Linha']);
});
