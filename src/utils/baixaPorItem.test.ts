import test from 'node:test';
import assert from 'node:assert';
import { chaveDoItem, saldoPorItem, feitoSemItem } from './baixaPorItem.ts';
import type { ItemDoPedido } from './baixaPorItem.ts';

const POLO_CLARA: ItemDoPedido = { product_id: 'p1', product_name: 'Polo', color: 'Azul Claro', size: 'M', quantity: 30 };
const POLO_ESCURA: ItemDoPedido = { product_id: 'p1', product_name: 'Polo', color: 'Azul Escuro', size: 'M', quantity: 20 };
const CALCA: ItemDoPedido = { product_id: 'p2', product_name: 'Calça', color: 'Preto', size: 'G', quantity: 10 };

test('a chave separa cor e tamanho do mesmo produto', () => {
    assert.notStrictEqual(chaveDoItem(POLO_CLARA), chaveDoItem(POLO_ESCURA));
    assert.notStrictEqual(
        chaveDoItem({ product_id: 'p1', color: 'Azul', size: 'M' }),
        chaveDoItem({ product_id: 'p1', color: 'Azul', size: 'G' }),
    );
});

test('a chave ignora caixa e espaço — é a mesma peça na prateleira', () => {
    assert.strictEqual(
        chaveDoItem({ product_id: 'p1', color: 'Azul Claro', size: 'm' }),
        chaveDoItem({ product_id: 'p1', color: ' AZUL CLARO ', size: 'M' }),
    );
});

test('entrega parcial: cada cor tem seu saldo', () => {
    // O caso do usuário: algumas polos claras, poucas escuras, nenhuma calça.
    const saldos = saldoPorItem([POLO_CLARA, POLO_ESCURA, CALCA], [
        { item_key: chaveDoItem(POLO_CLARA), qty_done: 18 },
        { item_key: chaveDoItem(POLO_ESCURA), qty_done: 4 },
    ]);

    const clara = saldos.find(s => s.cor === 'Azul Claro')!;
    const escura = saldos.find(s => s.cor === 'Azul Escuro')!;
    const calca = saldos.find(s => s.produto === 'Calça')!;

    assert.deepStrictEqual([clara.feito, clara.resta], [18, 12]);
    assert.deepStrictEqual([escura.feito, escura.resta], [4, 16]);
    assert.deepStrictEqual([calca.feito, calca.resta], [0, 10]);
    assert.strictEqual(clara.pct, 60);
});

test('baixa maior que o total não gera saldo negativo', () => {
    const [s] = saldoPorItem([CALCA], [{ item_key: chaveDoItem(CALCA), qty_done: 999 }]);
    assert.strictEqual(s.resta, 0);
});

test('linhas repetidas do mesmo item somam num saldo só', () => {
    // Separá-las obrigaria a escolher arbitrariamente em qual lançar a baixa.
    const saldos = saldoPorItem(
        [{ ...POLO_CLARA, quantity: 30 }, { ...POLO_CLARA, quantity: 12 }],
        [{ item_key: chaveDoItem(POLO_CLARA), qty_done: 10 }],
    );
    assert.strictEqual(saldos.length, 1);
    assert.strictEqual(saldos[0].total, 42);
    assert.strictEqual(saldos[0].resta, 32);
});

test('baixa antiga sem item não é atribuída a nenhuma linha', () => {
    const logs = [{ qty_done: 25 }, { item_key: chaveDoItem(CALCA), qty_done: 3 }];
    const saldos = saldoPorItem([POLO_CLARA, CALCA], logs);
    assert.strictEqual(saldos.find(s => s.cor === 'Azul Claro')!.feito, 0);
    assert.strictEqual(saldos.find(s => s.produto === 'Calça')!.feito, 3);
    // ...mas aparece separada, para a conta da tela fechar com explicação.
    assert.strictEqual(feitoSemItem(logs), 25);
});

test('expedido é contado à parte do produzido', () => {
    const [s] = saldoPorItem([POLO_CLARA], [
        { item_key: chaveDoItem(POLO_CLARA), qty_done: 10, qty_expedited: 6 },
    ]);
    assert.strictEqual(s.feito, 10);
    assert.strictEqual(s.expedido, 6);
    assert.strictEqual(s.resta, 20);
});

test('pedido sem itens ou sem logs não quebra', () => {
    assert.deepStrictEqual(saldoPorItem([], []), []);
    const [s] = saldoPorItem([CALCA], []);
    assert.deepStrictEqual([s.feito, s.resta, s.pct], [0, 10, 0]);
    assert.strictEqual(feitoSemItem([]), 0);
});

test('item com quantidade zero não divide por zero', () => {
    const [s] = saldoPorItem([{ product_id: 'x', product_name: 'X', quantity: 0 }], []);
    assert.strictEqual(s.pct, 0);
    assert.strictEqual(s.resta, 0);
});
