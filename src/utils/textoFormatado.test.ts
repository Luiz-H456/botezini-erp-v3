import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    linhasComRecuo, aparar, temFormatacao, aplicarTab, ESPACOS_POR_RECUO,
} from './textoFormatado.ts';

const R = ' '.repeat(ESPACOS_POR_RECUO);

// ─── leitura do recuo ────────────────────────────────────────────────────────

test('linha sem recuo fica no nível zero', () => {
    assert.deepEqual(linhasComRecuo('GOLA AZUL'), [{ texto: 'GOLA AZUL', recuo: 0 }]);
});

test('tab literal vale um nível', () => {
    assert.deepEqual(linhasComRecuo('\tPUNHO'), [{ texto: 'PUNHO', recuo: 1 }]);
});

test('quatro espaços valem o mesmo que um tab', () => {
    assert.deepEqual(linhasComRecuo(`${R}PUNHO`), [{ texto: 'PUNHO', recuo: 1 }]);
});

test('espaço sobrando não vira nível a mais', () => {
    assert.deepEqual(linhasComRecuo('  PUNHO'), [{ texto: 'PUNHO', recuo: 0 }]);
});

test('dois níveis são reconhecidos', () => {
    assert.deepEqual(linhasComRecuo(`${R}${R}DETALHE`), [{ texto: 'DETALHE', recuo: 2 }]);
});

test('a lista inteira preserva a estrutura', () => {
    assert.deepEqual(linhasComRecuo(`GOLA\n${R}AZUL\n${R}${R}COM VIÉS`), [
        { texto: 'GOLA', recuo: 0 },
        { texto: 'AZUL', recuo: 1 },
        { texto: 'COM VIÉS', recuo: 2 },
    ]);
});

test('espaço à direita é aparado, o da esquerda é recuo', () => {
    assert.deepEqual(linhasComRecuo(`${R}PUNHO   `), [{ texto: 'PUNHO', recuo: 1 }]);
});

test('quebra do Windows não vira linha fantasma', () => {
    assert.equal(linhasComRecuo('A\r\nB').length, 2);
});

test('texto vazio ou nulo não quebra', () => {
    assert.deepEqual(linhasComRecuo(''), []);
    assert.deepEqual(linhasComRecuo(null), []);
    assert.deepEqual(linhasComRecuo(undefined), []);
});

// ─── aparar ──────────────────────────────────────────────────────────────────

test('aparar tira as linhas em branco das pontas e mantém as do meio', () => {
    const linhas = linhasComRecuo('\n\nA\n\nB\n\n');
    assert.deepEqual(aparar(linhas).map(l => l.texto), ['A', '', 'B']);
});

test('aparar de tudo em branco devolve vazio', () => {
    assert.deepEqual(aparar(linhasComRecuo('\n\n  \n')), []);
});

// ─── detecção ────────────────────────────────────────────────────────────────

test('linha única e rasa não tem formatação a preservar', () => {
    assert.equal(temFormatacao('GOLA AZUL'), false);
});

test('mais de uma linha tem', () => {
    assert.equal(temFormatacao('GOLA\nPUNHO'), true);
});

test('linha única recuada tem', () => {
    assert.equal(temFormatacao(`${R}GOLA`), true);
});

// ─── Tab no campo ────────────────────────────────────────────────────────────

test('Tab com o cursor solto insere um recuo ali', () => {
    const r = aplicarTab('AB', 1, 1);
    assert.equal(r.texto, `A${R}B`);
    assert.equal(r.inicio, 1 + ESPACOS_POR_RECUO);
    assert.equal(r.fim, r.inicio);
});

test('Tab no começo da linha recua a linha', () => {
    const r = aplicarTab('GOLA', 0, 0);
    assert.equal(r.texto, `${R}GOLA`);
});

test('Tab com bloco selecionado recua todas as linhas', () => {
    const texto = 'A\nB\nC';
    const r = aplicarTab(texto, 0, texto.length);
    assert.equal(r.texto, `${R}A\n${R}B\n${R}C`);
});

test('Shift+Tab desfaz o recuo do bloco', () => {
    const texto = `${R}A\n${R}B`;
    const r = aplicarTab(texto, 0, texto.length, true);
    assert.equal(r.texto, 'A\nB');
});

test('Shift+Tab em linha sem recuo não come letra', () => {
    const r = aplicarTab('A\nB', 0, 3, true);
    assert.equal(r.texto, 'A\nB');
});

test('Shift+Tab tira tab literal também', () => {
    const r = aplicarTab('\tA', 0, 2, true);
    assert.equal(r.texto, 'A');
});

test('Shift+Tab tira no máximo um nível por vez', () => {
    const r = aplicarTab(`${R}${R}A`, 0, 10, true);
    assert.equal(r.texto, `${R}A`);
});

test('linha em branco no meio do bloco não ganha recuo pendurado', () => {
    const texto = 'A\n\nB';
    const r = aplicarTab(texto, 0, texto.length);
    assert.equal(r.texto, `${R}A\n\n${R}B`);
});

test('o bloco recuado continua selecionado por inteiro', () => {
    const texto = 'A\nB';
    const r = aplicarTab(texto, 0, 3);
    assert.equal(r.inicio, ESPACOS_POR_RECUO);
    assert.equal(r.texto.slice(r.inicio, r.fim), `A\n${R}B`);
});

test('Tab a partir do meio de uma linha alcança a linha inteira no modo bloco', () => {
    const texto = 'GOLA\nPUNHO';
    const r = aplicarTab(texto, 2, 7);
    assert.equal(r.texto, `${R}GOLA\n${R}PUNHO`);
});

test('recuar e desrecuar devolve o texto original', () => {
    const texto = 'A\nB\nC';
    const recuado = aplicarTab(texto, 0, texto.length);
    const voltou = aplicarTab(recuado.texto, 0, recuado.texto.length, true);
    assert.equal(voltou.texto, texto);
});
