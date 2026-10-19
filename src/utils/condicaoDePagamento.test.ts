import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descreverCondicao, venceNaConfirmacao, aplicarEntrada, planoParaMostrar, entradaPctDoPlano } from './condicaoDePagamento.ts';
import { seedPlanFromTerms } from './paymentPlan.ts';

const EMISSAO = '2026-08-26';
const ENTREGA = '2026-09-22';
const TOTAL = 1400;

/** O plano que cada condição da tela realmente produz. */
const planoDe = (terms: string) =>
    seedPlanFromTerms({ terms, total: TOTAL, today: EMISSAO, deliveryDate: ENTREGA });

const condicaoDe = (terms: string) =>
    descreverCondicao({ payment_plan: planoDe(terms), total_amount: TOTAL, date: EMISSAO }, EMISSAO);

// ─── o que é entrada ─────────────────────────────────────────────────────────

test('parcela vencendo na emissão é entrada', () => {
    assert.equal(venceNaConfirmacao(EMISSAO, EMISSAO), true);
});

test('folga de poucos dias ainda conta como entrada', () => {
    assert.equal(venceNaConfirmacao('2026-08-29', EMISSAO), true);
});

test('parcela de 30 dias não é entrada', () => {
    assert.equal(venceNaConfirmacao('2026-09-25', EMISSAO), false);
});

test('a referência é a emissão, não hoje — orçamento antigo não vira entrada', () => {
    // "30 dias" de dois meses atrás: já venceu, mas nunca foi entrada.
    assert.equal(venceNaConfirmacao('2026-06-30', '2026-05-31'), false);
});

// ─── as cinco condições da tela ──────────────────────────────────────────────

test('À VISTA: o total NÃO é entrada — vence na entrega', () => {
    const c = condicaoDe('a_vista');
    assert.equal(c.temEntrada, false);
    assert.equal(c.entrada, 0);
    assert.equal(c.aPrazo, 1400);
    assert.match(c.resumo, /à vista/);
});

test('50/50: metade na confirmação, metade depois', () => {
    const c = condicaoDe('50_50');
    assert.equal(c.temEntrada, true);
    assert.equal(c.entrada, 700);
    assert.equal(c.aPrazo, 700);
    assert.match(c.resumo, /entrada/);
});

test('30 DIAS: o total inteiro é a prazo, entrada zero', () => {
    const c = condicaoDe('30');
    assert.equal(c.temEntrada, false);
    assert.equal(c.entrada, 0);
    assert.equal(c.aPrazo, 1400);
});

test('30/60: sem entrada, duas parcelas a prazo', () => {
    const c = condicaoDe('30_60');
    assert.equal(c.temEntrada, false);
    assert.equal(c.entrada, 0);
    assert.equal(c.parcelas.length, 2);
    assert.match(c.resumo, /2x de/);
});

test('30/60/90: sem entrada, três parcelas', () => {
    const c = condicaoDe('30_60_90');
    assert.equal(c.temEntrada, false);
    assert.equal(c.entrada, 0);
    assert.equal(c.parcelas.length, 3);
    assert.match(c.resumo, /3x de/);
    assert.match(c.resumo, /24\/11\/2026/);
});

test('nenhuma condição perde dinheiro na leitura', () => {
    for (const t of ['a_vista', '50_50', '30', '30_60', '30_60_90']) {
        const c = condicaoDe(t);
        assert.equal(c.entrada + c.aPrazo, TOTAL, t);
    }
});

// ─── a regressão que motivou tudo ────────────────────────────────────────────

test('o total de um "30 dias" nunca mais é anunciado como entrada', () => {
    const c = condicaoDe('30');
    assert.equal(c.entrada, 0);
    assert.equal(/entrada/i.test(c.resumo), false);
});

test('o "à vista" também não vira entrada de 100%', () => {
    const c = condicaoDe('a_vista');
    assert.equal(/entrada/i.test(c.resumo), false);
});

// ─── fallback dos campos antigos ─────────────────────────────────────────────

test('sem plano, os campos antigos ainda descrevem entrada e saldo', () => {
    const c = descreverCondicao({
        total_amount: 1000, date: EMISSAO,
        down_payment_value: 400, delivery_payment_value: 600,
    }, EMISSAO);
    assert.equal(c.origem, 'campos');
    assert.equal(c.entrada, 400);
    assert.equal(c.aPrazo, 600);
    assert.equal(c.temEntrada, true);
});

test('saldo implícito: gravada só a entrada, o resto sai do total', () => {
    const c = descreverCondicao({
        total_amount: 10000, date: EMISSAO, down_payment_value: 4000,
    }, EMISSAO);
    assert.equal(c.entrada, 4000);
    assert.equal(c.aPrazo, 6000);
    assert.equal(c.parcelas.length, 2);
});

test('entrada igual ao total não inventa um saldo negativo', () => {
    const c = descreverCondicao({
        total_amount: 500, date: EMISSAO, down_payment_value: 500,
    }, EMISSAO);
    assert.equal(c.aPrazo, 0);
    assert.equal(c.parcelas.length, 1);
});

test('sem plano e sem campos, a condição é "a combinar"', () => {
    const c = descreverCondicao({ total_amount: 1000, date: EMISSAO }, EMISSAO);
    assert.equal(c.origem, 'vazio');
    assert.deepEqual(c.parcelas, []);
    assert.match(c.resumo, /a combinar/);
});

test('o plano tem precedência sobre os campos antigos', () => {
    const c = descreverCondicao({
        payment_plan: planoDe('30_60_90'),
        total_amount: TOTAL, date: EMISSAO,
        // Valores herdados, com o significado sequestrado.
        down_payment_value: 466.67, delivery_payment_value: 933.33,
    }, EMISSAO);
    assert.equal(c.origem, 'plano');
    assert.equal(c.entrada, 0);
});

// ─── linhas para a mensagem ──────────────────────────────────────────────────

test('cada parcela vira uma linha com valor e quando', () => {
    const c = condicaoDe('50_50');
    assert.equal(c.linhas.length, 2);
    assert.match(c.linhas[0], /na confirmação/);
    assert.match(c.linhas[1], /até 22\/09\/2026/);
});

test('parcela sem data cai em "na entrega", não em "na confirmação"', () => {
    const c = descreverCondicao({
        total_amount: 1000, date: EMISSAO,
        down_payment_value: 400, delivery_payment_value: 600,
    }, EMISSAO);
    assert.match(c.linhas[1], /na entrega/);
    assert.equal(c.parcelas[1].naConfirmacao, false);
});

test('as linhas do 30/60/90 não falam em entrada nem em entrega', () => {
    const c = condicaoDe('30_60_90');
    assert.equal(c.linhas.some(l => /confirmação|entrega/.test(l)), false);
    assert.equal(c.linhas.length, 3);
});

// ─── robustez ────────────────────────────────────────────────────────────────

test('parcela de valor zero é ignorada', () => {
    const c = descreverCondicao({
        payment_plan: [
            { label: 'a', amount: 500, due: EMISSAO },
            { label: 'vazia', amount: 0, due: ENTREGA },
        ],
        total_amount: 500, date: EMISSAO,
    }, EMISSAO);
    assert.equal(c.parcelas.length, 1);
});

test('sem data de emissão, cai para hoje sem quebrar', () => {
    const c = descreverCondicao({ payment_plan: planoDe('50_50'), total_amount: TOTAL }, EMISSAO);
    assert.equal(c.entrada, 700);
});

test('o meio de pagamento sobrevive à leitura', () => {
    const c = condicaoDe('50_50');
    assert.equal(c.parcelas[0].meio, 'PIX');
});

test('parcelas de valores diferentes não são anunciadas como "Nx de"', () => {
    const c = descreverCondicao({
        payment_plan: [
            { label: 'a', amount: 1000, due: '2026-09-25' },
            { label: 'b', amount: 400, due: '2026-10-25' },
        ],
        total_amount: 1400, date: EMISSAO,
    }, EMISSAO);
    assert.match(c.resumo, /2 parcelas/);
    assert.equal(/2x de/.test(c.resumo), false);
});

// ─── Task 4: Condição de pagamento num bloco só ──────────────────────────────

const HOJE = '2026-10-09', ENTREGA_T4 = '2026-11-06';
const soma = (p: { amount: number }[]) => Math.round(p.reduce((s, x) => s + x.amount, 0) * 100) / 100;

test('sem plano: entrada % vira entrada hoje + saldo na entrega', () => {
    const p = aplicarEntrada({ total: 1000, entradaPct: 40, hoje: HOJE, entrega: ENTREGA_T4 });
    assert.deepStrictEqual(p.map(x => [x.label, x.amount, x.due]), [['Entrada (40%)', 400, HOJE], ['Saldo na entrega', 600, ENTREGA_T4]]);
});

test('com plano de 3: muda a 1ª e reescala o saldo mantendo a proporção', () => {
    const plano = [
        { label: 'Entrada (50%)', amount: 500, due: HOJE, method: 'PIX' },
        { label: '30 dias', amount: 250, due: '2026-11-08', method: 'Boleto' },
        { label: '60 dias', amount: 250, due: '2026-12-08', method: 'Boleto' },
    ];
    const p = aplicarEntrada({ plano, total: 1000, entradaPct: 20, hoje: HOJE, entrega: ENTREGA_T4 });
    assert.deepStrictEqual(p.map(x => [x.label, x.amount, x.due, x.method]), [
        ['Entrada (20%)', 200, HOJE, 'PIX'], ['30 dias', 400, '2026-11-08', 'Boleto'], ['60 dias', 400, '2026-12-08', 'Boleto'],
    ]);
});

test('a soma fecha no centavo e o % fica entre 1 e 99', () => {
    assert.equal(soma(aplicarEntrada({ total: 1000.01, entradaPct: 33, hoje: HOJE, entrega: ENTREGA_T4 })), 1000.01);
    assert.equal(aplicarEntrada({ total: 1000, entradaPct: 0, hoje: HOJE, entrega: ENTREGA_T4 })[0].amount, 10);
    assert.equal(aplicarEntrada({ total: 1000, entradaPct: 150, hoje: HOJE, entrega: ENTREGA_T4 })[0].amount, 990);
});

test('orçamento antigo só com entrada %: mostra o plano equivalente', () => {
    const p = planoParaMostrar({ down_payment_percent: 50 }, 2000, HOJE, ENTREGA_T4)!;
    assert.deepStrictEqual(p.map(x => [x.amount, x.due]), [[1000, HOJE], [1000, ENTREGA_T4]]);
    assert.equal(planoParaMostrar({ down_payment_percent: 0 }, 2000, HOJE, ENTREGA_T4), null);
    assert.equal(planoParaMostrar({ down_payment_percent: 100 }, 2000, HOJE, ENTREGA_T4), null);
    const proprio = [{ label: 'À vista', amount: 2000, due: ENTREGA_T4 }];
    assert.equal(planoParaMostrar({ payment_plan: proprio, down_payment_percent: 50 }, 2000, HOJE, ENTREGA_T4), proprio);
});

test('entrada % lida do plano = a regra de gravação de hoje (1ª parcela ÷ total)', () => {
    assert.equal(entradaPctDoPlano([{ label: 'E', amount: 300, due: HOJE }, { label: 'S', amount: 700, due: ENTREGA_T4 }], 1000), 30);
    assert.equal(entradaPctDoPlano(null, 1000), 0);
    assert.equal(entradaPctDoPlano([{ label: 'E', amount: 300, due: HOJE }], 0), 0);
});

// ─── Fix R11: a entrada se ancora na emissão ─────────────────────────────────

test('30/60 sem entrada: a entrada entra na frente e o 30/60 reescala no resto', () => {
    const plano = [
        { label: '30 dias', amount: 500, due: '2026-11-08' },
        { label: '60 dias', amount: 500, due: '2026-12-08' },
    ];
    const p = aplicarEntrada({ plano, total: 1000, entradaPct: 40, hoje: HOJE, entrega: ENTREGA_T4 });
    assert.deepStrictEqual(p.map(x => [x.label, x.amount, x.due]), [
        ['Entrada (40%)', 400, HOJE], ['30 dias', 300, '2026-11-08'], ['60 dias', 300, '2026-12-08'],
    ]);
});

test('à vista na entrega: vira entrada na emissão + o resto na entrega', () => {
    const plano = [{ label: 'À vista', amount: 1000, due: ENTREGA_T4 }];
    const p = aplicarEntrada({ plano, total: 1000, entradaPct: 40, hoje: HOJE, entrega: ENTREGA_T4 });
    assert.deepStrictEqual(p.map(x => [x.label, x.amount, x.due]), [['Entrada (40%)', 400, HOJE], ['À vista', 600, ENTREGA_T4]]);
});

test('orçamento antigo editado hoje: a entrada nasce na emissão e continua sendo entrada', () => {
    const emissao = '2026-08-01';
    const p = aplicarEntrada({ total: 1000, entradaPct: 30, hoje: emissao, entrega: ENTREGA_T4 });
    assert.equal(p[0].due, emissao);
    const c = descreverCondicao({ payment_plan: p, total_amount: 1000, date: emissao }, HOJE);
    assert.equal(c.entrada, 300);
});

test('entrada % com referência: 1ª parcela que não vence na confirmação não é entrada', () => {
    const plano = [{ label: '30 dias', amount: 500, due: '2026-11-08' }, { label: '60 dias', amount: 500, due: '2026-12-08' }];
    assert.equal(entradaPctDoPlano(plano, 1000, HOJE), 0);
    assert.equal(entradaPctDoPlano(plano, 1000), 50);
    assert.equal(entradaPctDoPlano([{ label: 'E', amount: 300, due: HOJE }, { label: 'S', amount: 700, due: ENTREGA_T4 }], 1000, HOJE), 30);
});

test('orçamento antigo só com entrada %: as parcelas montadas usam o meio do orçamento, não PIX', () => {
    const p = planoParaMostrar({ down_payment_percent: 50, payment_method: 'Boleto' }, 2000, HOJE, ENTREGA_T4)!;
    assert.deepStrictEqual(p.map(x => x.method), ['Boleto', 'Boleto']);
    const semMeio = planoParaMostrar({ down_payment_percent: 50 }, 2000, HOJE, ENTREGA_T4)!;
    assert.deepStrictEqual(semMeio.map(x => x.method), ['PIX', 'PIX']);
});
