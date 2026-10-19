import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meioMaisUsado } from './meioDePagamento.ts';

const contas = new Map([
    ['c1', { supplier_id: 'f1' }], ['c2', { supplier_id: 'f1' }], ['c3', { supplier_id: 'f1' }],
    ['c4', { client_id: 'k1' }], ['c5', { supplier_id: 'f2' }],
]);
const pg = (obligation_id: string, method: string, payment_date = '2026-01-01', extra = {}) => ({ obligation_id, method, payment_date, ...extra });

test('devolve o meio mais frequente do parceiro', () => {
    assert.equal(meioMaisUsado([pg('c1', 'PIX'), pg('c2', 'Boleto'), pg('c3', 'Boleto'), pg('c5', 'PIX')], contas, 'f1'), 'Boleto');
    assert.equal(meioMaisUsado([pg('c4', 'Cartão')], contas, 'k1'), 'Cartão');
});

test('sem histórico do parceiro, devolve null', () => {
    assert.equal(meioMaisUsado([], contas, 'f1'), null);
    assert.equal(meioMaisUsado([pg('c5', 'PIX')], contas, 'f1'), null);
    assert.equal(meioMaisUsado([pg('c1', 'PIX')], contas, ''), null);
    assert.equal(meioMaisUsado([pg('zz', 'PIX')], contas, 'f1'), null);
});

test('estorno e pagamento estornado não contam', () => {
    const lista = [pg('c1', 'PIX', '2026-01-01', { reversed_at: '2026-01-02' }), pg('c1', 'PIX', '2026-01-02', { reversal_of: 'x' }), pg('c2', 'TED')];
    assert.equal(meioMaisUsado(lista, contas, 'f1'), 'TED');
});

test('empate fica com o pagamento mais recente', () => {
    assert.equal(meioMaisUsado([pg('c1', 'PIX', '2026-01-01'), pg('c2', 'Boleto', '2026-03-01')], contas, 'f1'), 'Boleto');
});

test('só sugere meio que o campo oferece', () => {
    const lista = [pg('c1', 'Cheque'), pg('c2', 'Cheque'), pg('c3', 'PIX')];
    assert.equal(meioMaisUsado(lista, contas, 'f1', ['PIX', 'Boleto']), 'PIX');
    assert.equal(meioMaisUsado([pg('c1', 'Cheque')], contas, 'f1', ['PIX']), null);
});
