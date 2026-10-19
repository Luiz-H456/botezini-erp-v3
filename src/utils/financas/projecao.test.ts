import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projecaoDoMes, movimentosPrevistos, primeiroDiaNegativo } from './projecao.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
let n = 0;
const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: `p${++n}`, type: 'receivable', description: 'conta', due_date: HOJE,
    original_amount: 100, remaining_amount: 100, derived_status: 'open', ...c,
});

test('vencidas contam hoje, futuras no dia, fora do mês e em produção não contam', () => {
    const p = projecaoDoMes({
        livreHoje: 18420, hoje: HOJE, contas: [
            conta({ due_date: '2026-09-24', remaining_amount: 9600 }),
            conta({ due_date: '2026-10-08', remaining_amount: 2400 }),
            conta({ type: 'payable', due_date: '2026-10-04', remaining_amount: 640 }),
            conta({ type: 'payable', due_date: '2026-10-20', remaining_amount: 3000 }),
            conta({ due_date: '2026-11-02', remaining_amount: 5000 }),
            conta({ due_date: '2026-10-10', remaining_amount: 35802.05, awaiting_delivery: true }),
        ],
    });
    assert.equal(p.ate, '2026-10-31');
    assert.equal(p.pontos.length, 26);
    assert.deepEqual(p.pontos[0], { data: HOJE, saldo: 27380 });
    assert.deepEqual(p.pontos[2], { data: '2026-10-08', saldo: 29780 });
    assert.equal(p.fechaCom, 26780);
});

test('livre negativo projeta sem quebrar', () => {
    const p = projecaoDoMes({ livreHoje: -500, hoje: '2026-10-31', contas: [] });
    assert.deepEqual(p.pontos, [{ data: '2026-10-31', saldo: -500 }]);
    assert.equal(p.fechaCom, -500);
});

const contaProj = (p: Record<string, unknown>) => ({
    id: 'o1', type: 'payable', due_date: '2026-10-20', original_amount: 100, remaining_amount: 100,
    derived_status: 'open', cancelled_at: null, client_id: null, description: 'x', ...p,
}) as any;

test('só contas em aberto viram movimento; paga e cancelada ficam de fora', () => {
    const m = movimentosPrevistos([
        contaProj({}),
        contaProj({ id: 'o2', derived_status: 'paid' }),
        contaProj({ id: 'o3', derived_status: 'cancelled' }),
        contaProj({ id: 'o4', cancelled_at: '2026-10-01' }),
    ], [], '2026-10-13');
    assert.deepEqual(m.map(x => [x.data, x.valor, x.entra]), [['2026-10-20', 100, false]]);
});

test('vencida e em aberto move "hoje"; usa o que falta, não o original', () => {
    const m = movimentosPrevistos([contaProj({ due_date: '2026-10-01', remaining_amount: 40 })], [], '2026-10-13');
    assert.deepEqual(m.map(x => [x.data, x.valor]), [['2026-10-13', 40]]);
});

test('a receber entra; valor zero some', () => {
    const m = movimentosPrevistos([
        contaProj({ type: 'receivable', client_id: 'c1' }),
        contaProj({ id: 'o2', remaining_amount: 0 }),
    ], [], '2026-10-13');
    assert.equal(m.length, 1);
    assert.equal(m[0].entra, true);
});

test('primeiro dia negativo', () => {
    const pontos = [
        { data: '2026-10-13', entradas: 0, saidas: 0, saldo: 50 },
        { data: '2026-10-14', entradas: 0, saidas: 80, saldo: -30 },
        { data: '2026-10-15', entradas: 0, saidas: 10, saldo: -40 },
    ];
    assert.deepEqual(primeiroDiaNegativo(pontos), { data: '2026-10-14', saldo: -30 });
    assert.equal(primeiroDiaNegativo([{ data: '2026-10-13', entradas: 0, saidas: 0, saldo: 0 }]), null);
    assert.equal(primeiroDiaNegativo([]), null);
});
