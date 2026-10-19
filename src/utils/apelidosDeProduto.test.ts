import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolverCanonico, mapaDeCanonicos, canonico, normalizarNome, semelhanca,
    candidatosDeApelido, apelidosDe,
} from './apelidosDeProduto.ts';
import type { ProdutoComApelido } from './apelidosDeProduto.ts';

const p = (id: string, name: string, canonical?: string | null): ProdutoComApelido =>
    ({ id, name, canonical_product_id: canonical ?? null });

// ── resolução do canônico ────────────────────────────────────────────────────

test('produto sem apelido é o próprio canônico', () => {
    const lista = [p('a', 'CAMISA BRIM')];
    assert.equal(canonico('a', mapaDeCanonicos(lista)), 'a');
});

test('apelido resolve para o oficial, inclusive em cadeia', () => {
    const lista = [p('a', 'CAMISA BRIM'), p('b', 'Camisa de Brim', 'a'), p('c', 'CAMISA BRIM PROF', 'b')];
    const m = mapaDeCanonicos(lista);
    assert.equal(canonico('b', m), 'a');
    assert.equal(canonico('c', m), 'a', 'c → b → a');
});

test('ciclo não trava a tela', () => {
    // A→B→A só é possível em duas gravações separadas; o banco barra só A→A.
    const lista = [p('a', 'X', 'b'), p('b', 'Y', 'a')];
    const m = mapaDeCanonicos(lista);
    assert.ok(['a', 'b'].includes(canonico('a', m)));
    assert.ok(['a', 'b'].includes(canonico('b', m)));
});

test('apontar para produto que sumiu não quebra', () => {
    const lista = [p('a', 'X', 'fantasma')];
    assert.equal(canonico('a', mapaDeCanonicos(lista)), 'a');
});

test('produto fora do mapa continua sendo ele mesmo', () => {
    assert.equal(canonico('desconhecido', mapaDeCanonicos([p('a', 'X')])), 'desconhecido');
    assert.equal(canonico('a', undefined), 'a');
});

test('cadeia longa demais para antes de girar', () => {
    const lista = Array.from({ length: 30 }, (_, i) =>
        p(`n${i}`, `P${i}`, i < 29 ? `n${i + 1}` : null));
    const porId = new Map(lista.map(x => [x.id, x]));
    const r = resolverCanonico('n0', porId, 5);
    assert.equal(r, 'n5', 'para no teto de saltos em vez de percorrer tudo');
});

// ── normalização ─────────────────────────────────────────────────────────────

test('normalização tira acento, caixa, pontuação e palavra de enchimento', () => {
    assert.equal(normalizarNome('Camisa de Brim Profissional'), 'camisa brim');
    assert.equal(normalizarNome('CAMISA BRIM'), 'camisa brim');
    assert.equal(normalizarNome('Calça-Jeans (Básica)'), 'calca jeans');
    assert.equal(normalizarNome(undefined), '');
    assert.equal(normalizarNome('   '), '');
});

test('semelhança é por palavra, não por letra', () => {
    // O caso que mais aparece: o nome ganha um complemento.
    assert.ok(semelhanca('CAMISA BRIM', 'CAMISA BRIM PROFISSIONAL') === 1,
        'profissional é ruído: os dois normalizam igual');
    assert.ok(semelhanca('CAMISA BRIM', 'CAMISA BRIM MANGA LONGA') >= 0.5);
    assert.ok(semelhanca('CAMISA BRIM', 'CALÇA JEANS') === 0);
    assert.equal(semelhanca('', 'CAMISA'), 0);
    assert.equal(semelhanca(undefined, undefined), 0);
});

test('semelhança é simétrica e vai de 0 a 1', () => {
    const nomes = ['CAMISA BRIM', 'Camisa de Brim', 'JALECO GABARDINE', 'CALÇA', ''];
    for (const a of nomes) for (const b of nomes) {
        const s = semelhanca(a, b);
        assert.ok(s >= 0 && s <= 1, `${a}/${b} = ${s}`);
        assert.equal(s, semelhanca(b, a), `assimétrico em ${a}/${b}`);
    }
});

// ── candidatos ───────────────────────────────────────────────────────────────

const catalogo = [
    p('a', 'CAMISA BRIM'),
    p('b', 'Camisa de Brim Profissional'),
    p('c', 'CAMISA BRIM MANGA LONGA'),
    p('d', 'JALECO GABARDINE'),
    p('e', 'Camisa Brim', 'a'),      // já é apelido de a
];

test('candidato mais óbvio vem primeiro', () => {
    const r = candidatosDeApelido(catalogo[0], catalogo);
    assert.equal(r[0].produto.id, 'b', 'nome idêntico depois de normalizado');
    assert.equal(r[0].mesmoNomeNormalizado, true);
    assert.ok(r.some(c => c.produto.id === 'c'), 'o de manga longa também é candidato');
});

test('quem já é apelido de alguém não é sugerido de novo', () => {
    const r = candidatosDeApelido(catalogo[0], catalogo);
    assert.ok(!r.some(c => c.produto.id === 'e'));
});

test('o próprio produto e o seu canônico ficam de fora', () => {
    const alvo = p('z', 'CAMISA BRIM', 'a');
    const r = candidatosDeApelido(alvo, [...catalogo, alvo]);
    assert.ok(!r.some(c => c.produto.id === 'z'), 'ele mesmo');
    assert.ok(!r.some(c => c.produto.id === 'a'), 'o canônico que já está ligado');
});

test('peça diferente não vira candidata', () => {
    const r = candidatosDeApelido(catalogo[3], catalogo);   // JALECO
    assert.deepEqual(r.map(c => c.produto.id), []);
});

test('produto sem nome não gera sugestão', () => {
    assert.deepEqual(candidatosDeApelido(p('x', ''), catalogo), []);
    assert.deepEqual(candidatosDeApelido(undefined, catalogo), []);
    assert.deepEqual(candidatosDeApelido(catalogo[0], undefined), []);
});

test('apelidos de um produto saem em ordem de nome', () => {
    const lista = [p('a', 'CAMISA BRIM'), p('z', 'Zeta', 'a'), p('m', 'Meta', 'a'), p('d', 'Outro')];
    assert.deepEqual(apelidosDe('a', lista).map(x => x.id), ['m', 'z']);
    assert.deepEqual(apelidosDe(undefined, lista), []);
    assert.deepEqual(apelidosDe('d', lista), []);
});
