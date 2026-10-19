import test from 'node:test';
import assert from 'node:assert';
import { planSchedule, simulateInsertion } from './pcpScheduler.ts';
import type { SchedOrder } from './pcpScheduler.ts';

const MON = '2026-08-03'; // uma segunda-feira

test('empacota respeitando a capacidade e empurra excedente p/ próxima semana', () => {
    const orders: SchedOrder[] = [
        { id: 'a', order_number: '1', deadline: '2026-12-01', pieces: 60 },
        { id: 'b', order_number: '2', deadline: '2026-12-02', pieces: 60 },
        { id: 'c', order_number: '3', deadline: '2026-12-03', pieces: 60 },
    ];
    const r = planSchedule(orders, 100, MON);
    assert.strictEqual(r.weeks.length, 3);            // 60+60 já estoura 100 → 1 por semana... na verdade 60 cabe, +60=120>100 → nova
    assert.strictEqual(r.weeks[0].orders.length, 1);  // só o 'a' (b faria 120>100)
    assert.strictEqual(r.weeks[0].week_start, MON);
    assert.strictEqual(r.weeks[1].week_start, '2026-08-10');
});

test('prioridade por prazo: mais urgente vem primeiro', () => {
    const orders: SchedOrder[] = [
        { id: 'x', order_number: '9', deadline: '2026-09-30', pieces: 10 },
        { id: 'y', order_number: '8', deadline: '2026-08-15', pieces: 10 },
    ];
    const r = planSchedule(orders, 1000, MON);
    assert.strictEqual(r.weeks[0].orders[0].order_number, '8'); // prazo mais próximo
});

test('agrupamento reduz trocas de regulagem (economia >= 0)', () => {
    // Alterna tecido por prazo; agrupar deve reduzir as trocas.
    const orders: SchedOrder[] = [
        { id: '1', order_number: '1', deadline: '2026-08-04', pieces: 10, fabric: 'A', color: 'azul' },
        { id: '2', order_number: '2', deadline: '2026-08-05', pieces: 10, fabric: 'B', color: 'azul' },
        { id: '3', order_number: '3', deadline: '2026-08-06', pieces: 10, fabric: 'A', color: 'azul' },
        { id: '4', order_number: '4', deadline: '2026-08-07', pieces: 10, fabric: 'B', color: 'azul' },
    ];
    const r = planSchedule(orders, 1000, MON); // tudo numa semana
    assert.strictEqual(r.weeks.length, 1);
    // Por prazo: A,B,A,B → 3 trocas de tecido. Agrupado: A,A,B,B → 1 troca.
    assert.strictEqual(r.setup_changes_ungrouped, 3);
    assert.strictEqual(r.setup_changes, 1);
    assert.strictEqual(r.setup_saved, 2);
});

test('marca atraso quando o fim da semana passa do prazo', () => {
    const orders: SchedOrder[] = [
        { id: 'late', order_number: '1', deadline: '2026-08-04', pieces: 10 }, // fim da 1ª semana = 09/08 > 04/08
    ];
    const r = planSchedule(orders, 1000, MON);
    assert.strictEqual(r.weeks[0].orders[0].late, true);
    assert.strictEqual(r.late_count, 1);
});

test('trava de atraso empurra o pedido para a semana da liberação', () => {
    const orders: SchedOrder[] = [
        { id: 'travado', order_number: '1', deadline: '2026-12-01', pieces: 10 },
    ];
    // Liberado só em 20/08 → semana de 17/08, que é a 3ª (índice 2).
    const r = planSchedule(orders, 1000, MON, { travado: '2026-08-20' });
    assert.strictEqual(r.weeks.length, 1);
    assert.strictEqual(r.weeks[0].week_index, 2);
    assert.strictEqual(r.weeks[0].week_start, '2026-08-17');
    assert.strictEqual(r.weeks[0].orders[0].blocked_until, '2026-08-20');
});

test('pedido travado libera a vaga para quem vem depois', () => {
    // 'a' é o mais urgente e sozinho ocuparia a semana inteira. Travado, ele
    // sai da frente e 'b' sobe — a fábrica não fica parada esperando.
    const orders: SchedOrder[] = [
        { id: 'a', order_number: '1', deadline: '2026-08-10', pieces: 100 },
        { id: 'b', order_number: '2', deadline: '2026-08-20', pieces: 100 },
    ];
    const r = planSchedule(orders, 100, MON, { a: '2026-08-10' });
    assert.strictEqual(r.weeks[0].week_index, 0);
    assert.strictEqual(r.weeks[0].orders[0].order_number, '2');  // 'b' subiu
    assert.strictEqual(r.weeks[1].orders[0].order_number, '1');  // 'a' na semana da liberação
});

test('trava já vencida não atrasa nada', () => {
    const orders: SchedOrder[] = [
        { id: 'a', order_number: '1', deadline: '2026-12-01', pieces: 10 },
    ];
    // Liberação no passado em relação ao início do plano: entra na 1ª semana.
    const r = planSchedule(orders, 1000, MON, { a: '2026-07-01' });
    assert.strictEqual(r.weeks[0].week_index, 0);
});

test('trava é idempotente: recalcular não empurra de novo', () => {
    // A trava é uma DATA, não "N dias a partir de agora" — por isso rodar o
    // motor várias vezes tem que devolver exatamente o mesmo plano.
    const orders: SchedOrder[] = [
        { id: 'a', order_number: '1', deadline: '2026-12-01', pieces: 10 },
        { id: 'b', order_number: '2', deadline: '2026-12-05', pieces: 10 },
    ];
    const travas = { a: '2026-08-25' };
    const um = planSchedule(orders, 1000, MON, travas);
    const dois = planSchedule(orders, 1000, MON, travas);
    const tres = planSchedule(orders, 1000, MON, travas);
    assert.deepStrictEqual(um, dois);
    assert.deepStrictEqual(dois, tres);
});

test('trava com data absurda não trava o laço', () => {
    const orders: SchedOrder[] = [
        { id: 'a', order_number: '1', deadline: '2026-12-01', pieces: 10 },
    ];
    const r = planSchedule(orders, 1000, MON, { a: '2130-01-01' });
    // Passa do teto de 260 semanas: o pedido não é planejado, mas o motor
    // devolve normalmente em vez de rodar para sempre.
    assert.strictEqual(r.weeks.length, 0);
});

test('simulador: mede impacto (onde cai, atrasos novos, delta)', () => {
    const base: SchedOrder[] = [
        { id: 'a', order_number: '1', deadline: '2026-09-30', pieces: 100 },
        { id: 'b', order_number: '2', deadline: '2026-10-30', pieces: 100 },
    ];
    // Novo pedido urgente e grande entra na frente e empurra o resto.
    const hypo: SchedOrder = { id: 'SIM', order_number: 'NOVO', deadline: '2026-08-06', pieces: 100 };
    const sim = simulateInsertion(base, 100, MON, hypo);
    assert.strictEqual(sim.placed_week_index, 0);       // urgente cai na 1ª semana
    assert.strictEqual(sim.delta_weeks, 1);             // empurra tudo → +1 semana
    assert.ok(sim.withNew.weeks.length === sim.baseline.weeks.length + 1);
});
