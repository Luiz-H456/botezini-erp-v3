import test from 'node:test';
import assert from 'node:assert';
import { colunaSobPonto, passouLimiteDeArraste, direcaoAutoScroll } from './kanbanDnd.ts';
import type { AreaColuna } from './kanbanDnd.ts';

const AREAS: AreaColuna[] = [
    { id: 'corte', left: 0, top: 0, right: 100, bottom: 500 },
    { id: 'costura', left: 110, top: 0, right: 210, bottom: 500 },
];

test('acha a coluna sob o ponto', () => {
    assert.strictEqual(colunaSobPonto(AREAS, 50, 250), 'corte');
    assert.strictEqual(colunaSobPonto(AREAS, 150, 250), 'costura');
});

test('borda da coluna conta como dentro', () => {
    // Soltar exatamente na linha não pode cair no vazio.
    assert.strictEqual(colunaSobPonto(AREAS, 0, 0), 'corte');
    assert.strictEqual(colunaSobPonto(AREAS, 100, 500), 'corte');
    assert.strictEqual(colunaSobPonto(AREAS, 110, 250), 'costura');
});

test('fora de qualquer coluna devolve null', () => {
    assert.strictEqual(colunaSobPonto(AREAS, 105, 250), null);   // vão entre colunas
    assert.strictEqual(colunaSobPonto(AREAS, 50, 900), null);    // abaixo do quadro
    assert.strictEqual(colunaSobPonto(AREAS, -10, 250), null);   // à esquerda
    assert.strictEqual(colunaSobPonto([], 50, 250), null);       // quadro sem colunas
});

test('movimento curto ainda é clique, não arraste', () => {
    assert.ok(!passouLimiteDeArraste(0, 0));
    assert.ok(!passouLimiteDeArraste(3, 3));   // ~4,24 px — tremida de dedo
});

test('movimento longo vira arraste, em qualquer direção', () => {
    assert.ok(passouLimiteDeArraste(6, 0));
    assert.ok(passouLimiteDeArraste(0, -6));   // para cima também conta
    assert.ok(passouLimiteDeArraste(-5, -5));  // ~7,07 px na diagonal
});

test('limite de arraste é configurável', () => {
    assert.ok(!passouLimiteDeArraste(10, 0, 20));
    assert.ok(passouLimiteDeArraste(20, 0, 20));
});

test('auto-scroll só dispara nas beiradas', () => {
    const area = { left: 0, right: 1000 };
    assert.strictEqual(direcaoAutoScroll(500, area), 0);     // meio do quadro
    assert.strictEqual(direcaoAutoScroll(10, area), -1);     // beirada esquerda
    assert.strictEqual(direcaoAutoScroll(990, area), 1);     // beirada direita
    assert.strictEqual(direcaoAutoScroll(60, area), 0);      // exatamente no fim da margem
    assert.strictEqual(direcaoAutoScroll(59, area), -1);     // um pixel dentro dela
});

test('auto-scroll respeita a origem da área', () => {
    // O quadro não começa em x=0 quando há menu lateral; a margem tem que
    // acompanhar a borda real do container, não a da janela.
    const area = { left: 300, right: 1000 };
    assert.strictEqual(direcaoAutoScroll(310, area), -1);
    assert.strictEqual(direcaoAutoScroll(400, area), 0);
});
