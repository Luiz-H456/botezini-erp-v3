import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolverCanonico, mapaDeCanonicos, canonico, normalizarNome, semelhanca,
    candidatosDeInsumo, apelidosDe, saldoConsolidado,
} from './apelidosDeInsumo.ts';
import type { InsumoComApelido } from './apelidosDeInsumo.ts';

const mapaDe = (is: InsumoComApelido[]) => new Map(is.map(i => [i.id, i]));

// ─── cadeia ──────────────────────────────────────────────────────────────────

test('segue a cadeia de apelidos até o oficial', () => {
    const is = [
        { id: 'a', canonical_insumo_id: 'b' },
        { id: 'b', canonical_insumo_id: 'c' },
        { id: 'c' },
    ];
    assert.equal(resolverCanonico('a', mapaDe(is)), 'c');
});

test('ciclo não trava — para no primeiro repetido', () => {
    const is = [
        { id: 'a', canonical_insumo_id: 'b' },
        { id: 'b', canonical_insumo_id: 'a' },
    ];
    assert.equal(resolverCanonico('a', mapaDe(is)), 'b');
});

test('apontar para cadastro sumido para onde estava', () => {
    assert.equal(resolverCanonico('a', mapaDe([{ id: 'a', canonical_insumo_id: 'x' }])), 'a');
});

test('o mapa resolve todos e o desconhecido é ele mesmo', () => {
    const m = mapaDeCanonicos([{ id: 'a', canonical_insumo_id: 'b' }, { id: 'b' }]);
    assert.equal(canonico('a', m), 'b');
    assert.equal(canonico('zzz', m), 'zzz');
});

// ─── normalização ────────────────────────────────────────────────────────────

test('tira composição e embalagem, que não distinguem o pano', () => {
    assert.equal(normalizarNome('BRIM LEVE 100% ALGODÃO'), 'brim leve 100');
    assert.equal(normalizarNome('Tecido Brim Leve'), 'brim leve');
});

test('nomes equivalentes têm semelhança alta', () => {
    assert.ok(semelhanca('Brim Leve', 'TECIDO BRIM LEVE') >= 0.9);
});

// ─── candidatos ──────────────────────────────────────────────────────────────

const insumos: InsumoComApelido[] = [
    { id: '1', name: 'BRIM LEVE', unit: 'm', fabric_family: 'Brim', color_tier: 'Padrão' },
    { id: '2', name: 'Tecido Brim Leve', unit: 'm' },
    { id: '3', name: 'Brim Leve', unit: 'kg' },
    { id: '4', name: 'BRIM LEVE BRANCO', unit: 'm', fabric_family: 'Brim', color_tier: 'Branco' },
    { id: '5', name: 'Linha de Costura', unit: 'un' },
];

test('nome equivalente é sugerido', () => {
    const r = candidatosDeInsumo(insumos[0], insumos);
    assert.ok(r.some(c => c.insumo.id === '2'));
});

test('faixa de cor da MESMA família nunca é sugerida', () => {
    // Branco, Padrão e Especial são cadastros separados de propósito: o metro
    // custa diferente em cada um. Mesclar apagaria a razão de existirem.
    const r = candidatosDeInsumo(insumos[0], insumos);
    assert.equal(r.some(c => c.insumo.id === '4'), false);
});

test('unidade diferente é sinalizada, não escondida', () => {
    const r = candidatosDeInsumo(insumos[0], insumos);
    const kg = r.find(c => c.insumo.id === '3');
    assert.ok(kg, 'aparece na lista');
    assert.equal(kg!.unidadeDiferente, true, 'com o aviso de que somaria metro com quilo');
});

test('material sem relação não é sugerido', () => {
    const r = candidatosDeInsumo(insumos[0], insumos);
    assert.equal(r.some(c => c.insumo.id === '5'), false);
});

test('quem já é apelido de alguém não é sugerido de novo', () => {
    const comApelido = [...insumos, { id: '6', name: 'BRIM LEVE', canonical_insumo_id: '1' }];
    const r = candidatosDeInsumo(insumos[0], comApelido);
    assert.equal(r.some(c => c.insumo.id === '6'), false);
});

test('o próprio insumo nunca aparece', () => {
    assert.equal(candidatosDeInsumo(insumos[0], insumos).some(c => c.insumo.id === '1'), false);
});

test('insumo sem nome não gera sugestão', () => {
    assert.deepEqual(candidatosDeInsumo({ id: 'x' }, insumos), []);
});

test('os apelidos de um insumo são listados', () => {
    const comApelido = [...insumos, { id: '9', name: 'Brim velho', canonical_insumo_id: '1' }];
    assert.deepEqual(apelidosDe('1', comApelido).map(i => i.id), ['9']);
});

// ─── saldo consolidado ───────────────────────────────────────────────────────

const comSaldo: InsumoComApelido[] = [
    { id: '1', name: 'BRIM', current_stock: 300, average_unit_cost: 12 },
    { id: '2', name: 'Brim', current_stock: 5, average_unit_cost: 40, canonical_insumo_id: '1' },
];

test('o estoque soma o oficial e os apelidos', () => {
    assert.equal(saldoConsolidado('1', comSaldo).estoque, 305);
});

test('o custo é ponderado pelo saldo, não média simples', () => {
    // (300×12 + 5×40) / 305 = 12,46 — a média simples daria 26, e a peça
    // pareceria o dobro do custo real.
    assert.equal(saldoConsolidado('1', comSaldo).custoMedio, 12.46);
});

test('conta quantos cadastros entraram na soma', () => {
    assert.equal(saldoConsolidado('1', comSaldo).cadastros, 2);
});

test('sem saldo nenhum, mantém o custo do oficial em vez de zerar', () => {
    const zerado = [{ id: '1', current_stock: 0, average_unit_cost: 15 }];
    const r = saldoConsolidado('1', zerado);
    assert.equal(r.estoque, 0);
    assert.equal(r.custoMedio, 15, 'zerar o custo faria a peça parecer de graça');
});

test('insumo inexistente devolve zeros sem quebrar', () => {
    assert.deepEqual(saldoConsolidado('nao-existe', comSaldo), { estoque: 0, custoMedio: 0, cadastros: 0 });
});

test('saldo fracionado não vira dízima', () => {
    const frac = [
        { id: '1', current_stock: 0.1, average_unit_cost: 10 },
        { id: '2', current_stock: 0.2, average_unit_cost: 10, canonical_insumo_id: '1' },
    ];
    assert.equal(saldoConsolidado('1', frac).estoque, 0.3);
});
