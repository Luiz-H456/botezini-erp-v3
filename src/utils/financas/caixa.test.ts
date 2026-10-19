import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caixaDoPeriodo, classificarSaida, valorDeCaixa, variacao, linhasDoRelatorio } from './caixa.ts';
import type { CategoriaResumo, ContaResumo, PagamentoResumo } from './base.ts';

const categorias: CategoriaResumo[] = [
    { id: 'tec', name: 'Tecido', custo_do_produto: true },
    { id: 'imp', name: 'Impostos' },
    { id: 'alu', name: 'Aluguel' },
    { id: 'tar', name: 'Tarifas bancárias' },
];
const conta = (id: string, c: Partial<ContaResumo>): ContaResumo => ({
    id, type: 'payable', description: id, due_date: '2026-09-01',
    original_amount: 100, remaining_amount: 0, derived_status: 'paid', ...c,
});
const contas = [
    conta('R1', { type: 'receivable' }),
    conta('P1', { global_category_id: 'tec' }),
    conta('P2', { global_category_id: 'imp' }),
    conta('P3', { global_category_id: 'alu' }),
    conta('P4', { global_category_id: 'tar' }),
    conta('P5', { category: 'Matéria Prima' }),
];
const pag = (obligation_id: string, amount: number, payment_date: string, extra: Partial<PagamentoResumo> = {}): PagamentoResumo =>
    ({ obligation_id, amount, payment_date, ...extra });

const pagamentos = [
    pag('R1', 1000, '2026-09-05'),
    pag('R1', 500, '2026-09-20', { affects_balance: false }),   // informativo: fora do caixa
    pag('P1', 300, '2026-09-10'),
    pag('P2', 100, '2026-09-11'),
    pag('P3', 200, '2026-09-12'),
    pag('P4', 10, '2026-09-13'),
    pag('P5', 50, '2026-09-14'),
    pag('P3', 80, '2026-08-30'),                                // agosto: não conta
    pag('P3', 80, '2026-09-15', { reversal_of: 'x' }),          // estorno em setembro: volta dinheiro
    pag('R1', 1000, '2026-10-01', { reversal_of: 'y' }),        // outubro: não conta
    pag('SUMIU', 999, '2026-09-01'),                            // conta inexistente: ignora
];

test('caixa de setembro', () => {
    const c = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-09'] });
    assert.equal(c.entrou, 1000);
    assert.equal(c.impostos, 100);
    assert.equal(c.custoPecas, 350);
    assert.equal(c.sobrouDaProducao, 550);
    assert.equal(c.percentualDaProducao, 55);
    assert.equal(c.despesas, 120);
    assert.equal(c.financeiras, 10);
    assert.equal(c.lucro, 420);
    assert.deepEqual(c.porCategoria, [
        { nome: 'Tecido', valor: 300 },
        { nome: 'Aluguel', valor: 120 },
        { nome: 'Impostos', valor: 100 },
        { nome: 'Matéria Prima', valor: 50 },
        { nome: 'Tarifas bancárias', valor: 10 },
    ]);
});

test('estorno conta no mês do estorno, não no do pagamento', () => {
    const agosto = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-08'] });
    assert.equal(agosto.despesas, 80);
    const outubro = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-10'] });
    assert.equal(outubro.entrou, -1000);
});

test('trimestre soma os três meses, com o estorno de setembro anulando o pagamento de agosto', () => {
    const c = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-07', '2026-08', '2026-09'] });
    assert.equal(c.entrou, 1000);
    assert.equal(c.despesas, 200);
    assert.equal(c.lucro, 340);
});

test('mês sem entrada não tem percentual', () => {
    const c = caixaDoPeriodo({ pagamentos: [], contas, categorias, meses: ['2026-07'] });
    assert.equal(c.percentualDaProducao, null);
    assert.equal(c.lucro, 0);
});

test('mais de seis categorias viram seis e Outros', () => {
    const muitas = Array.from({ length: 8 }, (_, i) => ({ id: `k${i}`, name: `Cat ${i}` }));
    const cs = muitas.map(k => conta(k.id, { global_category_id: k.id }));
    const ps = muitas.map((k, i) => pag(k.id, 80 - i * 10, '2026-09-02'));
    const c = caixaDoPeriodo({ pagamentos: ps, contas: cs, categorias: muitas, meses: ['2026-09'] });
    assert.equal(c.porCategoria.length, 7);
    assert.deepEqual(c.porCategoria[6], { nome: 'Outros', valor: 30 });
});

test('classificação e valor de caixa', () => {
    const mapa = new Map(categorias.map(k => [k.id, k]));
    assert.equal(classificarSaida(conta('a', { category: 'Juros de cartão' }), mapa), 'financeiras');
    assert.equal(classificarSaida(conta('b', { global_category_id: 'alu' }), mapa), 'despesas');
    assert.equal(valorDeCaixa(pag('a', 10, '2026-09-01', { affects_balance: false })), 0);
    assert.equal(valorDeCaixa(pag('a', 10, '2026-09-01', { reversal_of: 'z' })), -10);
});

test('Imposto no singular também é imposto, e vence custo/financeiras', () => {
    const mapa = new Map([['i1', { id: 'i1', name: 'Imposto' }], ['i2', { id: 'i2', name: 'Imposto sobre juros', custo_do_produto: true }]]);
    assert.equal(classificarSaida(conta('a', { global_category_id: 'i1' }), mapa), 'impostos');
    assert.equal(classificarSaida(conta('b', { global_category_id: 'i2' }), mapa), 'impostos');
    assert.equal(classificarSaida(conta('c', { category: 'Imposto' }), mapa), 'impostos');
});

test('categoria em texto legado herda a marca custo_do_produto da categoria global de mesmo nome', () => {
    const mapa = new Map([['g1', { id: 'g1', name: 'Tecido/Malha', custo_do_produto: true }]]);
    assert.equal(classificarSaida(conta('a', { category: 'Tecido/Malha' }), mapa), 'custo_pecas');
    assert.equal(classificarSaida(conta('c', { category: 'Aluguel' }), mapa), 'despesas');
});

test('variação contra o mês anterior', () => {
    assert.equal(variacao(420, 300), 40);
    assert.equal(variacao(-100, -200), 50);
    assert.equal(variacao(10, 0), null);
});

test('linhas do relatório em PDF fecham com o lucro', () => {
    const c = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-09'] });
    const linhas = linhasDoRelatorio(c);
    assert.equal(linhas[0].value, 1000);
    assert.equal(linhas[linhas.length - 1].value, 420);
    assert.equal(linhas[linhas.length - 1].is_total, true);
});
