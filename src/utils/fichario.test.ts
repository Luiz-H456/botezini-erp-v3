import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarFichario } from './fichario.ts';
import type { DadosDoFichario } from './fichario.ts';

const R = (v: number) => `R$ ${v}`;
const dados: DadosDoFichario = {
    clientes: 124, sumidos: 5, produtos: 63, semFicha: 31, fornecedores: 1,
    bancos: 2, naoBatem: 1, setores: 6, gargaloSemanal: 350, categorias: 40, naoRevisadas: 0,
    mensagens: 15, metaSugerida: null,
};

test('os 8 cartões, na ordem, com contagem e o que pede atenção', () => {
    const c = montarFichario(dados, R);
    assert.deepEqual(c.map(x => x.view),
        ['clientes', 'produtos', 'fornecedores', 'bancos', 'setores', 'empresa', 'categorias', 'mensagens']);
    assert.deepEqual(c.map(x => [x.contagem, x.atencao, x.tom]), [
        ['124 clientes', '5 sumidos', 'ambar'],
        ['63 produtos', '31 sem ficha técnica', 'ambar'],
        ['1 fornecedor', null, 'neutro'],
        ['2 bancos ativos', '1 não bate', 'rosa'],
        ['6 setores', 'gargalo 350 pç/semana', 'neutro'],
        [null, null, 'neutro'],
        ['40 categorias', null, 'neutro'],
        ['15 modelos', null, 'neutro'],
    ]);
});

test('meta sugerida aparece em Minha empresa quando há sugestão', () => {
    const empresa = montarFichario({ ...dados, metaSugerida: 67000 }, R).find(x => x.view === 'empresa')!;
    assert.equal(empresa.atencao, 'meta sugerida R$ 67000');
});

test('falha ao carregar: cartões sem número nenhum, nunca zero', () => {
    const c = montarFichario(null, R);
    assert.equal(c.length, 8);
    assert.ok(c.every(x => x.contagem === null && x.atencao === null && x.tom === 'neutro'));
});

test('singular e plural', () => {
    const c = montarFichario({ ...dados, sumidos: 1, naoBatem: 2, naoRevisadas: 1, clientes: 1 }, R);
    assert.equal(c[0].contagem, '1 cliente');
    assert.equal(c[0].atencao, '1 sumido');
    assert.equal(c[3].atencao, '2 não batem');
    assert.equal(c[6].atencao, '1 não revisada');
});
