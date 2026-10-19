import test from 'node:test';
import assert from 'node:assert';
import { computeOrderProgress } from './pcpProduction.ts';
import type { ProgOrder } from './pcpProduction.ts';
import type { ProductionLog } from '../types/pcp.ts';

const orders: ProgOrder[] = [
    { id: 'o1', items: [{ quantity: 100 }] },
    { id: 'o2', items: [{ quantity: 50 }, { quantity: 50 }] }, // 100
];

const mk = (order_id: string, qty_done: number, qty_expedited = 0): ProductionLog => ({
    id: Math.random().toString(), order_id, qty_done, qty_expedited, logged_at: '2026-08-01',
});

test('soma baixas por pedido e calcula saldo restante', () => {
    const logs = [mk('o1', 30), mk('o1', 20), mk('o2', 100, 40)];
    const p = computeOrderProgress(orders, logs);
    assert.strictEqual(p.get('o1')!.done, 50);
    assert.strictEqual(p.get('o1')!.remaining, 50);   // 100 - 50
    assert.strictEqual(p.get('o1')!.pct, 50);
    assert.strictEqual(p.get('o2')!.done, 100);
    assert.strictEqual(p.get('o2')!.remaining, 0);    // completo
    assert.strictEqual(p.get('o2')!.expedited, 40);
});

test('pedido sem log tem saldo = total', () => {
    const p = computeOrderProgress(orders, []);
    assert.strictEqual(p.get('o1')!.remaining, 100);
    assert.strictEqual(p.get('o1')!.pct, 0);
});

test('saldo nunca fica negativo mesmo com excesso lançado', () => {
    const p = computeOrderProgress(orders, [mk('o1', 130)]);
    assert.strictEqual(p.get('o1')!.remaining, 0);
});
