import { test } from 'node:test';
import assert from 'node:assert/strict';
import { somarVinculado } from './vinculado.ts';

test('soma compras e usos do estoque por pedido e insumo', () => {
    const m = somarVinculado(
        [{ pedido_id: 'p1', insumo_id: 'malha', quantidade: 10 }, { pedido_id: 'p1', insumo_id: 'malha', quantidade: '2.5' }, { pedido_id: null, insumo_id: 'malha', quantidade: 99 }],
        [{ reference_id: 'p1', insumo_id: 'malha', quantity: 3 }, { reference_id: 'p2', insumo_id: 'linha', quantity: 4 }],
    );
    assert.equal(m.get('p1')?.get('malha'), 15.5);
    assert.equal(m.get('p2')?.get('linha'), 4);
    assert.equal(m.size, 2);
});

test('sem linhas, mapa vazio', () => {
    assert.equal(somarVinculado([], []).size, 0);
});

test('ignora quantidade não numérica, zero e negativa', () => {
    const m = somarVinculado(
        [{ pedido_id: 'p1', insumo_id: 'a', quantidade: 'abc' }, { pedido_id: 'p1', insumo_id: 'a', quantidade: 0 }, { pedido_id: 'p1', insumo_id: 'a', quantidade: -5 }],
        [{ reference_id: 'p1', insumo_id: 'a', quantity: -1 }],
    );
    assert.equal(m.size, 0);
});

test('uso sem reference_id é ignorado', () => {
    assert.equal(somarVinculado([], [{ reference_id: null, insumo_id: 'a', quantity: 3 }]).size, 0);
});

test('o mesmo insumo em dois pedidos fica separado', () => {
    const m = somarVinculado([{ pedido_id: 'p1', insumo_id: 'a', quantidade: 1 }, { pedido_id: 'p2', insumo_id: 'a', quantidade: 2 }], []);
    assert.equal(m.get('p1')?.get('a'), 1);
    assert.equal(m.get('p2')?.get('a'), 2);
});

// --- custo do vinculado e último preço (lucro por pedido, 17/10) ---
import { somarCustoVinculado, ultimoPrecoPorInsumo } from './vinculado.ts';

test('custo vinculado soma quantidade e valor de compra e de uso do estoque, por pedido e insumo', () => {
    const m = somarCustoVinculado(
        [
            { pedido_id: 'p1', insumo_id: 'malha', quantidade: 10, custo_unitario: 40 },
            { pedido_id: 'p1', insumo_id: 'malha', quantidade: '5', custo_unitario: '46' },
            { pedido_id: null, insumo_id: 'malha', quantidade: 99, custo_unitario: 1 },     // foi para o estoque: fora
        ],
        [{ reference_id: 'p1', insumo_id: 'malha', quantity: 2, unit_cost: 30 }],
    );
    assert.deepEqual(m.get('p1')?.get('malha'), { quantidade: 17, valor: 690 });            // 400 + 230 + 60
    assert.equal(m.size, 1);
});

test('custo vinculado ignora quantidade zero ou negativa e custo invalido vira zero', () => {
    const m = somarCustoVinculado(
        [{ pedido_id: 'p1', insumo_id: 'a', quantidade: 0, custo_unitario: 10 }],
        [{ reference_id: 'p1', insumo_id: 'b', quantity: 3, unit_cost: null }],
    );
    assert.equal(m.get('p1')?.has('a'), false);
    assert.deepEqual(m.get('p1')?.get('b'), { quantidade: 3, valor: 0 });
});

test('ultimo preco e o da compra mais recente; empate de data desempata pelo id', () => {
    const m = ultimoPrecoPorInsumo([
        { insumo_id: 'malha', custo_unitario: 40, data: '2026-10-01', id: 'a' },
        { insumo_id: 'malha', custo_unitario: 46, data: '2026-10-10', id: 'b' },
        { insumo_id: 'malha', custo_unitario: 44, data: '2026-10-05', id: 'c' },
        { insumo_id: 'brim', custo_unitario: 20, data: '2026-10-02', id: 'd' },
        { insumo_id: 'brim', custo_unitario: 22, data: '2026-10-02', id: 'e' },
        { insumo_id: 'linha', custo_unitario: 0, data: '2026-10-09', id: 'f' },             // sem preço: não conta
    ]);
    assert.equal(m.get('malha'), 46);
    assert.equal(m.get('brim'), 22);
    assert.equal(m.has('linha'), false);
});
