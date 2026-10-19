import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    totalDoItem, totalDoAditivo, problemasDoAditivo, aditivoEstaValido,
    montarFichaDeEntrega, sugerirItensDoAditivo,
    type ItemDoAditivo, type ItemEntregue,
} from './aditivoDePedido.ts';

const item = (p: Partial<ItemDoAditivo> = {}): ItemDoAditivo => ({
    product_name: 'Camisa polo', quantity: 10, unit_price: 50, ...p,
});

// ── dinheiro ────────────────────────────────────────────────────────────────

test('total do item e quantidade vezes preco', () => {
    assert.equal(totalDoItem(item({ quantity: 20, unit_price: 49.9 })), 998);
});

test('centavo nao escapa em ponto flutuante', () => {
    // 3 x 33,33 tem de dar 99,99 — nao 99,99000000000001, que a tela mostra
    // como 99,99 e o total do pedido soma como outra coisa.
    assert.equal(totalDoAditivo([item({ quantity: 3, unit_price: 33.33 })]), 99.99);
});

test('soma varias linhas', () => {
    assert.equal(totalDoAditivo([
        item({ quantity: 20, unit_price: 50 }),
        item({ quantity: 5, unit_price: 12.5 }),
    ]), 1062.5);
});

test('lista vazia soma zero, nao NaN', () => {
    assert.equal(totalDoAditivo([]), 0);
});

// ── o que impede de gravar ──────────────────────────────────────────────────

test('preco zero e recusado — peca de graca por engano nao muda o total', () => {
    const p = problemasDoAditivo([item({ unit_price: 0 })]);
    assert.equal(p.length, 1);
    assert.equal(p[0].campo, 'unit_price');
    assert.match(p[0].mensagem, /desconto/);
});

test('quantidade zero e recusada', () => {
    const p = problemasDoAditivo([item({ quantity: 0 })]);
    assert.deepEqual(p.map(x => x.campo), ['quantity']);
});

test('nome em branco e recusado, mesmo so com espacos', () => {
    assert.deepEqual(problemasDoAditivo([item({ product_name: '   ' })]).map(x => x.campo),
        ['product_name']);
});

test('aponta a LINHA do problema, nao so que ha um', () => {
    const p = problemasDoAditivo([item(), item({ quantity: -1 }), item()]);
    assert.equal(p.length, 1);
    assert.equal(p[0].indice, 1);
});

test('aditivo sem nenhuma linha nao e valido', () => {
    assert.equal(aditivoEstaValido([]), false);
    assert.equal(aditivoEstaValido([item()]), true);
});

// ── a ficha de entrega ──────────────────────────────────────────────────────

const entregue = (p: Partial<ItemEntregue> = {}): ItemEntregue => ({
    product_name: 'Camisa polo', quantidadePedida: 100, quantidadeEntregue: 100, ...p,
});

test('sem divergencia, a ficha nao inventa linha', () => {
    const f = montarFichaDeEntrega({
        itens: [entregue()], valorDoPedido: 5000, valorPago: 5000,
    });
    assert.deepEqual(f.divergencias, []);
    assert.equal(f.quitado, true);
});

test('conta pecas pedidas e entregues separadamente', () => {
    const f = montarFichaDeEntrega({
        itens: [entregue({ quantidadeEntregue: 120 }), entregue({ product_name: 'Boné', quantidadePedida: 10, quantidadeEntregue: 10 })],
        valorDoPedido: 5000, valorPago: 0,
    });
    assert.equal(f.pecasPedidas, 110);
    assert.equal(f.pecasEntregues, 130);
    assert.equal(f.divergencias.length, 1, 'so a linha que divergiu');
    assert.equal(f.divergencias[0].diferenca, 20);
});

test('entrega a MENOS aparece como diferenca negativa', () => {
    const f = montarFichaDeEntrega({
        itens: [entregue({ quantidadeEntregue: 90 })], valorDoPedido: 5000, valorPago: 0,
    });
    assert.equal(f.divergencias[0].diferenca, -10);
});

test('o total soma os aditivos ao valor do pedido', () => {
    const f = montarFichaDeEntrega({
        itens: [entregue()], valorDoPedido: 5000, valorDosAditivos: 1000, valorPago: 3000,
    });
    assert.equal(f.valorTotal, 6000);
    assert.equal(f.saldoAPagar, 3000);
    assert.equal(f.quitado, false);
});

test('quem pagou a MAIS ve credito, e nao um zero mentiroso', () => {
    // Math.max(0, ...) aqui esconderia dinheiro que e do cliente.
    const f = montarFichaDeEntrega({
        itens: [entregue()], valorDoPedido: 5000, valorPago: 5200,
    });
    assert.equal(f.saldoAPagar, -200);
    assert.equal(f.quitado, true);
});

test('centavo de arredondamento nao deixa o pedido eternamente em aberto', () => {
    const f = montarFichaDeEntrega({
        itens: [entregue()], valorDoPedido: 100, valorPago: 99.999,
    });
    assert.equal(f.quitado, true);
});

test('um centavo de verdade AINDA deixa em aberto', () => {
    const f = montarFichaDeEntrega({
        itens: [entregue()], valorDoPedido: 100, valorPago: 99.99,
    });
    assert.equal(f.quitado, false, 'R$ 0,01 devido continua devido');
});

// ── a sugestão ──────────────────────────────────────────────────────────────

test('sugere aditivo so do que saiu A MAIS', () => {
    const f = montarFichaDeEntrega({
        itens: [
            entregue({ product_name: 'Camisa', quantidadeEntregue: 120 }),
            entregue({ product_name: 'Calça', quantidadeEntregue: 80 }),
        ],
        valorDoPedido: 5000, valorPago: 0,
    });
    const sugerido = sugerirItensDoAditivo(f, () => 50);
    assert.equal(sugerido.length, 1, 'entregar a menos nao e aditivo negativo');
    assert.equal(sugerido[0].product_name, 'Camisa');
    assert.equal(sugerido[0].quantity, 20);
    assert.equal(sugerido[0].unit_price, 50);
});

test('preco nao encontrado vira zero, e o zero e barrado na validacao', () => {
    // O fluxo tem de PARAR na tela pedindo o preco, nao gravar peca de graca.
    const f = montarFichaDeEntrega({
        itens: [entregue({ quantidadeEntregue: 120 })], valorDoPedido: 5000, valorPago: 0,
    });
    const sugerido = sugerirItensDoAditivo(f, () => undefined);
    assert.equal(sugerido[0].unit_price, 0);
    assert.equal(aditivoEstaValido(sugerido), false);
});

test('o tamanho viaja junto — P e GG sao linhas diferentes', () => {
    const f = montarFichaDeEntrega({
        itens: [entregue({ size: 'GG', quantidadeEntregue: 105 })], valorDoPedido: 5000, valorPago: 0,
    });
    assert.equal(sugerirItensDoAditivo(f, () => 50)[0].size, 'GG');
});
