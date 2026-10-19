import test from 'node:test';
import assert from 'node:assert/strict';
import {
    comprasDoInsumo,
    historicoDeInsumo,
    serieDePrecos,
    type MovimentoDeEntrada,
} from './historicoDePrecos.ts';

const movs: MovimentoDeEntrada[] = [
    { id: 'a', insumo_id: 'tecido', type: 'IN', quantity: 100, unit_cost: 10, created_at: '2026-01-10T10:00:00Z' },
    { id: 'b', insumo_id: 'tecido', type: 'IN', quantity: 300, unit_cost: 12, created_at: '2026-03-05T10:00:00Z' },
    { id: 'c', insumo_id: 'tecido', type: 'OUT', quantity: 50, created_at: '2026-03-20T10:00:00Z' },
    { id: 'd', insumo_id: 'tecido', type: 'IN', quantity: 50, created_at: '2026-04-01T10:00:00Z' }, // ajuste, sem custo
    { id: 'e', insumo_id: 'linha', type: 'IN', quantity: 10, unit_cost: 5, created_at: '2026-02-01T10:00:00Z' },
];

test('só entradas com custo entram no histórico', () => {
    const c = comprasDoInsumo(movs, 'tecido');
    assert.equal(c.length, 2);
    assert.deepEqual(c.map(x => x.id), ['a', 'b']);   // saída e ajuste ficam de fora
});

test('as compras saem em ordem cronológica crescente', () => {
    const c = comprasDoInsumo(
        [movs[1], movs[0]] as MovimentoDeEntrada[], 'tecido');
    assert.deepEqual(c.map(x => x.data), ['2026-01-10', '2026-03-05']);
});

test('a média é ponderada pela quantidade, não pelas compras', () => {
    const h = historicoDeInsumo(movs, 'tecido')!;
    // (100×10 + 300×12) / 400 = 4600/400 = 11,50 — e não (10+12)/2 = 11
    assert.equal(h.precoMedio, 11.5);
    assert.equal(h.precoMedioSimples, 11);
    assert.equal(h.quantidadeTotal, 400);
    assert.equal(h.valorTotal, 4600);
});

test('extremos, variação e desvio do médio', () => {
    const h = historicoDeInsumo(movs, 'tecido')!;
    assert.equal(h.menorPreco, 10);
    assert.equal(h.maiorPreco, 12);
    assert.equal(h.primeiroPreco, 10);
    assert.equal(h.ultimoPreco, 12);
    assert.equal(h.variacaoPct, 20);            // de 10 para 12
    assert.equal(h.desvioDoMedioPct, 4.35);     // 12 contra 11,50
});

test('uma compra só não inventa variação', () => {
    const h = historicoDeInsumo(movs, 'linha')!;
    assert.equal(h.variacaoPct, null);
    assert.equal(h.precoMedio, 5);
    assert.equal(h.desvioDoMedioPct, 0);
});

test('insumo sem compra devolve null em vez de zeros', () => {
    assert.equal(historicoDeInsumo(movs, 'inexistente'), null);
    assert.equal(historicoDeInsumo([], 'tecido'), null);
});

test('o total gravado tem prioridade sobre qtd × unitário', () => {
    const c = comprasDoInsumo([
        { insumo_id: 'x', type: 'IN', quantity: 10, unit_cost: 10, total_cost: 120, created_at: '2026-01-01T00:00:00Z' },
    ], 'x');
    assert.equal(c[0].valorTotal, 120);   // frete/desconto que não cabe no unitário
});

test('a média acumulada só olha para trás', () => {
    const s = serieDePrecos(comprasDoInsumo(movs, 'tecido'));
    assert.equal(s.length, 2);
    assert.equal(s[0].medioAcumulado, 10);     // em janeiro a média era 10
    assert.equal(s[1].medioAcumulado, 11.5);   // só depois de março vira 11,50
    assert.deepEqual(s.map(p => p.rotulo), ['10/01', '05/03']);
});

test('data ausente não vira NaN no rótulo', () => {
    const s = serieDePrecos([{ data: '', quantidade: 1, valorUnitario: 5, valorTotal: 5 }]);
    assert.equal(s[0].rotulo, '—');
    assert.ok(Number.isFinite(s[0].medioAcumulado));
});
