import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completudeDosDados, produtosSemFichaQueVenderam } from './completudeDosDados.ts';

const pedido = (id: string, itens: any[]) => ({ id, order_number: id, budget_id: `o-${id}`, created_at: '2026-09-10', items: itens });
const orc = (id: string, itens: any[]) => ({ id: `o-${id}`, items: itens });

test('a fila conta só o produto sem ficha que vendeu; apelido vende pelo oficial', () => {
    const c = completudeDosDados({
        pedidos: [pedido('1', [
            { product_id: 'A', product_name: 'A', quantity: 10 },
            { product_id: 'D', product_name: 'D', quantity: 5 },
        ])],
        orcamentos: [orc('1', [
            { product_id: 'A', product_name: 'A', unit_price: 50 },
            { product_id: 'D', product_name: 'D', unit_price: 40 },
        ])],
        produtos: [
            { id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'C', name: 'C' },
            { id: 'D', name: 'D', canonical_product_id: 'C' },
        ],
        insumos: [],
        fichaPorProduto: new Map([['C', ['i1']]]),
    });
    // O painel lista todo produto sem ficha (A, B e o apelido D), na ordem do que pesa.
    assert.deepEqual(c.produtosSemFicha.map(l => [l.id, l.pecas]), [['A', 10], ['B', 0], ['D', 0]]);
    // A venda de D conta para C, que tem ficha: só A vendeu sem ficha.
    assert.equal(produtosSemFichaQueVenderam(c), 1);
    assert.equal(c.produtosPendentes, 3);
});

test('sem venda nenhuma, nada vendeu sem ficha', () => {
    const c = completudeDosDados({ pedidos: [], orcamentos: [], produtos: [{ id: 'A', name: 'A' }], insumos: [], fichaPorProduto: new Map() });
    assert.equal(produtosSemFichaQueVenderam(c), 0);
    assert.equal(c.cobertura, 0);
});
