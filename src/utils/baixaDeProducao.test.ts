import test from 'node:test';
import assert from 'node:assert';
import { planejarBaixa, ROTULO_DO_MOTIVO } from './baixaDeProducao.ts';
import type { LinhaDaFicha } from './baixaDeProducao.ts';

// POLO consome 1,5 m de malha e 2 botões por peça. CALCA não tem ficha.
const ficha = (): Map<string, LinhaDaFicha[]> => new Map([
    ['polo', [{ insumo_id: 'malha', quantity: 1.5 }, { insumo_id: 'botao', quantity: 2 }]],
]);

// ── o caso normal ───────────────────────────────────────────────────────────

test('multiplica a ficha pelas peças do item', () => {
    const p = planejarBaixa([{ product_id: 'polo', product_name: 'POLO', quantity: 10 }], ficha());
    assert.deepStrictEqual(p.baixas, [
        { insumo_id: 'botao', quantidade: 20 },
        { insumo_id: 'malha', quantidade: 15 },
    ]);
    assert.strictEqual(p.pecasApuradas, 10);
    assert.strictEqual(p.naoApurado.length, 0);
});

test('o mesmo insumo em itens diferentes soma numa linha só', () => {
    const f = ficha();
    f.set('camisa', [{ insumo_id: 'malha', quantity: 2 }]);
    const p = planejarBaixa([
        { product_id: 'polo', product_name: 'POLO', quantity: 10 },
        { product_id: 'camisa', product_name: 'CAMISA', quantity: 5 },
    ], f);
    assert.strictEqual(p.baixas.find(b => b.insumo_id === 'malha')!.quantidade, 25);
});

test('a ordem das baixas é estável, para o mesmo pedido gerar o mesmo pedido de gravação', () => {
    const a = planejarBaixa([{ product_id: 'polo', quantity: 3 }], ficha());
    const b = planejarBaixa([{ product_id: 'polo', quantity: 3 }], ficha());
    assert.deepStrictEqual(a.baixas, b.baixas);
    assert.deepStrictEqual(a.baixas.map(x => x.insumo_id), ['botao', 'malha']);
});

test('fração na ficha não é arredondada', () => {
    const p = planejarBaixa([{ product_id: 'polo', quantity: 3 }], ficha());
    assert.strictEqual(p.baixas.find(b => b.insumo_id === 'malha')!.quantidade, 4.5);
});

// ── o que não dá para apurar ────────────────────────────────────────────────

test('produto sem ficha não baixa nada e vira pendência nomeada', () => {
    const p = planejarBaixa([{ product_id: 'calca', product_name: 'CALCA', quantity: 8 }], ficha());
    assert.deepStrictEqual(p.baixas, []);
    assert.deepStrictEqual(p.naoApurado, [
        { product_id: 'calca', product_name: 'CALCA', pecas: 8, motivo: 'sem-ficha' },
    ]);
    assert.strictEqual(p.pecasNaoApuradas, 8);
});

test('item digitado à mão, sem cadastro, é um motivo diferente de sem ficha', () => {
    const p = planejarBaixa([{ product_name: 'AVENTAL AVULSO', quantity: 4 }], ficha());
    assert.strictEqual(p.naoApurado[0].motivo, 'produto-nao-cadastrado');
    assert.strictEqual(p.naoApurado[0].product_id, null);
});

test('ficha existente mas sem quantidade é pendência, não baixa zero', () => {
    const f = new Map([['polo', [{ insumo_id: 'malha', quantity: 0 }]]]);
    const p = planejarBaixa([{ product_id: 'polo', product_name: 'POLO', quantity: 5 }], f);
    assert.deepStrictEqual(p.baixas, []);
    assert.strictEqual(p.naoApurado[0].motivo, 'ficha-sem-quantidade');
});

test('linha de ficha sem insumo_id é ignorada, e as boas continuam valendo', () => {
    const f = new Map([['polo', [
        { insumo_id: '', quantity: 3 },
        { insumo_id: 'malha', quantity: 1.5 },
    ] as LinhaDaFicha[]]]);
    const p = planejarBaixa([{ product_id: 'polo', quantity: 2 }], f);
    assert.deepStrictEqual(p.baixas, [{ insumo_id: 'malha', quantidade: 3 }]);
    assert.strictEqual(p.naoApurado.length, 0);
});

test('o mesmo produto em dois itens agrupa numa pendência só', () => {
    const p = planejarBaixa([
        { product_id: 'calca', product_name: 'CALCA', quantity: 3 },
        { product_id: 'calca', product_name: 'CALCA', quantity: 7 },
    ], ficha());
    assert.strictEqual(p.naoApurado.length, 1);
    assert.strictEqual(p.naoApurado[0].pecas, 10);
});

test('motivos diferentes do mesmo produto não se misturam', () => {
    const p = planejarBaixa([
        { product_id: 'calca', product_name: 'CALCA', quantity: 3 },
        { product_name: 'CALCA', quantity: 2 },
    ], ficha());
    assert.strictEqual(p.naoApurado.length, 2);
});

// ── pedido misto: é o caso real ─────────────────────────────────────────────

test('pedido misto baixa o que dá e registra o que não dá', () => {
    const p = planejarBaixa([
        { product_id: 'polo', product_name: 'POLO', quantity: 20 },
        { product_id: 'calca', product_name: 'CALCA', quantity: 12 },
    ], ficha());
    assert.strictEqual(p.baixas.length, 2);
    assert.strictEqual(p.pecasApuradas, 20);
    assert.strictEqual(p.pecasNaoApuradas, 12);
    assert.strictEqual(p.naoApurado.length, 1);
});

// ── bordas ──────────────────────────────────────────────────────────────────

test('quantidade zero ou negativa não consome nem vira pendência', () => {
    const p = planejarBaixa([
        { product_id: 'polo', quantity: 0 },
        { product_id: 'calca', quantity: -5 },
    ], ficha());
    assert.deepStrictEqual([p.baixas, p.naoApurado], [[], []]);
    assert.strictEqual(p.pecasApuradas, 0);
    assert.strictEqual(p.pecasNaoApuradas, 0);
});

test('pedido sem itens não quebra', () => {
    for (const itens of [[], null, undefined]) {
        const p = planejarBaixa(itens, ficha());
        assert.deepStrictEqual([p.baixas, p.naoApurado], [[], []]);
    }
});

test('item sem nome ainda é identificável na lista', () => {
    const p = planejarBaixa([{ quantity: 2 }], ficha());
    assert.strictEqual(p.naoApurado[0].product_name, '(sem nome)');
});

test('quantidade em texto é lida como número', () => {
    const p = planejarBaixa([{ product_id: 'polo', quantity: '4' as any }], ficha());
    assert.strictEqual(p.baixas.find(b => b.insumo_id === 'malha')!.quantidade, 6);
});

test('todo motivo tem rótulo legível', () => {
    for (const [k, v] of Object.entries(ROTULO_DO_MOTIVO)) {
        assert.ok(v.length > 0, `motivo ${k} sem rótulo`);
    }
});
