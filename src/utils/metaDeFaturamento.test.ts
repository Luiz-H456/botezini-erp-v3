import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularMetaSugerida, metaSugerida, ultimosMesesFechados } from './metaDeFaturamento.ts';
import type { DadosDaMeta } from './metaDeFaturamento.ts';
import type { BaseDoEquilibrio } from './saudeDoCaixa.ts';

const mes = (receita: number, semCusto: number, custoVar: number, fixo: number): BaseDoEquilibrio => ({
    receita, receitaSemCustoConhecido: semCusto, custoVariavelDasVendas: custoVar,
    despesasFixas: [{ valor: fixo, natureza: 'fixo' }, { valor: 999, natureza: 'variavel' }],
});

test('os 3 últimos meses fechados', () => {
    assert.deepEqual(ultimosMesesFechados('2026-10-08'), [
        { de: '2026-09-01', ate: '2026-09-30' },
        { de: '2026-08-01', ate: '2026-08-31' },
        { de: '2026-07-01', ate: '2026-07-31' },
    ]);
    assert.deepEqual(ultimosMesesFechados('2026-01-15', 1), [{ de: '2025-12-01', ate: '2025-12-31' }]);
    assert.deepEqual(ultimosMesesFechados('2024-03-02', 1), [{ de: '2024-02-01', ate: '2024-02-29' }]);
});

test('caso normal: fixo médio ÷ (MC − alvo), para cima em R$ 1.000', () => {
    const m = metaSugerida([mes(100000, 0, 60000, 20000), mes(100000, 0, 60000, 20000), mes(100000, 0, 60000, 20000)], 10);
    assert.equal(m.custoFixoMedio, 20000);
    assert.equal(m.margemDeContribuicaoPct, 40);
    assert.equal(m.valor, 67000);     // 20.000 ÷ 0,30 = 66.666,67 → 67.000
    assert.equal(m.motivo, null);
    assert.equal(m.coberturaPct, 100);
    assert.equal(m.fraca, false);
});

test('a margem é medida só nas vendas com custo conhecido; cobertura baixa = estimativa fraca', () => {
    const m = metaSugerida([mes(100000, 76000, 12000, 6000)], 10);
    assert.equal(m.coberturaPct, 24);
    assert.equal(m.fraca, true);
    assert.equal(m.margemDeContribuicaoPct, 50);   // (24.000 − 12.000) ÷ 24.000
    assert.equal(m.valor, 15000);                   // 6.000 ÷ 0,40
});

test('cobertura de 29,6% é fraca: o corte compara o valor antes de arredondar', () => {
    const m = metaSugerida([mes(100000, 70400, 10000, 6000)], 10);
    assert.equal(m.coberturaPct, 30);   // a tela mostra 30%...
    assert.equal(m.fraca, true);        // ...mas a amostra ainda está abaixo do corte
});

test('sem venda com custo conhecido: sem sugestão, com o motivo', () => {
    const m = metaSugerida([mes(50000, 50000, 0, 6000)], 10);
    assert.equal(m.valor, null);
    assert.match(m.motivo!, /custo das peças/);
});

test('margem das peças não chega à alvo: sem sugestão, com os dois números', () => {
    const m = metaSugerida([mes(100000, 0, 80000, 6000)], 25);
    assert.equal(m.valor, null);
    assert.match(m.motivo!, /20%.*25%/);
});

test('quociente exato em milhar não sobe um degrau por ruído de ponto flutuante', () => {
    const m = metaSugerida([mes(100000, 0, 65000, 21000)], 0);
    assert.equal(m.margemDeContribuicaoPct, 35);
    assert.equal(m.valor, 60000);   // 21.000 ÷ 0,35 = 60.000
});

test('sem despesa fixa marcada: sem sugestão, aponta Categorias', () => {
    const m = metaSugerida([mes(100000, 0, 60000, 0)], 10);
    assert.equal(m.valor, null);
    assert.match(m.motivo!, /Categorias/);
});

// calcularMetaSugerida: os dados crus do banco até a sugestão (a Saúde do caixa e o Fichário usam esta mesma conta).
const conta = (due_date: string, valor: number, global_category_id: string) =>
    ({ type: 'payable', due_date, original_amount: valor, global_category_id });
const venda = (created_at: string) => ({
    id: `p-${created_at}`, order_number: '1', client_id: 'c1', budget_id: 'o1', created_at,
    items: [{ product_id: 'camisa', product_name: 'Camisa', quantity: 100 }],
});
const dados = (custo: number): DadosDaMeta => ({
    // 100 peças a R$ 100 em setembro (e outra venda em outubro, fora dos 3 meses fechados).
    pedidos: [venda('2026-09-10'), venda('2026-10-02')],
    orcamentos: [{ id: 'o1', items: [{ product_id: 'camisa', unit_price: 100 }] }],
    clientes: [{ id: 'c1', company_name: 'Atlética' }],
    produtos: [{ name: 'Camisa', average_unit_cost: custo }],
    categorias: [{ id: 'aluguel', name: 'Aluguel', natureza: 'fixo' }, { id: 'frete', name: 'Frete', natureza: 'variavel' }],
    // R$ 1.200 de fixo por mês; o frete (variável) e a conta fora da janela não entram no fixo.
    obrigacoes: [
        conta('2026-07-05', 1200, 'aluguel'), conta('2026-08-05', 1200, 'aluguel'), conta('2026-09-05', 1200, 'aluguel'),
        conta('2026-09-20', 5000, 'frete'), conta('2026-10-05', 9999, 'aluguel'),
    ],
});

test('calcularMetaSugerida, conta normal: só as vendas e o fixo dos 3 meses fechados', () => {
    const m = calcularMetaSugerida(dados(60), 10, '2026-10-08');
    assert.equal(m.custoFixoMedio, 1200);
    assert.equal(m.margemDeContribuicaoPct, 40);   // 10.000 de receita, 6.000 de custo
    assert.equal(m.coberturaPct, 100);
    assert.equal(m.valor, 4000);                    // 1.200 ÷ (0,40 − 0,10)
    assert.equal(m.motivo, null);
});

test('calcularMetaSugerida, margem alvo zero: fixo ÷ margem de contribuição', () => {
    const m = calcularMetaSugerida(dados(60), 0, '2026-10-08');
    assert.equal(m.margemAlvoPct, 0);
    assert.equal(m.valor, 3000);                    // 1.200 ÷ 0,40
});

test('calcularMetaSugerida, produto sem custo cadastrado: sem sugestão', () => {
    const m = calcularMetaSugerida(dados(0), 10, '2026-10-08');
    assert.equal(m.valor, null);
    assert.equal(m.coberturaPct, 0);
});
