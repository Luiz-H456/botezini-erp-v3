import test from 'node:test';
import assert from 'node:assert/strict';
import { seedPlanFromTerms, termoDoPlano } from './paymentPlan.ts';

const TERMOS = ['a_vista', '50_50', '30', '30_60', '30_60_90'];
const dados = { total: 1000, today: '2026-10-14', deliveryDate: '2026-11-03' };

test('o plano 50/50 gerado pelo orçamento é reconhecido como o modelo 50_50', () => {
    // O orçamento emitiu dias antes: a data da entrada é outra, o rótulo é o mesmo.
    const doOrcamento = seedPlanFromTerms({ ...dados, today: '2026-10-10', terms: '50_50' });
    assert.equal(termoDoPlano(doOrcamento, dados, TERMOS), '50_50');
});

test('o plano sem condição com sinal de 50% também é 50_50', () => {
    const plano = seedPlanFromTerms({ ...dados, downPayment: 500 });
    assert.equal(termoDoPlano(plano, dados, TERMOS), '50_50');
});

test('cada modelo se reconhece, inclusive os de 3 parcelas com centavos quebrados', () => {
    for (const t of TERMOS) {
        const d = { ...dados, total: 1000.01 };
        assert.equal(termoDoPlano(seedPlanFromTerms({ ...d, terms: t }), d, TERMOS), t);
    }
});

test('editar um valor, a quantidade ou rótulo e data juntos volta para Personalizado', () => {
    const base = seedPlanFromTerms({ ...dados, terms: '50_50' });
    assert.equal(termoDoPlano([{ ...base[0], amount: 400 }, { ...base[1], amount: 600 }], dados, TERMOS), '');
    assert.equal(termoDoPlano([...base, { label: 'Extra', amount: 0, due: '2026-12-01' }], dados, TERMOS), '');
    assert.equal(termoDoPlano([{ ...base[0], label: 'Sinal', due: '2026-10-20' }, base[1]], dados, TERMOS), '');
});

test('trocar só o meio de pagamento não muda a condição', () => {
    const base = seedPlanFromTerms({ ...dados, terms: '50_50' });
    assert.equal(termoDoPlano(base.map(p => ({ ...p, method: 'Boleto' })), dados, TERMOS), '50_50');
});
