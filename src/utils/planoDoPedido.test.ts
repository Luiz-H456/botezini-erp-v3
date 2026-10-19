import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    conferirPlano, planoPrecisaRevisao, reescalarPlano, reancorarPlano,
    sugerirPlanoAtualizado, totalDoPlano, somarDias, diferencaEmDias,
} from './planoDoPedido.ts';
import type { ParcelaDoPlano } from './planoDoPedido.ts';

const HOJE = '2026-08-25';

/** O plano do caso real: 50/50 de um orçamento de 400, montado 14 dias atrás. */
const planoVelho = (): ParcelaDoPlano[] => [
    { label: 'Entrada (50%)', amount: 200, due: '2026-08-11', method: 'PIX' },
    { label: 'Saldo na entrega', amount: 200, due: '2026-09-08', method: 'PIX' },
];

test('plano que fecha com o pedido confere', () => {
    const c = conferirPlano(planoVelho(), 400);
    assert.equal(c.confere, true);
    assert.equal(c.diferenca, 0);
});

test('plano de 400 num pedido de 1400 acusa a diferença', () => {
    const c = conferirPlano(planoVelho(), 1400);
    assert.equal(c.confere, false);
    assert.equal(c.total, 400);
    assert.equal(c.diferenca, -1000);
});

test('centavo de arredondamento não conta como divergência', () => {
    const plano: ParcelaDoPlano[] = [
        { label: 'a', amount: 33.33, due: HOJE },
        { label: 'b', amount: 33.33, due: HOJE },
        { label: 'c', amount: 33.34, due: HOJE },
    ];
    assert.equal(conferirPlano(plano, 100).confere, true);
});

// ─── revisão ─────────────────────────────────────────────────────────────────

test('o caso real acusa os DOIS motivos: valor e data', () => {
    const r = planoPrecisaRevisao(planoVelho(), 1400, HOJE);
    assert.equal(r.precisa, true);
    assert.deepEqual(r.motivos, ['valor', 'data']);
    assert.equal(r.vencidas, 1);
    assert.match(r.texto, /1000\.00 a menos/);
    assert.match(r.texto, /uma parcela já nasce vencida/);
});

test('plano em dia e com o valor certo passa direto', () => {
    const plano: ParcelaDoPlano[] = [
        { label: 'Entrada', amount: 700, due: '2026-08-25' },
        { label: 'Saldo', amount: 700, due: '2026-09-20' },
    ];
    const r = planoPrecisaRevisao(plano, 1400, HOJE);
    assert.equal(r.precisa, false);
    assert.deepEqual(r.motivos, []);
});

test('parcela vencendo HOJE não é parcela vencida', () => {
    const plano: ParcelaDoPlano[] = [{ label: 'À vista', amount: 100, due: HOJE }];
    assert.equal(planoPrecisaRevisao(plano, 100, HOJE).precisa, false);
});

test('plano vazio precisa de revisão e diz isso', () => {
    const r = planoPrecisaRevisao([], 1400, HOJE);
    assert.equal(r.precisa, true);
    assert.deepEqual(r.motivos, ['vazio']);
    assert.match(r.texto, /não tem plano/);
});

test('duas parcelas vencidas são contadas no plural', () => {
    const plano: ParcelaDoPlano[] = [
        { label: 'a', amount: 50, due: '2026-08-01' },
        { label: 'b', amount: 50, due: '2026-08-10' },
    ];
    const r = planoPrecisaRevisao(plano, 100, HOJE);
    assert.equal(r.vencidas, 2);
    assert.match(r.texto, /2 parcelas já nascem vencidas/);
});

// ─── reescala ────────────────────────────────────────────────────────────────

test('reescalar de 400 para 1400 preserva o 50/50', () => {
    const novo = reescalarPlano(planoVelho(), 1400);
    assert.deepEqual(novo.map(p => p.amount), [700, 700]);
    assert.equal(totalDoPlano(novo), 1400);
});

test('reescalar preserva proporção desigual', () => {
    const plano: ParcelaDoPlano[] = [
        { label: 'Entrada 30%', amount: 120, due: HOJE },
        { label: 'Saldo 70%', amount: 280, due: HOJE },
    ];
    const novo = reescalarPlano(plano, 1000);
    assert.deepEqual(novo.map(p => p.amount), [300, 700]);
});

test('a última parcela absorve a sobra e a soma fecha no centavo', () => {
    const plano: ParcelaDoPlano[] = [
        { label: 'a', amount: 1, due: HOJE },
        { label: 'b', amount: 1, due: HOJE },
        { label: 'c', amount: 1, due: HOJE },
    ];
    const novo = reescalarPlano(plano, 100);
    assert.equal(totalDoPlano(novo), 100);
});

test('reescalar preserva rótulo, data e meio de pagamento', () => {
    const novo = reescalarPlano(planoVelho(), 1400);
    assert.equal(novo[0].label, 'Entrada (50%)');
    assert.equal(novo[0].due, '2026-08-11');
    assert.equal(novo[0].method, 'PIX');
});

test('plano zerado divide igual, sem gerar NaN', () => {
    const plano: ParcelaDoPlano[] = [
        { label: 'a', amount: 0, due: HOJE },
        { label: 'b', amount: 0, due: HOJE },
    ];
    const novo = reescalarPlano(plano, 500);
    assert.deepEqual(novo.map(p => p.amount), [250, 250]);
});

// ─── reancoragem ─────────────────────────────────────────────────────────────

test('reancorar empurra tudo pelo mesmo tanto, preservando o intervalo', () => {
    const novo = reancorarPlano(planoVelho(), HOJE);
    // 11/08 estava 14 dias atrás; tudo anda 14 dias.
    assert.deepEqual(novo.map(p => p.due), ['2026-08-25', '2026-09-22']);
    assert.equal(diferencaEmDias(novo[0].due, novo[1].due), 28);
});

test('plano todo no futuro volta intacto', () => {
    const plano: ParcelaDoPlano[] = [
        { label: 'a', amount: 100, due: '2026-09-01' },
        { label: 'b', amount: 100, due: '2026-10-01' },
    ];
    assert.deepEqual(reancorarPlano(plano, HOJE), plano);
});

test('reancorar não mexe em valor', () => {
    const novo = reancorarPlano(planoVelho(), HOJE);
    assert.deepEqual(novo.map(p => p.amount), [200, 200]);
});

test('reancorar usa a parcela MAIS ANTIGA como referência, fora de ordem inclusive', () => {
    const plano: ParcelaDoPlano[] = [
        { label: 'b', amount: 100, due: '2026-09-08' },
        { label: 'a', amount: 100, due: '2026-08-11' },
    ];
    const novo = reancorarPlano(plano, HOJE);
    assert.deepEqual(novo.map(p => p.due), ['2026-09-22', '2026-08-25']);
});

// ─── sugestão completa ───────────────────────────────────────────────────────

test('a sugestão do caso real corrige valor e data de uma vez', () => {
    const novo = sugerirPlanoAtualizado(planoVelho(), 1400, HOJE);
    assert.deepEqual(novo.map(p => p.amount), [700, 700]);
    assert.deepEqual(novo.map(p => p.due), ['2026-08-25', '2026-09-22']);
    assert.equal(planoPrecisaRevisao(novo, 1400, HOJE).precisa, false);
});

test('sugestão de plano vazio é plano vazio, não invenção', () => {
    assert.deepEqual(sugerirPlanoAtualizado([], 1400, HOJE), []);
    assert.deepEqual(sugerirPlanoAtualizado(undefined, 1400, HOJE), []);
});

// ─── datas ───────────────────────────────────────────────────────────────────

test('somarDias atravessa mês e ano sem escorregar por fuso', () => {
    assert.equal(somarDias('2026-08-30', 5), '2026-09-04');
    assert.equal(somarDias('2026-12-30', 3), '2027-01-02');
    assert.equal(somarDias('2026-03-02', -5), '2026-02-25');
});

test('diferencaEmDias é negativa quando a segunda data é antes', () => {
    assert.equal(diferencaEmDias('2026-08-11', '2026-08-25'), 14);
    assert.equal(diferencaEmDias('2026-08-25', '2026-08-11'), -14);
});
