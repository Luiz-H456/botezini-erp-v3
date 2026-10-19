import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alturaAoArrastar, alturaMaximaNaJanela } from './redimensionarArea.ts';

const LIM = { minima: 60, maxima: 600 };

test('puxar para CIMA aumenta a altura', () => {
    assert.equal(alturaAoArrastar(200, -50, LIM), 250);
});

test('puxar para BAIXO diminui', () => {
    assert.equal(alturaAoArrastar(200, 50, LIM), 150);
});

test('sem movimento, a altura não muda', () => {
    assert.equal(alturaAoArrastar(200, 0, LIM), 200);
});

test('o piso trava o encolhimento', () => {
    assert.equal(alturaAoArrastar(100, 500, LIM), 60);
});

test('o teto trava o crescimento', () => {
    assert.equal(alturaAoArrastar(500, -500, LIM), 600);
});

test('a altura volta em pixel inteiro', () => {
    assert.equal(alturaAoArrastar(200, -10.6, LIM), Math.round(210.6));
    assert.equal(Number.isInteger(alturaAoArrastar(200, -10.6, LIM)), true);
});

test('limites invertidos não produzem altura negativa', () => {
    assert.equal(alturaAoArrastar(200, 0, { minima: 300, maxima: 100 }), 300);
});

test('mínimo negativo é tratado como zero', () => {
    assert.equal(alturaAoArrastar(10, 500, { minima: -50, maxima: 600 }), 0);
});

test('arrastar e voltar devolve a altura original', () => {
    const meio = alturaAoArrastar(200, -80, LIM);
    assert.equal(alturaAoArrastar(meio, 80, LIM), 200);
});

// ─── borda de baixo: o sinal se inverte ──────────────────────────────────────

test('na borda de BAIXO, puxar para baixo aumenta', () => {
    assert.equal(alturaAoArrastar(200, 50, LIM, 'base'), 250);
});

test('na borda de BAIXO, puxar para cima diminui', () => {
    assert.equal(alturaAoArrastar(200, -50, LIM, 'base'), 150);
});

test('as duas bordas são espelho uma da outra', () => {
    for (const d of [-120, -30, 0, 30, 120]) {
        assert.equal(
            alturaAoArrastar(200, d, LIM, 'topo'),
            alturaAoArrastar(200, -d, LIM, 'base'),
            'delta ' + d,
        );
    }
});

test('o padrão continua sendo a borda de cima', () => {
    assert.equal(alturaAoArrastar(200, -50, LIM), alturaAoArrastar(200, -50, LIM, 'topo'));
});

test('os limites valem igual nas duas bordas', () => {
    assert.equal(alturaAoArrastar(500, 500, LIM, 'base'), 600);
    assert.equal(alturaAoArrastar(100, -500, LIM, 'base'), 60);
});

// ─── teto pela janela ────────────────────────────────────────────────────────

test('o teto é uma fração da janela, não a janela inteira', () => {
    assert.equal(alturaMaximaNaJanela(1000), 700);
});

test('janela pequena ainda garante um campo utilizável', () => {
    assert.equal(alturaMaximaNaJanela(100), 120);
});

test('janela inválida não quebra', () => {
    assert.equal(alturaMaximaNaJanela(0), 120);
    assert.equal(alturaMaximaNaJanela(NaN), 120);
});
