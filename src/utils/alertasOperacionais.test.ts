import test from 'node:test';
import assert from 'node:assert';
import {
    diasAte, pedidosAtrasados, insumosAbaixoDoMinimo,
} from './alertasOperacionais.ts';

const HOJE = '2026-08-27';

// ── dias ────────────────────────────────────────────────────────────────────

test('conta dias inteiros, para frente e para trás', () => {
    assert.strictEqual(diasAte(HOJE, '2026-08-30'), 3);
    assert.strictEqual(diasAte(HOJE, '2026-08-20'), -7);
    assert.strictEqual(diasAte(HOJE, HOJE), 0);
});

test('atravessa a virada do mês e do ano', () => {
    assert.strictEqual(diasAte('2026-12-30', '2027-01-02'), 3);
    assert.strictEqual(diasAte('2026-02-27', '2026-03-01'), 2);   // 2026 não é bissexto
});

test('data vazia ou inválida devolve zero em vez de NaN', () => {
    assert.strictEqual(diasAte('', '2026-01-01'), 0);
    assert.strictEqual(diasAte(HOJE, 'nada'), 0);
});

// ── pedidos atrasados ───────────────────────────────────────────────────────

test('pedido vencido e ainda aberto é atraso', () => {
    const r = pedidosAtrasados([{ id: '1', deadline: '2026-08-20', status: 'Em Produção' }], HOJE);
    assert.strictEqual(r.length, 1);
});

test('pedido entregue, concluído ou cancelado não é atraso', () => {
    const r = pedidosAtrasados([
        { id: '1', deadline: '2026-08-20', status: 'Entregue' },
        { id: '2', deadline: '2026-08-20', status: 'Concluído' },
        { id: '3', deadline: '2026-08-20', status: 'Cancelado' },
    ], HOJE);
    assert.deepStrictEqual(r, []);
});

test('prazo de hoje ainda não é atraso', () => {
    assert.deepStrictEqual(pedidosAtrasados([{ id: '1', deadline: HOJE }], HOJE), []);
});

test('pedido sem prazo não pode estar atrasado', () => {
    assert.deepStrictEqual(pedidosAtrasados([{ id: '1', deadline: null }], HOJE), []);
});

test('o mais antigo vem primeiro', () => {
    const r = pedidosAtrasados([
        { id: 'novo', deadline: '2026-08-25' },
        { id: 'velho', deadline: '2026-07-01' },
    ], HOJE);
    assert.deepStrictEqual(r.map(p => p.id), ['velho', 'novo']);
});

// ── estoque ─────────────────────────────────────────────────────────────────

test('abaixo do mínimo e no mínimo exato entram (regra do Estoque); acima não', () => {
    const r = insumosAbaixoDoMinimo([
        { id: 'a', name: 'A', current_stock: 4, min_stock: 10 },
        { id: 'b', name: 'B', current_stock: 10, min_stock: 10 },
        { id: 'c', name: 'C', current_stock: 11, min_stock: 10 },
    ]);
    assert.deepStrictEqual(r.map(i => i.id), ['a', 'b']);
});

test('mínimo zero é "ninguém definiu", não alerta', () => {
    assert.deepStrictEqual(insumosAbaixoDoMinimo([
        { id: 'a', current_stock: 0, min_stock: 0 },
        { id: 'b', current_stock: 0 },
    ]), []);
});

test('ordena pelo mais crítico em proporção, não em valor absoluto', () => {
    const r = insumosAbaixoDoMinimo([
        { id: 'quase', current_stock: 9, min_stock: 10 },     // 90%
        { id: 'zerado', current_stock: 1, min_stock: 100 },   // 1%
    ]);
    assert.deepStrictEqual(r.map(i => i.id), ['zerado', 'quase']);
});
