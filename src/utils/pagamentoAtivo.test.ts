import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ehAtivo, pagamentosAtivos, totalPago, motivoParaNaoCancelar,
} from './pagamentoAtivo.ts';
import type { LinhaDePagamento } from './pagamentoAtivo.ts';

const pago = (over: Partial<LinhaDePagamento> = {}): LinhaDePagamento => ({
    id: 'p1',
    amount: 370,
    reversed_at: null,
    reversal_of: null,
    ...over,
});

/** O par que o banco cria ao estornar: original carimbado + contra-lançamento. */
const parEstornado = (valor = 370): LinhaDePagamento[] => [
    pago({ id: 'p1', amount: valor, reversed_at: '2026-08-17T10:00:00Z' }),
    pago({ id: 'p2', amount: valor, reversal_of: 'p1' }),
];

test('pagamento normal está ativo', () => {
    assert.equal(ehAtivo(pago()), true);
});

test('pagamento estornado não está ativo', () => {
    assert.equal(ehAtivo(pago({ reversed_at: '2026-08-17T10:00:00Z' })), false);
});

test('a linha de estorno também não está ativa', () => {
    assert.equal(ehAtivo(pago({ id: 'p2', reversal_of: 'p1' })), false);
});

test('depois de estornar não sobra pagamento ativo nenhum', () => {
    assert.deepEqual(pagamentosAtivos(parEstornado()), []);
});

test('estornar zera o total pago — o contra-lançamento não toma o lugar do original', () => {
    assert.equal(totalPago(parEstornado(3700)), 0);
});

test('estorno parcial deixa de pé só o pagamento que sobrou', () => {
    const linhas = [...parEstornado(370), pago({ id: 'p3', amount: 130 })];
    assert.deepEqual(pagamentosAtivos(linhas).map(p => p.id), ['p3']);
    assert.equal(totalPago(linhas), 130);
});

test('total pago soma os ativos em centavos, sem sujeira de ponto flutuante', () => {
    const linhas = [pago({ id: 'a', amount: 0.1 }), pago({ id: 'b', amount: 0.2 })];
    assert.equal(totalPago(linhas), 0.3);
});

test('sem pagamento nenhum, cancelar está liberado', () => {
    assert.equal(motivoParaNaoCancelar([]), null);
    assert.equal(motivoParaNaoCancelar(null), null);
});

test('depois do estorno, cancelar volta a ser permitido', () => {
    assert.equal(motivoParaNaoCancelar(parEstornado()), null);
});

test('com pagamento ativo o motivo aponta o estorno como saída', () => {
    const motivo = motivoParaNaoCancelar([pago()]);
    assert.match(String(motivo), /Estorne/);
    assert.match(String(motivo), /1 pagamento lançado/);
});

test('vários pagamentos ativos pedem estornar todos', () => {
    const motivo = motivoParaNaoCancelar([pago({ id: 'a' }), pago({ id: 'b' })]);
    assert.match(String(motivo), /2 pagamentos lançados/);
    assert.match(String(motivo), /Estorne todos/);
});

test('lista vazia ou nula não quebra', () => {
    assert.deepEqual(pagamentosAtivos(undefined), []);
    assert.equal(totalPago(undefined), 0);
    assert.equal(ehAtivo(undefined), false);
});
