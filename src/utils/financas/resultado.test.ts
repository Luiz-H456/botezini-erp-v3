import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaDoPeriodo, linhasDoDre, margemAbaixoDoAlvo } from './resultado.ts';

const caixa = (p: Record<string, unknown> = {}) => ({
    entrou: 1000, impostos: 100, custoPecas: 300, sobrouDaProducao: 600, percentualDaProducao: 60,
    despesas: 250, financeiras: 50, lucro: 300, porCategoria: [], ...p,
}) as any;

test('meta: mês, trimestre e sem meta', () => {
    assert.deepEqual(metaDoPeriodo(5000, 10000, 1), { meta: 10000, pct: 50, atingiu: false });
    assert.deepEqual(metaDoPeriodo(31000, 10000, 3), { meta: 30000, pct: 103.3, atingiu: true });
    assert.equal(metaDoPeriodo(5000, 0, 1), null);
    assert.equal(metaDoPeriodo(5000, null, 1), null);
});

test('DRE: totais batem com a cascata e o lucro líquido é o lucro de caixa', () => {
    const l = linhasDoDre(caixa());
    const v = Object.fromEntries(l.map(x => [x.label, x.value]));
    assert.equal(v['RECEITA BRUTA'], 1000);
    assert.equal(v['(=) RECEITA LÍQUIDA'], 900);
    assert.equal(v['(=) LUCRO BRUTO'], 600);
    assert.equal(v['(=) RESULTADO OPERACIONAL'], 350);
    assert.equal(v['(=) LUCRO LÍQUIDO'], 300);
    assert.equal(l.find(x => x.label === '(=) LUCRO BRUTO')!.percent, 60);
});

test('margem abaixo do alvo: só com alvo e com entrada', () => {
    assert.deepEqual(margemAbaixoDoAlvo(caixa({ percentualDaProducao: 30 }), 40), { margem: 30, alvo: 40 });
    assert.equal(margemAbaixoDoAlvo(caixa({ percentualDaProducao: 45 }), 40), null);
    assert.equal(margemAbaixoDoAlvo(caixa({ percentualDaProducao: 30 }), 0), null);
    assert.equal(margemAbaixoDoAlvo(caixa({ entrou: 0, percentualDaProducao: null }), 40), null);
});
