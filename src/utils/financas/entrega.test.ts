import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separarParcelas, planoInicial, conferirEntrega, planoMudou } from './entrega.ts';
import type { ContaResumo } from './base.ts';

const parcela = (id: string, c: Partial<ContaResumo>): ContaResumo => ({
    id, type: 'receivable', description: id, due_date: '2026-11-06',
    original_amount: 4200, remaining_amount: 4200, derived_status: 'open', payment_count: 0, ...c,
});

const entrada = parcela('e1', { due_date: '2026-09-01', remaining_amount: 0, derived_status: 'paid', payment_count: 1, installment_no: 1 });
const segunda = parcela('e2', { installment_no: 2, planned_method: 'PIX' });
const cancelada = parcela('e3', { derived_status: 'cancelled' });

test('pagas (inteira ou parcial) ficam fixas; canceladas somem', () => {
    const s = separarParcelas([segunda, cancelada, entrada]);
    assert.deepEqual(s.fixas.map(c => c.id), ['e1']);
    assert.deepEqual(s.abertas.map(c => c.id), ['e2']);
});

test('plano inicial vem das parcelas abertas e confere com o total', () => {
    const plano = planoInicial({ abertas: [segunda], fixas: [entrada], totalDoPedido: 8400, prazo: '2026-10-20' });
    assert.deepEqual(plano, [{ label: 'Parcela 2', amount: 4200, due: '2026-11-06', method: 'PIX' }]);
    assert.deepEqual(conferirEntrega({ totalDoPedido: 8400, fixas: [entrada], editaveis: plano }),
        { soma: 8400, diferenca: 0, confere: true, problema: null });
});

test('total do pedido subiu: acusa quanto falta', () => {
    const plano = planoInicial({ abertas: [segunda], fixas: [entrada], totalDoPedido: 8700, prazo: '2026-10-20' });
    const c = conferirEntrega({ totalDoPedido: 8700, fixas: [entrada], editaveis: plano });
    assert.equal(c.confere, false);
    assert.equal(c.diferenca, 300);
    assert.equal(c.problema, 'Faltam R$ 300,00');
});

test('parcela sem valor ou sem data trava antes da soma', () => {
    const c = conferirEntrega({ totalDoPedido: 8400, fixas: [entrada], editaveis: [{ label: 'P', amount: 0, due: '2026-11-06', method: 'PIX' }] });
    assert.equal(c.problema, 'Parcela 1 sem valor');
    const d = conferirEntrega({ totalDoPedido: 8400, fixas: [entrada], editaveis: [{ label: 'P', amount: 4200, due: '', method: 'PIX' }] });
    assert.equal(d.problema, 'Parcela 1 sem vencimento');
});

test('pedido sem conta nenhuma: parcela única com o total e o prazo', () => {
    assert.deepEqual(planoInicial({ abertas: [], fixas: [], totalDoPedido: 1500, prazo: '2026-10-20' }),
        [{ label: 'Parcela única', amount: 1500, due: '2026-10-20', method: 'PIX' }]);
});

test('pedido todo pago antes da entrega: nada a editar e confere', () => {
    const paga = parcela('p', { original_amount: 1500, remaining_amount: 0, derived_status: 'paid', payment_count: 1 });
    const plano = planoInicial({ abertas: [], fixas: [paga], totalDoPedido: 1500, prazo: '2026-10-20' });
    assert.deepEqual(plano, []);
    assert.equal(conferirEntrega({ totalDoPedido: 1500, fixas: [paga], editaveis: plano }).confere, true);
});

test('planoMudou só quando valor, vencimento, meio ou quantidade mudam', () => {
    const plano = planoInicial({ abertas: [segunda], fixas: [entrada], totalDoPedido: 8400, prazo: '' });
    assert.equal(planoMudou([segunda], plano), false);
    assert.equal(planoMudou([segunda], [{ ...plano[0], due: '2026-11-10' }]), true);
    assert.equal(planoMudou([segunda], [{ ...plano[0], method: 'Boleto' }]), true);
    assert.equal(planoMudou([segunda], [...plano, plano[0]]), true);
});
