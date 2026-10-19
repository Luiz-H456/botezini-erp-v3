import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numerosDaVisaoGeral, contaNoRecorte } from './numeros.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
let n = 0;
const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: `c${++n}`, type: 'receivable', description: 'conta', due_date: HOJE,
    original_amount: 100, remaining_amount: 100, derived_status: 'open', ...c,
});

const contas = [
    conta({ due_date: '2026-09-24', remaining_amount: 9600 }),                                   // receber vencido
    conta({ due_date: '2026-10-01', remaining_amount: 4200, derived_status: 'partial' }),        // receber vencido (parcial)
    conta({ due_date: '2026-10-08', remaining_amount: 2400 }),                                   // receber 7 dias
    conta({ due_date: '2026-10-12', remaining_amount: 1000 }),                                   // hoje + 6: ainda 7 dias
    conta({ due_date: '2026-10-13', remaining_amount: 500 }),                                    // hoje + 7: fora
    conta({ due_date: '2026-09-01', remaining_amount: 35802.05, awaiting_delivery: true }),      // em produção
    conta({ type: 'payable', due_date: '2026-10-04', remaining_amount: 640 }),                   // pagar vencido
    conta({ type: 'payable', due_date: HOJE, remaining_amount: 2900 }),                          // pagar 7 dias (hoje conta)
    conta({ type: 'payable', due_date: '2026-10-02', remaining_amount: 0, derived_status: 'paid' }),
    conta({ type: 'payable', due_date: '2026-10-02', derived_status: 'cancelled' }),
];

test('os quatro números e o em produção', () => {
    const r = numerosDaVisaoGeral({ contas, nosBancos: 31900, nasCaixinhas: 13480, hoje: HOJE });
    assert.deepEqual(r.recortes.receber_vencido, { total: 13800, quantidade: 2 });
    assert.deepEqual(r.recortes.receber_7_dias, { total: 3400, quantidade: 2 });
    assert.deepEqual(r.recortes.pagar_vencido, { total: 640, quantidade: 1 });
    assert.deepEqual(r.recortes.pagar_7_dias, { total: 2900, quantidade: 1 });
    assert.deepEqual(r.emProducao, { total: 35802.05, quantidade: 1 });
    assert.equal(r.livre, 18420);
});

test('livre pode ser negativo quando as caixinhas passam do saldo', () => {
    const r = numerosDaVisaoGeral({ contas: [], nosBancos: 1000, nasCaixinhas: 1500.5, hoje: HOJE });
    assert.equal(r.livre, -500.5);
});

test('conta aguardando entrega não entra em recorte nenhum', () => {
    const c = conta({ due_date: '2026-09-01', awaiting_delivery: true });
    assert.equal(contaNoRecorte(c, 'receber_vencido', HOJE), false);
    assert.equal(contaNoRecorte(c, 'receber_7_dias', HOJE), false);
});
