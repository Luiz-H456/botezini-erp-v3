import { test } from 'node:test';
import assert from 'node:assert/strict';
import { respostaCabeNaSemana } from './cabeNaSemana.ts';
import type { SimulationResult } from './pcpScheduler.ts';

const r = (placed: number, selfLate: boolean, semanas: string[]): SimulationResult => ({
    placed_week_index: placed, self_late: selfLate, newly_late: [], delta_late: 0, delta_weeks: 0,
    baseline: { weeks: [], late_count: 0, setup_changes: 0, setup_changes_ungrouped: 0, setup_saved: 0 },
    withNew: { weeks: semanas.map((w, i) => ({ week_index: i, week_start: w, orders: [], used_pieces: 0, capacity: 1, occupancy_pct: 0, overloaded: false })),
        late_count: 0, setup_changes: 0, setup_changes_ungrouped: 0, setup_saved: 0 },
});

test('cabe: diz a semana em dd/mm', () => {
    assert.deepEqual(respostaCabeNaSemana(r(1, false, ['2026-10-05', '2026-10-12']), '2026-10-30'),
        { cabe: true, texto: 'cabe na semana de 12/10' });
});

test('não cabe no prazo: diz a semana e o prazo que estoura', () => {
    assert.deepEqual(respostaCabeNaSemana(r(2, true, ['2026-10-05', '2026-10-12', '2026-10-26']), '2026-10-20'),
        { cabe: false, texto: 'só cabe na semana de 26/10 — o prazo de 20/10 estoura' });
});

test('não entrou em semana nenhuma', () => {
    assert.deepEqual(respostaCabeNaSemana(r(-1, true, []), '2026-10-20'),
        { cabe: false, texto: 'não coube no horizonte do cronograma — o prazo de 20/10 estoura' });
});
