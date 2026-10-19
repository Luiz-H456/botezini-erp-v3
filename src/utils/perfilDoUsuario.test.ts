import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    nomeDeExibicao, iniciais, corDoAvatar, rotuloDoCargo, semNomeProprio,
    CORES_DE_AVATAR,
} from './perfilDoUsuario.ts';

// ─── nome ────────────────────────────────────────────────────────────────────

test('o nome cadastrado manda', () => {
    assert.equal(nomeDeExibicao({ full_name: 'Marina Alves', email: 'x@y.com' }), 'Marina Alves');
});

test('sem nome, o e-mail identifica melhor que o cargo', () => {
    assert.equal(nomeDeExibicao({ email: 'marina@botezini.com', role: 'admin' }), 'Marina');
});

test('ponto e traço no e-mail viram espaço, com maiúscula em cada palavra', () => {
    assert.equal(nomeDeExibicao({ email: 'maria.eduarda@x.com' }), 'Maria Eduarda');
    assert.equal(nomeDeExibicao({ email: 'joao_pedro@x.com' }), 'Joao Pedro');
});

test('sem nome e sem e-mail, cai no cargo', () => {
    assert.equal(nomeDeExibicao({ role: 'admin' }), 'Administrador');
    assert.equal(nomeDeExibicao({ role: 'manager' }), 'Gerente');
});

test('sem nada, ainda devolve algo legível', () => {
    assert.equal(nomeDeExibicao({}), 'Usuário');
    assert.equal(nomeDeExibicao(null), 'Usuário');
});

test('nome só com espaço não conta como preenchido', () => {
    assert.equal(nomeDeExibicao({ full_name: '   ', email: 'ana@x.com' }), 'Ana');
});

test('cargo desconhecido volta como está, sem virar "Usuário"', () => {
    assert.equal(rotuloDoCargo('supervisor'), 'supervisor');
    assert.equal(rotuloDoCargo(''), 'Usuário');
});

// ─── iniciais ────────────────────────────────────────────────────────────────

test('duas palavras dão as duas iniciais', () => {
    assert.equal(iniciais({ full_name: 'Marina Alves' }), 'MA');
});

test('nome longo usa a primeira e a ÚLTIMA palavra, como se lê em português', () => {
    assert.equal(iniciais({ full_name: 'Maria Eduarda Silva' }), 'MS');
});

test('palavras de ligação não viram inicial', () => {
    assert.equal(iniciais({ full_name: 'Ana de Souza' }), 'AS');
    assert.equal(iniciais({ full_name: 'Luiz dos Santos' }), 'LS');
});

test('nome de uma palavra usa as duas primeiras letras', () => {
    assert.equal(iniciais({ full_name: 'Botezini' }), 'BO');
});

test('as iniciais acompanham o nome derivado do e-mail', () => {
    assert.equal(iniciais({ email: 'maria.eduarda@x.com' }), 'ME');
});

test('acento não quebra a inicial', () => {
    assert.equal(iniciais({ full_name: 'Ângela Ótimo' }), 'ÂÓ');
});

test('sempre há uma inicial, nunca string vazia', () => {
    for (const p of [{}, { full_name: '' }, { email: '' }, null]) {
        assert.ok(iniciais(p).length > 0, JSON.stringify(p));
    }
});

test('pontuação no nome não vira inicial', () => {
    assert.equal(iniciais({ full_name: 'J. P. Moreira' }), 'JM');
});

// ─── cor ─────────────────────────────────────────────────────────────────────

test('a mesma pessoa tem sempre a mesma cor', () => {
    const p = { full_name: 'Marina Alves' };
    assert.equal(corDoAvatar(p), corDoAvatar(p));
});

test('pessoas diferentes tendem a cores diferentes', () => {
    const cores = ['Marina Alves', 'Luiz Henrique', 'Ana Paula', 'Pedro Mattar']
        .map(n => corDoAvatar({ full_name: n }));
    assert.ok(new Set(cores).size > 1, 'todas iguais indicaria hash quebrado');
});

test('a cor sai sempre da paleta', () => {
    for (const n of ['a', 'bb', 'Marina', '', 'Zé']) {
        assert.ok(CORES_DE_AVATAR.includes(corDoAvatar({ full_name: n })));
    }
});

test('a paleta não usa âmbar — é a cor de ação do app', () => {
    for (const c of CORES_DE_AVATAR) assert.equal(/amber/.test(c), false);
});

// ─── convite a completar ─────────────────────────────────────────────────────

test('sem nome próprio, o app sabe que deve convidar a preencher', () => {
    assert.equal(semNomeProprio({ email: 'x@y.com' }), true);
    assert.equal(semNomeProprio({ full_name: 'Marina' }), false);
    assert.equal(semNomeProprio({ full_name: '  ' }), true);
});
