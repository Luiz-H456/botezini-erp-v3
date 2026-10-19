import test from 'node:test';
import assert from 'node:assert';
import { computePcpDashboard } from './pcpDashboard.ts';
import type { DashOrder } from './pcpDashboard.ts';
import type { ProductionSector } from '../types/pcp.ts';

const sectors: ProductionSector[] = [
    { id: 's1', name: 'Corte', sort_order: 0, weekly_capacity_pieces: 100, color: '#fff', is_active: true },
    { id: 's2', name: 'Costura', sort_order: 1, weekly_capacity_pieces: 100, color: '#fff', is_active: true },
];

const TODAY = '2026-08-10';

const orders: DashOrder[] = [
    { id: 'o1', order_number: '1', deadline: '2026-08-05', production_stage: 'Corte', status: 'Em Produção', items: [{ quantity: 50 }] },   // atrasado -5
    { id: 'o2', order_number: '2', deadline: '2026-08-12', production_stage: 'Costura', status: 'Em Produção', items: [{ quantity: 120 }] }, // em 2 dias
    { id: 'o3', order_number: '3', deadline: '2026-09-30', production_stage: 'Corte', status: 'Pendente', items: [{ quantity: 30 }] },       // longe
];

test('classifica atrasados e próximos pelo prazo', () => {
    const d = computePcpDashboard(orders, sectors, TODAY, 7);
    assert.strictEqual(d.late.length, 1);
    assert.strictEqual(d.late[0].order_number, '1');
    assert.strictEqual(d.late[0].days, -5);
    assert.strictEqual(d.upcoming.length, 1);
    assert.strictEqual(d.upcoming[0].order_number, '2');
});

test('ocupação da fábrica e gargalo', () => {
    const d = computePcpDashboard(orders, sectors, TODAY, 7);
    // Corte: 50+30=80 pç; Costura: 120 pç. Total 200 / cap 200 = 100%.
    assert.strictEqual(d.total_active_pieces, 200);
    assert.strictEqual(d.factory_occupancy_pct, 100);
    assert.strictEqual(d.bottleneck!.name, 'Costura'); // 120/100 = 120%
    assert.strictEqual(d.bottleneck!.occupancy_pct, 120);
});

test('contagens por status', () => {
    const d = computePcpDashboard(orders, sectors, TODAY, 7);
    assert.strictEqual(d.in_production_count, 2);
    assert.strictEqual(d.pending_count, 1);
});
