import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDaEntrega, avisoDeFalhaNaSobra, apuracaoSeSemBanco } from './avisoDaEntrega.ts';

const s = (nome: string, quantidade: number, unidade = 'kg') => ({ nome, unidade, quantidade });

test('sem sobra, ou já apurada, não há aviso', () => {
    assert.equal(avisoDaEntrega({ jaFeita: false, sobras: [] }), null);
    assert.equal(avisoDaEntrega({ jaFeita: true, sobras: [s('Malha', 2)] }), null);
});

test('SQL não rodado: avisa que a sobra não foi para o estoque', () => {
    assert.equal(avisoDaEntrega({ semBanco: true }),
        'Entregue. A sobra não foi para o estoque: o banco ainda não tem compras por pedido.');
});

test('lista a sobra com quantidade em pt-BR', () => {
    assert.equal(avisoDaEntrega({ jaFeita: false, sobras: [s('Malha PV', 2.5)] }),
        'Sobrou para o estoque: Malha PV 2,5 kg.');
});

test('mostra no máximo 2 insumos e "+N" para o resto', () => {
    const dois = avisoDaEntrega({ jaFeita: false, sobras: [s('A', 1), s('B', 2, 'un')] });
    assert.equal(dois, 'Sobrou para o estoque: A 1 kg · B 2 un.');
    const cinco = avisoDaEntrega({ jaFeita: false, sobras: ['A', 'B', 'C', 'D', 'E'].map(n => s(n, 1)) });
    assert.equal(cinco, 'Sobrou para o estoque: A 1 kg · B 1 kg +3.');
});

test('unidade vazia não deixa espaço sobrando', () => {
    assert.equal(avisoDaEntrega({ jaFeita: false, sobras: [s('Linha', 3, '')] }), 'Sobrou para o estoque: Linha 3.');
});

test('falha depois da entrega', () => {
    assert.equal(avisoDeFalhaNaSobra('timeout'), 'Entregue, mas a sobra não foi para o estoque: timeout.');
});

test('função de vínculo ausente no banco vira o aviso de "banco sem o SQL", não erro cru', () => {
    const r = apuracaoSeSemBanco(null);
    assert.deepEqual(r, { semBanco: true });
    assert.equal(avisoDaEntrega(r!), 'Entregue. A sobra não foi para o estoque: o banco ainda não tem compras por pedido.');
    assert.equal(apuracaoSeSemBanco(new Map()), null);
});
