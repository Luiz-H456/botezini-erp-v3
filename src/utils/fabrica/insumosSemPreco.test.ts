import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insumosSemPreco } from './insumosSemPreco.ts';

const SEM = '__sem__';
const i = (id: string, name: string, category: string | null, custo = 0) => ({ id, name, category, average_unit_cost: custo });
const lista = [
    i('a', 'Brim Leve Padrão', 'Tecidos'),
    i('b', 'Brim Leve Branco', 'Tecidos'),
    i('c', 'Linha 120', 'Linhas', 0.5),
    i('d', 'Etiqueta', null),
    i('e', 'Malha PV', 'Tecidos', 30),
];

test('preço da tabela do fornecedor conta como preço, antes do custo médio', () => {
    const r = insumosSemPreco(lista, new Map([['a', 19.1]]), '', '', SEM);
    assert.deepEqual(r.map(x => x.id), ['b', 'd'], 'a tem tabela, c e e têm custo médio');
});

test('respeita a busca (sem acento, no nome ou na categoria) e a categoria escolhida', () => {
    assert.deepEqual(insumosSemPreco(lista, new Map(), 'tecido', '', SEM).map(x => x.id), ['b', 'a']);
    assert.deepEqual(insumosSemPreco(lista, new Map(), 'padrao', '', SEM).map(x => x.id), ['a']);
    assert.deepEqual(insumosSemPreco(lista, new Map(), '', SEM, SEM).map(x => x.id), ['d']);
    assert.deepEqual(insumosSemPreco(lista, new Map(), '', 'Linhas', SEM), []);
});
