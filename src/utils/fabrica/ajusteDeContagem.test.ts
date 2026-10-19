import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajusteDeContagem } from './ajusteDeContagem.ts';

test('diferença positiva, negativa e nenhuma', () => {
    assert.equal(ajusteDeContagem(10, '12,5', '', 3).texto, 'Vai lançar +2,5');
    assert.equal(ajusteDeContagem(10, '7', '', 3).texto, 'Vai lançar −3');
    const igual = ajusteDeContagem(10, '10', '', 3);
    assert.equal(igual.texto, 'Sem diferença');
    assert.equal(igual.podeAjustar, false);
});

test('"1.000" é mil', () => {
    assert.equal(ajusteDeContagem(0, '1.000', '2', 0).diferenca, 1000);
    assert.equal(ajusteDeContagem(1000, '1', '', 5).texto, 'Vai lançar −999');
});

test('sem contagem válida não ajusta', () => {
    assert.equal(ajusteDeContagem(10, '', '', 3).podeAjustar, false);
    assert.equal(ajusteDeContagem(10, '   ', '', 3).texto, '');
    assert.equal(ajusteDeContagem(10, '-4', '', 3).podeAjustar, false);
    for (const lixo of ['abc', ',', '-', 'o', '.', 'R$']) {
        const r = ajusteDeContagem(40, lixo, '', 3);
        assert.deepEqual([r.podeAjustar, r.texto, r.diferenca], [false, '', 0], lixo);
    }
    assert.equal(ajusteDeContagem(40, '0', '', 3).texto, 'Vai lançar −40'); // zero contado é contagem válida
});

test('custo só é exigido em entrada de insumo sem custo médio', () => {
    const semCusto = ajusteDeContagem(0, '5', '', 0);
    assert.equal(semCusto.pedeCusto, true);
    assert.equal(semCusto.podeAjustar, false);
    const comCusto = ajusteDeContagem(0, '5', '2,50', 0);
    assert.equal(comCusto.podeAjustar, true);
    assert.equal(comCusto.custo, 2.5);
    // com custo médio, ou em saída, o custo digitado é ignorado
    assert.deepEqual([ajusteDeContagem(0, '5', '9', 4).pedeCusto, ajusteDeContagem(0, '5', '9', 4).custo], [false, undefined]);
    assert.equal(ajusteDeContagem(10, '5', '', 0).pedeCusto, false);
    assert.equal(ajusteDeContagem(10, '5', '', 0).podeAjustar, true);
});

test('diferença de ponto flutuante não vira lançamento', () => {
    assert.equal(ajusteDeContagem(0.1 + 0.2, '0,3', '', 1).texto, 'Sem diferença');
});
