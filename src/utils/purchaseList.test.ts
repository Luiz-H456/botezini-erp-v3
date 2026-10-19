import test from 'node:test';
import assert from 'node:assert';
import { computePurchaseList } from './purchaseList.ts';
import type { PLOrder, PLBomLine, PLInsumo } from './purchaseList.ts';

const insumos = new Map<string, PLInsumo>([
    ['tecido_a', { id: 'tecido_a', name: 'Malha PV', unit: 'm', current_stock: 10, average_unit_cost: 20, category: 'Tecidos' }],
    ['tecido_b', { id: 'tecido_b', name: 'Dry Fit', unit: 'm', current_stock: 0, average_unit_cost: 30, category: 'Tecidos' }],
    ['linha', { id: 'linha', name: 'Linha', unit: 'un', current_stock: 100, average_unit_cost: 2, category: 'Aviamentos' }],
]);

// Produto P1: 1.5m de tecido_a + 1 linha por peça.
const bom = new Map<string, PLBomLine[]>([
    ['P1', [{ insumo_id: 'tecido_a', quantity: 1.5 }, { insumo_id: 'linha', quantity: 1 }]],
]);

test('agrega BOM × quantidade e calcula falta = necessário - vinculado (estoque não abate)', () => {
    const orders: PLOrder[] = [
        { id: 'o1', order_number: '1', deadline: '2026-08-01', items: [{ product_id: 'P1', quantity: 10 }] },
    ];
    const r = computePurchaseList(orders, bom, insumos);
    const tecido = r.lines.find(l => l.insumo_id === 'tecido_a')!;
    assert.strictEqual(tecido.needed, 15);          // 1.5 × 10
    assert.strictEqual(tecido.in_stock, 10);
    assert.strictEqual(tecido.to_buy, 15);          // nada vinculado: estoque não abate
    assert.strictEqual(tecido.est_cost, 300);       // 15 × 20

    const linha = r.lines.find(l => l.insumo_id === 'linha')!;
    assert.strictEqual(linha.needed, 10);
    assert.strictEqual(linha.to_buy, 10);           // estoque 100 é só informativo
    assert.strictEqual(linha.est_cost, 20);
});

test('soma o consumo entre múltiplos pedidos', () => {
    const orders: PLOrder[] = [
        { id: 'o1', order_number: '1', deadline: '2026-08-01', items: [{ product_id: 'P1', quantity: 10 }] },
        { id: 'o2', order_number: '2', deadline: '2026-08-02', items: [{ product_id: 'P1', quantity: 10 }] },
    ];
    const r = computePurchaseList(orders, bom, insumos);
    const tecido = r.lines.find(l => l.insumo_id === 'tecido_a')!;
    assert.strictEqual(tecido.needed, 30);          // 1.5 × 20
    assert.strictEqual(tecido.to_buy, 30);          // 30 - 0 vinculado
});

test('override: tecido escolhido no item substitui o da ficha', () => {
    const orders: PLOrder[] = [
        { id: 'o1', order_number: '1', deadline: '2026-08-01', items: [{ product_id: 'P1', quantity: 10, fabric_insumo_id: 'tecido_b' }] },
    ];
    const r = computePurchaseList(orders, bom, insumos);
    assert.strictEqual(r.lines.find(l => l.insumo_id === 'tecido_a'), undefined); // não usa o da ficha
    const tecidoB = r.lines.find(l => l.insumo_id === 'tecido_b')!;
    assert.strictEqual(tecidoB.needed, 15);         // mantém a qtd/peça da ficha
    assert.strictEqual(tecidoB.to_buy, 15);         // estoque 0
    assert.strictEqual(tecidoB.est_cost, 450);      // 15 × 30
});

test('produto sem ficha técnica é listado e ignorado no cálculo', () => {
    const orders: PLOrder[] = [
        { id: 'o1', order_number: '1', deadline: '2026-08-01', items: [{ product_id: 'SEM_BOM', quantity: 5 }] },
    ];
    const r = computePurchaseList(orders, bom, insumos);
    assert.deepStrictEqual(r.products_without_bom, ['SEM_BOM']);
    assert.strictEqual(r.lines.length, 0);
});

test('o que falta comprar abate o já vinculado a cada pedido, não o estoque', () => {
    const orders: PLOrder[] = [
        { id: 'o1', order_number: 'PED-1', deadline: '2026-11-01', items: [{ product_id: 'p', quantity: 10 }] },
        { id: 'o2', order_number: 'PED-2', deadline: '2026-11-05', items: [{ product_id: 'p', quantity: 10 }] },
    ];
    const bom = new Map<string, PLBomLine[]>([['p', [{ insumo_id: 'm', quantity: 0.5 }]]]);
    const ins = new Map<string, PLInsumo>([['m', { id: 'm', name: 'Malha', unit: 'kg', current_stock: 100, average_unit_cost: 10, category: 'Tecidos' }]]);
    const vinc = new Map([['o1', new Map([['m', 5]])], ['o2', new Map([['m', 2]])]]);
    const r = computePurchaseList(orders, bom, ins, vinc);
    const l = r.lines[0];
    assert.equal(l.needed, 10);
    assert.equal(l.vinculado, 7);
    assert.equal(l.to_buy, 3);
    assert.equal(l.in_stock, 100);
    assert.deepEqual(l.pedidos, [{ order_id: 'o2', order_number: 'PED-2', falta: 3 }]);
});

const insM = new Map<string, PLInsumo>([['m', { id: 'm', name: 'Malha', unit: 'kg', current_stock: 0, average_unit_cost: 10, category: 'Tecidos' }]]);
const bomM = new Map<string, PLBomLine[]>([['p', [{ insumo_id: 'm', quantity: 0.5 }]]]);
const ped = (id: string, order_number: string, deadline: string, quantity = 10): PLOrder =>
    ({ id, order_number, deadline, items: [{ product_id: 'p', quantity }] });

test('pedidos em ordem de prazo; número em ordem natural; sem prazo por último', () => {
    const r = computePurchaseList([
        ped('sem', 'PED-1', ''),
        ped('b', 'PED-10', '2026-11-01'),
        ped('a', 'PED-2', '2026-11-01'),
    ], bomM, insM);
    assert.deepEqual(r.lines[0].pedidos.map(p => p.order_id), ['a', 'b', 'sem']);
});

test('poeira de ponto flutuante não vira pedido com falta zero', () => {
    const r = computePurchaseList([ped('o1', 'PED-1', '2026-11-01', 10)], bomM, insM,
        new Map([['o1', new Map([['m', 4.9999999]])]]));
    assert.equal(r.lines[0].to_buy, 0);
    assert.equal(r.lines[0].is_shortage, false);
    assert.deepEqual(r.lines[0].pedidos, []);
    const r2 = computePurchaseList([ped('o1', 'PED-1', '2026-11-01', 10)], bomM, insM,
        new Map([['o1', new Map([['m', 4.9996]])]]));
    assert.deepEqual(r2.lines[0].pedidos, []); // 0,0004 arredonda para 0 (3 casas)
});

test('quantidades com 3 casas: 2 × 3,574 = 7,148, e a soma das faltas é o to_buy', () => {
    const bom = new Map<string, PLBomLine[]>([['p', [{ insumo_id: 'm', quantity: 0.3574 }]]]);
    const r = computePurchaseList([ped('o1', 'PED-1', '2026-11-01'), ped('o2', 'PED-2', '2026-11-02')], bom, insM);
    const l = r.lines[0];
    assert.equal(l.needed, 7.148);
    assert.equal(l.to_buy, 7.148);
    assert.equal(l.pedidos.reduce((s, p) => s + p.falta, 0), l.to_buy);
});
