import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tecidosSemPrecoUsados, precoDeReferencia } from './tecidosSemPreco.ts';

const ins = (id: string, custo = 0, category = 'Tecidos') => [id, { id, name: id.toUpperCase(), unit: 'm', current_stock: 0, average_unit_cost: custo, category }] as const;
const insumos = new Map([ins('brim'), ins('malha', 0), ins('dry', 30), ins('linha', 0, 'Aviamentos'), ins('oxford'), ins('helanca')]);
const fichas = new Map([
    ['calca', [{ insumo_id: 'brim', quantity: 1.5 }, { insumo_id: 'linha', quantity: 1 }]],
    ['camiseta', [{ insumo_id: 'malha', quantity: 0.2 }]],
    ['bone', []],
]);
const pedido = (status: string, items: Array<{ product_id: string; quantity: number; fabric_insumo_id?: string }>, delivered_at: string | null = null) =>
    ({ id: Math.random().toString(36), order_number: 'x', deadline: '', status, delivered_at, items });

const hoje = '2026-10-19';

test('tecido sem custo medio e sem compra, usado em pedido ativo, entra; aviamento nao', () => {
    const r = tecidosSemPrecoUsados({ pedidos: [pedido('Em Produção', [{ product_id: 'calca', quantity: 10 }])], fichas, insumos, ultimoPreco: new Map(), hoje });
    assert.deepEqual(r.map(t => t.id), ['brim']);
});

test('tecido com ultimo preco de compra ou com custo medio nao entra', () => {
    const pedidos = [pedido('Pendente', [{ product_id: 'calca', quantity: 1 }, { product_id: 'camiseta', quantity: 1, fabric_insumo_id: 'dry' }])];
    const r = tecidosSemPrecoUsados({ pedidos, fichas, insumos, ultimoPreco: new Map([['brim', 25]]), hoje });
    assert.deepEqual(r, []);                                  // brim tem compra; dry tem custo médio
});

test('tecido com preco na tabela do fornecedor nao entra: e o primeiro preco que o lucro usa (30/10)', () => {
    const pedidos = [pedido('Pendente', [{ product_id: 'calca', quantity: 1 }])];
    const r = tecidosSemPrecoUsados({ pedidos, fichas, insumos, ultimoPreco: new Map(), referencia: new Map([['brim', 19.1]]), hoje });
    assert.deepEqual(r, [], 'brim tem preço de referência na tabela; avisar "sem preço" mandaria definir um preço que o custo ignora');
});

test('o tecido escolhido no item conta, mesmo em produto sem ficha', () => {
    const r = tecidosSemPrecoUsados({ pedidos: [pedido('Pendente', [{ product_id: 'bone', quantity: 5, fabric_insumo_id: 'oxford' }])], fichas, insumos, ultimoPreco: new Map(), hoje });
    assert.deepEqual(r.map(t => t.id), ['oxford']);
});

test('entregue nos ultimos 90 dias entra; mais antigo nao; nao entregue e nao ativo nao', () => {
    const pedidos = [
        pedido('Entregue', [{ product_id: 'camiseta', quantity: 1 }], '2026-08-01'),             // 79 dias: entra
        pedido('Entregue', [{ product_id: 'bone', quantity: 1, fabric_insumo_id: 'helanca' }], '2026-07-01'),  // 110 dias: fora
    ];
    const r = tecidosSemPrecoUsados({ pedidos, fichas, insumos, ultimoPreco: new Map(), hoje });
    assert.deepEqual(r.map(t => t.id), ['malha']);
});

test('cada tecido uma vez, em ordem de nome', () => {
    const pedidos = [
        pedido('Pendente', [{ product_id: 'calca', quantity: 1 }, { product_id: 'bone', quantity: 1, fabric_insumo_id: 'oxford' }]),
        pedido('Em Produção', [{ product_id: 'calca', quantity: 3 }]),
    ];
    assert.deepEqual(tecidosSemPrecoUsados({ pedidos, fichas, insumos, ultimoPreco: new Map(), hoje }).map(t => t.id), ['brim', 'oxford']);
});

test('preco de referencia: aceita o formato brasileiro e recusa zero, negativo e texto', () => {
    assert.equal(precoDeReferencia('29,00'), 29);
    assert.equal(precoDeReferencia('1.234,5'), 1234.5);
    assert.equal(precoDeReferencia('0'), null);
    assert.equal(precoDeReferencia('-3'), null);
    assert.equal(precoDeReferencia('abc'), null);
    assert.equal(precoDeReferencia(''), null);
});
