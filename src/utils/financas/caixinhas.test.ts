import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugestoesDeCaixinha, progressoDaMeta, bancoSugerido } from './caixinhas.ts';
import type { ContaResumo } from './base.ts';

test('sugere o percentual de cada caixinha com regra, arredondado no centavo', () => {
    const caixinhas = [
        { id: 'i', name: 'Impostos', balance: 0, auto_fund_pct: 15 },
        { id: 'm', name: 'Máquina', balance: 0, auto_fund_pct: 0 },
        { id: 'a', name: 'Arquivada', balance: 0, auto_fund_pct: 10, is_archived: true },
        { id: 't', name: '13º', balance: 0, auto_fund_pct: 2.5 },
    ];
    assert.deepEqual(sugestoesDeCaixinha(1000, caixinhas), [
        { caixinhaId: 'i', nome: 'Impostos', percentual: 15, valor: 150 },
        { caixinhaId: 't', nome: '13º', percentual: 2.5, valor: 25 },
    ]);
    assert.equal(sugestoesDeCaixinha(333.33, caixinhas)[0].valor, 50);
    assert.deepEqual(sugestoesDeCaixinha(0, caixinhas), []);
});

test('progresso da meta', () => {
    assert.deepEqual(progressoDaMeta({ id: 'a', name: 'a', balance: 4800, target_amount: 12000 }), { percentual: 40, meta: 12000 });
    assert.deepEqual(progressoDaMeta({ id: 'a', name: 'a', balance: 15000, target_amount: 12000 }), { percentual: 100, meta: 12000 });
    assert.equal(progressoDaMeta({ id: 'a', name: 'a', balance: 10, target_amount: 0 }), null);
});

test('banco sugerido é o do último pagamento do mesmo tipo, ignorando estorno e banco inativo', () => {
    const contas: ContaResumo[] = [
        { id: 'r1', type: 'receivable', description: '', due_date: '', original_amount: 1, remaining_amount: 0, derived_status: 'paid' },
        { id: 'p1', type: 'payable', description: '', due_date: '', original_amount: 1, remaining_amount: 0, derived_status: 'paid' },
        { id: 'r2', type: 'receivable', description: '', due_date: '', original_amount: 1, remaining_amount: 0, derived_status: 'paid' },
        { id: 'r3', type: 'receivable', description: '', due_date: '', original_amount: 1, remaining_amount: 0, derived_status: 'paid' },
    ];
    const pagamentos = [
        { obligation_id: 'r1', amount: 1, payment_date: '2026-09-10', account_id: 'itau' },
        { obligation_id: 'p1', amount: 1, payment_date: '2026-09-20', account_id: 'nu' },
        { obligation_id: 'r2', amount: 1, payment_date: '2026-09-25', account_id: 'nu', reversal_of: 'z' },
        { obligation_id: 'r3', amount: 1, payment_date: '2026-09-28', account_id: 'velho' },
    ];
    const bancosAtivos = [{ id: 'itau' }, { id: 'nu' }];
    assert.equal(bancoSugerido({ pagamentos, contas, tipo: 'receivable', bancosAtivos }), 'itau');
    assert.equal(bancoSugerido({ pagamentos, contas, tipo: 'payable', bancosAtivos }), 'nu');
    assert.equal(bancoSugerido({ pagamentos: [], contas, tipo: 'payable', bancosAtivos }), 'itau');
    assert.equal(bancoSugerido({ pagamentos: [], contas, tipo: 'payable', bancosAtivos: [] }), null);
});
