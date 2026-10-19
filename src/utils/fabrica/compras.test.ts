import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previstoDoPedido, sugerirDivisao, calcularSobras, entraNasCompras } from './compras.ts';
import type { PLOrder, PLBomLine, PLInsumo } from '../purchaseList.ts';

const insumos = new Map<string, PLInsumo>([
    ['malha', { id: 'malha', name: 'Malha', unit: 'kg', current_stock: 0, average_unit_cost: 50, category: 'Tecidos' }],
    ['malha2', { id: 'malha2', name: 'Malha 2', unit: 'kg', current_stock: 0, average_unit_cost: 60, category: 'Tecidos' }],
    ['linha', { id: 'linha', name: 'Linha', unit: 'un', current_stock: 0, average_unit_cost: 2, category: 'Aviamentos' }],
]);
const fichas = new Map<string, PLBomLine[]>([
    ['camiseta', [{ insumo_id: 'malha', quantity: 0.357 }, { insumo_id: 'linha', quantity: 1 }]],
]);
const pedido = (items: PLOrder['items']): PLOrder => ({ id: 'p1', order_number: 'PED-1', deadline: '2026-11-11', items });

test('previsto multiplica a ficha pelas peças, com 3 casas', () => {
    const r = previstoDoPedido(pedido([{ product_id: 'camiseta', quantity: 10 }]), fichas, insumos);
    assert.equal(r.semFicha, false);
    assert.equal(r.porInsumo.get('malha'), 3.57);
    assert.equal(r.porInsumo.get('linha'), 10);
});

test('tecido escolhido no pedido substitui o tecido da ficha', () => {
    const r = previstoDoPedido(pedido([{ product_id: 'camiseta', quantity: 10, fabric_insumo_id: 'malha2' }]), fichas, insumos);
    assert.equal(r.porInsumo.get('malha'), undefined);
    assert.equal(r.porInsumo.get('malha2'), 3.57);
    assert.equal(r.porInsumo.get('linha'), 10);
});

test('produto sem ficha marca semFicha', () => {
    const r = previstoDoPedido(pedido([{ product_id: 'camiseta', quantity: 10 }, { product_id: 'boné', quantity: 5 }]), fichas, insumos);
    assert.equal(r.semFicha, true);
});

test('item com zero peças não conta e não marca semFicha', () => {
    const r = previstoDoPedido(pedido([{ product_id: 'boné', quantity: 0 }]), fichas, insumos);
    assert.equal(r.semFicha, false);
    assert.equal(r.porInsumo.size, 0);
});

test('divisão sugerida cobre as faltas na ordem dada e o resto vai ao estoque', () => {
    assert.deepEqual(sugerirDivisao(10, [{ pedidoId: 'a', falta: 6 }, { pedidoId: 'b', falta: 3 }]),
        [{ pedidoId: 'a', quantidade: 6 }, { pedidoId: 'b', quantidade: 3 }, { pedidoId: null, quantidade: 1 }]);
    assert.deepEqual(sugerirDivisao(4, [{ pedidoId: 'a', falta: 6 }]), [{ pedidoId: 'a', quantidade: 4 }]);
    assert.deepEqual(sugerirDivisao(2, []), [{ pedidoId: null, quantidade: 2 }]);
    assert.deepEqual(sugerirDivisao(0, [{ pedidoId: 'a', falta: 1 }]), []);
});

test('sobra = vinculado − previsto, só positivo, 3 casas', () => {
    const previsto = { porInsumo: new Map([['malha', 3.57], ['linha', 10]]), semFicha: false };
    const vinculado = new Map([['malha', 5], ['linha', 8], ['ziper', 2]]);
    assert.deepEqual(calcularSobras(vinculado, previsto), [
        { insumo_id: 'malha', quantidade: 1.43 },
        { insumo_id: 'ziper', quantidade: 2 },
    ]);
});

test('pedido com produto sem ficha: tudo gasto, sobra vazia', () => {
    const previsto = { porInsumo: new Map([['malha', 3.57]]), semFicha: true };
    assert.deepEqual(calcularSobras(new Map([['malha', 10]]), previsto), []);
});

test('pedido sem itens: nada previsto, não é semFicha', () => {
    const r = previstoDoPedido(pedido([]), fichas, insumos);
    assert.equal(r.semFicha, false);
    assert.equal(r.porInsumo.size, 0);
});

test('ficha só com linhas de quantidade zero: não é semFicha e não prevê nada (comportamento atual)', () => {
    const zerada = new Map<string, PLBomLine[]>([['camiseta', [{ insumo_id: 'malha', quantity: 0 }]]]);
    const r = previstoDoPedido(pedido([{ product_id: 'camiseta', quantity: 10 }]), zerada, insumos);
    assert.equal(r.semFicha, false);
    assert.equal(r.porInsumo.size, 0);
});

test('insumo apagado (fora do mapa) ainda gera a sobra', () => {
    const previsto = { porInsumo: new Map<string, number>(), semFicha: false };
    assert.deepEqual(calcularSobras(new Map([['apagado', 3]]), previsto), [{ insumo_id: 'apagado', quantidade: 3 }]);
});

test('vinculado menor que o previsto não gera sobra, nunca negativa', () => {
    const previsto = { porInsumo: new Map([['malha', 5]]), semFicha: false };
    assert.deepEqual(calcularSobras(new Map([['malha', 2]]), previsto), []);
});

test('só pedido ativo e de depois da virada entra nas compras', () => {
    assert.equal(entraNasCompras({ status: 'Pendente' }), true);
    assert.equal(entraNasCompras({ status: 'Em Produção', compras_legado: false }), true);
    assert.equal(entraNasCompras({ status: 'Em Produção', compras_legado: true }), false); // legado da virada
    assert.equal(entraNasCompras({ status: 'Entregue' }), false);
});
