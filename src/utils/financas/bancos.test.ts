import { test } from 'node:test';
import assert from 'node:assert/strict';
import { situacaoDosBancos } from './bancos.ts';
import type { ContaResumo } from './base.ts';

const conta = (id: string, c: Partial<ContaResumo>): ContaResumo => ({
    id, type: 'payable', description: id, due_date: '2026-10-01',
    original_amount: 1, remaining_amount: 0, derived_status: 'paid', ...c,
});

test('cada banco ativo lista as contas com pagamento nele ainda não conferidas', () => {
    const r = situacaoDosBancos({
        bancos: [
            { id: 'itau', name: 'Itaú PJ', current_balance: 24300, is_active: true },
            { id: 'nu', name: 'Nubank PJ', current_balance: 6100, is_active: true },
            { id: 'velho', name: 'Velho', current_balance: 0, is_active: false },
        ],
        contas: [
            conta('k1', { is_reconciled: false }),
            conta('k2', { derived_status: 'partial', remaining_amount: 5, is_reconciled: false }),
            conta('k3', { derived_status: 'open', remaining_amount: 1 }),
            conta('k4', { is_reconciled: false }),
            conta('k5', { derived_status: 'partial', remaining_amount: 5, is_reconciled: false }),
        ],
        contasPorObrigacao: { k1: ['nu'], k2: ['nu'], k4: ['itau', 'nu'], k5: ['itau'] },
    });
    assert.deepEqual(r, [
        { id: 'itau', nome: 'Itaú PJ', saldo: 24300, aConferir: ['k4'] },
        { id: 'nu', nome: 'Nubank PJ', saldo: 6100, aConferir: ['k1', 'k4'] },
    ]);
});
