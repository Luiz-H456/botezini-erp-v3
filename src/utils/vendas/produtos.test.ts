import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analiseDeProdutos } from './produtos.ts';

const produtos = [{ id: 'a', name: 'Camiseta' }, { id: 'b', name: 'Calça' }, { id: 'c', name: 'Boné' }];
const clientes = [{ id: 'x', company_name: 'Granha' }, { id: 'y', company_name: 'Mangá' }];
const pedidos = [
    { client_id: 'x', total_amount: 1000, items: [{ product_id: 'a', quantity: 30 }, { product_id: 'b', quantity: 2 }] },
    { client_id: 'y', total_amount: 300, items: [{ product_id: 'a', quantity: 10 }] },
    { client_id: 'x', total_amount: 500, items: [{ product_id: 'b', quantity: 1 }] },
];

test('mais vendidos por quantidade, parados (< 5) do mais parado para o menos', () => {
    const r = analiseDeProdutos({ pedidos, produtos, clientes });
    assert.deepEqual(r.topProdutos.map(p => [p.id, p.qtd]), [['a', 40], ['b', 3], ['c', 0]]);
    assert.deepEqual(r.parados.map(p => [p.id, p.qtd]), [['c', 0], ['b', 3]]);
});

test('clientes por receita, com quantidade de pedidos', () => {
    const r = analiseDeProdutos({ pedidos, produtos, clientes });
    assert.deepEqual(r.topClientes.map(c => [c.nome, c.receita, c.pedidos]), [['Granha', 1500, 2], ['Mangá', 300, 1]]);
});

test('produto de pedido que não está no cadastro é ignorado; cliente sem cadastro vira "Cliente"', () => {
    const r = analiseDeProdutos({ pedidos: [{ client_id: 'z', total_amount: 10, items: [{ product_id: 'q', quantity: 9 }] }], produtos, clientes });
    assert.equal(r.topProdutos.find(p => p.id === 'q'), undefined);
    assert.equal(r.topClientes[0].nome, 'Cliente');
});
