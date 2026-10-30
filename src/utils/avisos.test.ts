import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisar, fecharAviso, ouvirAvisos, limparAvisos, someSozinho, MAXIMO_NA_TELA, type Aviso } from './avisos.ts';

const naTela = () => { let atual: Aviso[] = []; const parar = ouvirAvisos(l => { atual = l; }); parar(); return atual; };

test('erro fica até fechar; sucesso e informação somem sozinhos', () => {
    assert.equal(someSozinho('error'), false);
    assert.equal(someSozinho('success'), true);
    assert.equal(someSozinho('info'), true);
});

test('erro técnico chega traduzido; o mesmo aviso não empilha', () => {
    limparAvisos();
    avisar('duplicate key value violates unique constraint "x"', 'error');
    avisar('duplicate key value violates unique constraint "x"', 'error');
    const l = naTela();
    assert.equal(l.length, 1);
    assert.match(l[0].mensagem, /Já existe/);
    fecharAviso(l[0].id);
    assert.equal(naTela().length, 0);
});

test('no máximo 3 avisos na tela: o mais antigo sai', () => {
    limparAvisos();
    for (let i = 1; i <= MAXIMO_NA_TELA + 2; i++) avisar(`erro ${i}`, 'error');
    const l = naTela();
    assert.equal(l.length, MAXIMO_NA_TELA);
    assert.equal(l[0].mensagem, 'erro 3');
    limparAvisos();
});

test('aviso vazio não aparece', () => {
    limparAvisos();
    assert.equal(avisar('   ', 'success'), 0);
    assert.equal(naTela().length, 0);
});
