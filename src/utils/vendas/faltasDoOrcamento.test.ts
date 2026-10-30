import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faltasDoOrcamento } from './faltasDoOrcamento.ts';

test('lista TUDO o que falta de uma vez, na ordem da tela', () => {
    assert.deepEqual(faltasDoOrcamento({ clienteId: '', itens: [], servicos: [] }).map(f => f.campo), ['cliente', 'itens']);
});

test('item sem produto e sem descrição, ou com quantidade zero, aparece com o número da linha', () => {
    const f = faltasDoOrcamento({ clienteId: 'c', itens: [{ product_id: 'p', quantity: 10 }, { product_id: '', product_name: '', quantity: 5 }, { product_id: 'p', quantity: 0 }], servicos: [] });
    assert.deepEqual(f.map(x => x.texto), ['Linha 2: escolha o produto', 'Linha 3: quantidade zerada']);
});

test('orçamento completo não tem falta; só serviço (sem item) também vale', () => {
    assert.deepEqual(faltasDoOrcamento({ clienteId: 'c', itens: [{ product_id: 'p', quantity: 1 }], servicos: [] }), []);
    assert.deepEqual(faltasDoOrcamento({ clienteId: 'c', itens: [], servicos: [{}] }), []);
});
