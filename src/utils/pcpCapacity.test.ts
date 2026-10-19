import test from 'node:test';
import assert from 'node:assert';
import { computeSectorLoads } from './pcpCapacity.ts';
import type { CapOrder } from './pcpCapacity.ts';
import type { ProductionSector } from '../types/pcp.ts';

const sectors: ProductionSector[] = [
    { id: 's1', name: 'Corte', sort_order: 0, weekly_capacity_pieces: 100, color: '#fff', is_active: true },
    { id: 's2', name: 'Costura', sort_order: 1, weekly_capacity_pieces: 50, color: '#fff', is_active: true },
];

test('agrega peças por estágio e calcula ocupação %', () => {
    const orders: CapOrder[] = [
        { production_stage: 'Corte', items: [{ quantity: 30 }, { quantity: 10 }] }, // 40
        { production_stage: 'Corte', items: [{ quantity: 20 }] },                    // +20 = 60
        { production_stage: 'Costura', items: [{ quantity: 60 }] },                   // 60 > 50
    ];
    const loads = computeSectorLoads(orders, sectors);
    const corte = loads.find(l => l.sector.name === 'Corte')!;
    assert.strictEqual(corte.current_pieces, 60);
    assert.strictEqual(corte.occupancy_pct, 60);   // 60/100
    assert.strictEqual(corte.orders_count, 2);
    assert.strictEqual(corte.status, 'ok');

    const costura = loads.find(l => l.sector.name === 'Costura')!;
    assert.strictEqual(costura.current_pieces, 60);
    assert.strictEqual(costura.occupancy_pct, 120); // 60/50
    assert.strictEqual(costura.status, 'sobrecarga');
});

test('setor sem pedidos fica ocioso', () => {
    const loads = computeSectorLoads([], sectors);
    assert.ok(loads.every(l => l.status === 'ocioso' && l.current_pieces === 0));
});

test('capacidade zero não quebra (0%)', () => {
    const s: ProductionSector[] = [{ id: 'x', name: 'X', sort_order: 0, weekly_capacity_pieces: 0, color: '#fff', is_active: true }];
    const loads = computeSectorLoads([{ production_stage: 'X', items: [{ quantity: 10 }] }], s);
    assert.strictEqual(loads[0].occupancy_pct, 0);
    assert.strictEqual(loads[0].current_pieces, 10);
});
