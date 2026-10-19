import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    obrigacaoTocaAConta,
    filtrarPorContaBancaria,
    indexarContasPorObrigacao,
} from './filtroPorContaBancaria.ts';

const BANCO = 'conta-banco';
const COFRE = 'conta-cofre';

test('sem filtro escolhido, tudo passa', () => {
    assert.equal(obrigacaoTocaAConta({ id: '1' }, '', {}), true);
    const lista = [{ id: '1' }, { id: '2' }];
    assert.equal(filtrarPorContaBancaria(lista, '', {}).length, 2);
});

test('acha pela conta prevista, mesmo sem nenhum pagamento', () => {
    // O caso da obrigacao em aberto: ainda nao ha dinheiro, e mesmo assim ela
    // precisa aparecer em "o que sai do banco este mes".
    assert.equal(obrigacaoTocaAConta({ id: '1', default_account_id: BANCO }, BANCO, {}), true);
});

test('acha pela conta onde o dinheiro passou, mesmo sem conta prevista', () => {
    // 454 das 610 obrigacoes reais nao tem conta prevista. Se o filtro
    // dependesse so dela, esconderia tres quartos da base.
    assert.equal(obrigacaoTocaAConta({ id: '1' }, BANCO, { '1': [BANCO] }), true);
});

test('prevista num lugar e paga noutro aparece nos dois filtros', () => {
    const ob = { id: '1', default_account_id: COFRE };
    const idx = { '1': [BANCO] };
    assert.equal(obrigacaoTocaAConta(ob, COFRE, idx), true, 'a prevista');
    assert.equal(obrigacaoTocaAConta(ob, BANCO, idx), true, 'a que pagou');
});

test('nao acha conta que a obrigacao nunca tocou', () => {
    assert.equal(obrigacaoTocaAConta({ id: '1', default_account_id: COFRE }, BANCO, {}), false);
});

test('pagamento estornado nao puxa a obrigacao para o filtro', () => {
    // Uma baixa lancada na conta errada e desfeita nao pode deixar a obrigacao
    // presa ao filtro daquela conta para sempre.
    const idx = indexarContasPorObrigacao([
        { obligation_id: '1', account_id: BANCO, reversed_at: '2026-09-01' },
    ]);
    assert.deepEqual(idx, {});
    assert.equal(obrigacaoTocaAConta({ id: '1' }, BANCO, idx), false);
});

test('a linha de estorno em si tambem nao conta', () => {
    const idx = indexarContasPorObrigacao([
        { obligation_id: '1', account_id: BANCO, reversal_of: 'pagamento-original' },
    ]);
    assert.deepEqual(idx, {});
});

test('agrupa varias contas da mesma obrigacao, sem repetir', () => {
    const idx = indexarContasPorObrigacao([
        { obligation_id: '1', account_id: BANCO },
        { obligation_id: '1', account_id: COFRE },
        { obligation_id: '1', account_id: BANCO },
        { obligation_id: '2', account_id: COFRE },
    ]);
    assert.deepEqual(idx, { '1': [BANCO, COFRE], '2': [COFRE] });
});

test('pagamento sem conta e ignorado em vez de virar chave vazia', () => {
    const idx = indexarContasPorObrigacao([
        { obligation_id: '1', account_id: null },
        { obligation_id: '1', account_id: undefined },
    ]);
    assert.deepEqual(idx, {});
});

test('filtra a lista inteira pelos dois caminhos ao mesmo tempo', () => {
    const lista = [
        { id: 'prevista-no-banco', default_account_id: BANCO },
        { id: 'paga-pelo-banco' },
        { id: 'so-no-cofre', default_account_id: COFRE },
    ];
    const idx = { 'paga-pelo-banco': [BANCO], 'so-no-cofre': [COFRE] };
    const achadas = filtrarPorContaBancaria(lista, BANCO, idx).map(o => o.id);
    assert.deepEqual(achadas, ['prevista-no-banco', 'paga-pelo-banco']);
});
