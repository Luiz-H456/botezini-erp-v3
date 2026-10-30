import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensagemDeErro, ehErroDeConexao } from './errorHandling.ts';

test('sem conexão: o fetch que falha não vira "acesso negado"', () => {
    assert.equal(ehErroDeConexao(new TypeError('Failed to fetch')), true);
    assert.equal(ehErroDeConexao({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), true);
    assert.equal(ehErroDeConexao(new Error('Load failed')), true);
    assert.equal(ehErroDeConexao(new Error('Invalid login credentials')), false);
    assert.match(mensagemDeErro(new TypeError('Failed to fetch'), 'x'), /Sem conexão/);
});

test('mensagens técnicas do banco viram português que diz o que fazer', () => {
    const casos: [string, RegExp][] = [
        ['duplicate key value violates unique constraint "uq_tecido_tipo_nome"', /Já existe/],
        ['update or delete on table "insumos" violates foreign key constraint "x"', /usado em outro lugar/],
        ['new row violates row-level security policy for table "compras"', /permissão/],
        ['permission denied for table tecido_precos', /permissão/],
        ['JWT expired', /sessão expirou/],
        ['new row for relation "x" violates check constraint "y"', /fora do permitido/],
        ['invalid input syntax for type numeric: "18,9"', /formato/],
        ['value too long for type character varying(60)', /tamanho/],
        ['canceling statement due to statement timeout', /demorou/],
    ];
    for (const [cru, esperado] of casos) assert.match(mensagemDeErro(new Error(cru), 'padrão'), esperado, cru);
});

test('mensagem já em português (as das nossas funções) passa como está; vazio cai no padrão', () => {
    assert.equal(mensagemDeErro(new Error('A faixa Especial já foi usada e não pode sair.'), 'x'), 'A faixa Especial já foi usada e não pode sair.');
    assert.equal(mensagemDeErro(new Error(''), 'Não consegui salvar.'), 'Não consegui salvar.');
    assert.equal(mensagemDeErro(undefined, 'Não consegui salvar.'), 'Não consegui salvar.');
    assert.equal(mensagemDeErro('texto direto', 'x'), 'texto direto');
});

test('erro do PostgREST com código (objeto, não Error) usa o código', () => {
    assert.match(mensagemDeErro({ code: '23505', message: 'duplicate key value' }, 'x'), /Já existe/);
    assert.match(mensagemDeErro({ code: '42501', message: 'x' }, 'y'), /permissão/);
});
