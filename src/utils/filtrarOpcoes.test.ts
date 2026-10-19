import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarOpcoes } from './filtrarOpcoes.ts';

const h = (label: string, value = `__g__${label}`) => ({ value, label, isHeader: true });
const o = (label: string, group?: string) => ({ value: label, label, group });
const rotulos = (r: any[]) => r.map(x => (x.isHeader ? `# ${x.label}` : x.label));

test('cabeçalho sem item que passou na busca some', () => {
    const r = filtrarOpcoes([h('A'), o('ana', 'A'), h('SISTEMA PRISIONAL'), o('pedro', 'S')], 'ana');
    assert.deepEqual(rotulos(r), ['# A', 'ana']);
});

test('cabeçalho sem nenhum item embaixo some mesmo sem busca', () => {
    const r = filtrarOpcoes([h('A'), o('ana'), h('VAZIO'), h('B'), o('bia'), h('FIM')], '');
    assert.deepEqual(rotulos(r), ['# A', 'ana', '# B', 'bia']);
});

test('cabeçalho de setor fica enquanto algum grupo dele tem item', () => {
    const r = filtrarOpcoes([h('A'), o('ana'), h('SETOR', '__setor__crm'), h('G'), o('gil'), h('H'), o('hugo')], 'gil');
    assert.deepEqual(rotulos(r), ['# SETOR', '# G', 'gil']);
});

test('sem acento e fora de ordem', () => {
    const r = filtrarOpcoes([h('X'), o('CAMISA BRIM'), o('CALÇA')], 'brim camisa');
    assert.deepEqual(rotulos(r), ['# X', 'CAMISA BRIM']);
    assert.deepEqual(rotulos(filtrarOpcoes([o('CALÇA')], 'calca')), ['CALÇA']);
});
