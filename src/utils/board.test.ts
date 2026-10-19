import test from 'node:test';
import assert from 'node:assert';
import { proximaPosicaoCascata, tamanhoCanvas, tamanhoCanvasComPontos, deveAdicionarPonto, proximoZIndex, clamp, calcularRedimensionamento, pontoNaBorda, corAleatoria, duploPressionamento, normalizarRetangulo, totalmenteDentro, caixaDosPontos } from './board.ts';

test('primeira nota nasce perto do canto visivel', () => {
    const p = proximaPosicaoCascata(0, 0, 0);
    assert.deepStrictEqual(p, { pos_x: 48, pos_y: 48 });
});

test('cascata desloca a cada nota nova', () => {
    const p0 = proximaPosicaoCascata(0, 0, 0);
    const p1 = proximaPosicaoCascata(1, 0, 0);
    assert.ok(p1.pos_x > p0.pos_x);
    assert.ok(p1.pos_y > p0.pos_y);
});

test('cascata repete depois do limite, nao foge da tela', () => {
    const longe = proximaPosicaoCascata(100, 0, 0);
    // com passo 28 e limite 224, o deslocamento nunca passa de 224
    assert.ok(longe.pos_x <= 48 + 224);
    assert.ok(longe.pos_y <= 48 + 224);
});

test('cascata acompanha a posicao de rolagem da tela', () => {
    const p = proximaPosicaoCascata(0, 500, 300);
    assert.deepStrictEqual(p, { pos_x: 548, pos_y: 348 });
});

test('canvas nunca fica menor que o minimo, mesmo sem notas', () => {
    assert.deepStrictEqual(tamanhoCanvas([], 1200, 800), { largura: 1200, altura: 800 });
});

test('canvas cresce para caber a nota mais distante, com margem', () => {
    const r = tamanhoCanvas([{ pos_x: 2000, pos_y: 100, width: 240, height: 200 }], 1200, 800, 600);
    assert.strictEqual(r.largura, 2000 + 240 + 600);
    assert.strictEqual(r.altura, 100 + 200 + 600); // 900, tambem supera o minimo de 800
});

test('canvas so cresce na dimensao que a nota realmente empurra', () => {
    // nota bem a direita mas perto do topo: empurra largura, altura fica no minimo
    const r = tamanhoCanvas([{ pos_x: 2000, pos_y: 50, width: 240, height: 50 }], 1200, 800, 600);
    assert.strictEqual(r.largura, 2000 + 240 + 600);
    assert.strictEqual(r.altura, 800); // 50+50+600=700 < 800, minimo prevalece
});

test('canvas usa a MAIOR necessidade entre varias notas', () => {
    const r = tamanhoCanvas([
        { pos_x: 3000, pos_y: 100, width: 100, height: 100 },
        { pos_x: 100, pos_y: 5000, width: 100, height: 100 },
    ], 1200, 800, 0);
    assert.strictEqual(r.largura, 3100);
    assert.strictEqual(r.altura, 5100);
});

test('proximo z-index e o maior existente mais 1', () => {
    assert.strictEqual(proximoZIndex([]), 1);
    assert.strictEqual(proximoZIndex([{ z_index: 3 }, { z_index: 7 }, { z_index: 1 }]), 8);
});

test('clamp nunca deixa passar do minimo', () => {
    assert.strictEqual(clamp(-50, 0), 0);
    assert.strictEqual(clamp(50, 0), 50);
    assert.strictEqual(clamp(10, 40), 40);
});

// ── tamanhoCanvasComPontos ──────────────────────────────────────────────────

test('canvas cresce para caber um ponto de traco distante', () => {
    const r = tamanhoCanvasComPontos(1200, 800, [{ x: 5000, y: 100 }], 600);
    assert.strictEqual(r.largura, 5000 + 600);
    assert.strictEqual(r.altura, 800); // ponto perto do topo nao empurra a altura
});

test('canvas com pontos nunca fica menor que o tamanho base', () => {
    const r = tamanhoCanvasComPontos(1200, 800, [{ x: 10, y: 10 }], 600);
    assert.deepStrictEqual(r, { largura: 1200, altura: 800 });
});

// ── deveAdicionarPonto ──────────────────────────────────────────────────────

test('ponto muito perto do ultimo e descartado', () => {
    assert.strictEqual(deveAdicionarPonto({ x: 0, y: 0 }, { x: 1, y: 1 }), false);
});

test('ponto longe o bastante e aceito', () => {
    assert.strictEqual(deveAdicionarPonto({ x: 0, y: 0 }, { x: 10, y: 0 }), true);
});

test('distancia minima customizada e respeitada', () => {
    assert.strictEqual(deveAdicionarPonto({ x: 0, y: 0 }, { x: 5, y: 0 }, 10), false);
    assert.strictEqual(deveAdicionarPonto({ x: 0, y: 0 }, { x: 12, y: 0 }, 10), true);
});

// ── normalizarRetangulo ───────────────────────────────────────────────────────

test('arraste normal (esquerda pra direita, cima pra baixo)', () => {
    assert.deepStrictEqual(normalizarRetangulo(10, 10, 110, 60), { x: 10, y: 10, width: 100, height: 50 });
});

test('arraste invertido (direita pra esquerda) da o mesmo retangulo', () => {
    assert.deepStrictEqual(normalizarRetangulo(110, 10, 10, 60), { x: 10, y: 10, width: 100, height: 50 });
});

test('arraste de baixo pra cima da o mesmo retangulo', () => {
    assert.deepStrictEqual(normalizarRetangulo(10, 60, 110, 10), { x: 10, y: 10, width: 100, height: 50 });
});

test('arraste na diagonal oposta (direita-baixo para esquerda-cima)', () => {
    assert.deepStrictEqual(normalizarRetangulo(110, 60, 10, 10), { x: 10, y: 10, width: 100, height: 50 });
});

// ── totalmenteDentro ─────────────────────────────────────────────────────────

const RET = { x: 100, y: 100, width: 200, height: 200 };

test('caixa totalmente dentro do retangulo e selecionada', () => {
    assert.strictEqual(totalmenteDentro({ pos_x: 120, pos_y: 120, width: 50, height: 50 }, RET), true);
});

test('caixa que atravessa a borda NAO e selecionada, mesmo com a maior parte dentro', () => {
    // comeca dentro mas a borda direita passa do retangulo (100+200=300)
    assert.strictEqual(totalmenteDentro({ pos_x: 280, pos_y: 120, width: 50, height: 50 }, RET), false);
});

test('caixa totalmente fora nao e selecionada', () => {
    assert.strictEqual(totalmenteDentro({ pos_x: 1000, pos_y: 1000, width: 50, height: 50 }, RET), false);
});

test('caixa encostando exatamente na borda ainda conta (limite inclusivo)', () => {
    // de (100,100) a (300,300) - exatamente do tamanho do retangulo
    assert.strictEqual(totalmenteDentro({ pos_x: 100, pos_y: 100, width: 200, height: 200 }, RET), true);
});

test('caixa maior que o proprio retangulo nunca cabe', () => {
    assert.strictEqual(totalmenteDentro({ pos_x: 100, pos_y: 100, width: 500, height: 500 }, RET), false);
});

// ── caixaDosPontos ───────────────────────────────────────────────────────────

test('caixa de varios pontos cobre do minimo ao maximo em cada eixo', () => {
    const c = caixaDosPontos([{ x: 10, y: 50 }, { x: 90, y: 10 }, { x: 40, y: 80 }]);
    assert.deepStrictEqual(c, { pos_x: 10, pos_y: 10, width: 80, height: 70 });
});

test('caixa de um ponto so tem largura e altura zero', () => {
    assert.deepStrictEqual(caixaDosPontos([{ x: 30, y: 40 }]), { pos_x: 30, pos_y: 40, width: 0, height: 0 });
});

test('caixa de lista vazia nao quebra', () => {
    assert.deepStrictEqual(caixaDosPontos([]), { pos_x: 0, pos_y: 0, width: 0, height: 0 });
});

// ── duploPressionamento ──────────────────────────────────────────────────────

test('segundo aperto dentro da janela conta como duplo', () => {
    assert.strictEqual(duploPressionamento(1000, 1300), true); // 300ms depois, janela padrao 500ms
});

test('segundo aperto fora da janela nao conta', () => {
    assert.strictEqual(duploPressionamento(1000, 1600), false); // 600ms depois
});

test('exatamente no limite da janela nao conta (< estrito)', () => {
    assert.strictEqual(duploPressionamento(1000, 1500, 500), false);
});

test('janela customizada e respeitada', () => {
    assert.strictEqual(duploPressionamento(1000, 1800, 1000), true);
    assert.strictEqual(duploPressionamento(1000, 2200, 1000), false);
});

// ── corAleatoria ──────────────────────────────────────────────────────────────

test('cor aleatoria: Math.random=0 sempre pega o primeiro item', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
        assert.strictEqual(corAleatoria(['a', 'b', 'c']), 'a');
    } finally { Math.random = original; }
});

test('cor aleatoria: Math.random perto de 1 pega o ultimo item, nunca passa do array', () => {
    const original = Math.random;
    Math.random = () => 0.999999;
    try {
        assert.strictEqual(corAleatoria(['a', 'b', 'c']), 'c');
    } finally { Math.random = original; }
});

test('cor aleatoria: resultado sempre pertence a lista de opcoes', () => {
    const opcoes = ['amber', 'emerald', 'sky', 'rose', 'violet', 'zinc'];
    for (let i = 0; i < 200; i++) {
        assert.ok(opcoes.includes(corAleatoria(opcoes)));
    }
});

// ── calcularRedimensionamento ────────────────────────────────────────────────

const CAIXA = { pos_x: 100, pos_y: 100, width: 200, height: 150 };

test('canto se (inferior-direito): so tamanho muda, posicao fixa', () => {
    const r = calcularRedimensionamento('se', CAIXA, 40, 20);
    assert.deepStrictEqual(r, { pos_x: 100, pos_y: 100, width: 240, height: 170 });
});

test('canto nw (superior-esquerdo): tamanho E posicao mudam nos dois eixos', () => {
    // arrasta o canto 30px pra esquerda e 10px pra cima (dx,dy negativos)
    const r = calcularRedimensionamento('nw', CAIXA, -30, -10);
    assert.deepStrictEqual(r, { pos_x: 70, pos_y: 90, width: 230, height: 160 });
});

test('canto ne (superior-direito): largura pela direita, altura pelo topo', () => {
    const r = calcularRedimensionamento('ne', CAIXA, 30, -10);
    assert.deepStrictEqual(r, { pos_x: 100, pos_y: 90, width: 230, height: 160 });
});

test('canto sw (inferior-esquerdo): largura pela esquerda, altura por baixo', () => {
    const r = calcularRedimensionamento('sw', CAIXA, -30, 10);
    assert.deepStrictEqual(r, { pos_x: 70, pos_y: 100, width: 230, height: 160 });
});

test('resize nao encolhe alem do minimo, e a posicao acompanha o tamanho real', () => {
    // empurra o canto nw MUITO para dentro — largura tentaria ir a 200-190=10,
    // abaixo do minimo de 140. pos_x deve mover so o que a largura realmente encolheu.
    const r = calcularRedimensionamento('nw', CAIXA, 190, 0, 140, 100);
    assert.strictEqual(r.width, 140);
    assert.strictEqual(r.pos_x, 100 + (200 - 140)); // 160, nao 290
});

test('canto oposto (se) nao e afetado pelo minimo do outro eixo', () => {
    const r = calcularRedimensionamento('se', CAIXA, -1000, -1000, 140, 100);
    assert.deepStrictEqual(r, { pos_x: 100, pos_y: 100, width: 140, height: 100 });
});

// ── pontoNaBorda ──────────────────────────────────────────────────────────────

test('ponto na borda: alvo bem a direita cai na borda direita, no meio da altura', () => {
    const p = pontoNaBorda({ pos_x: 0, pos_y: 0, width: 100, height: 100 }, 1000, 50);
    assert.deepStrictEqual(p, { x: 100, y: 50 });
});

test('ponto na borda: alvo bem abaixo cai na borda inferior, no meio da largura', () => {
    const p = pontoNaBorda({ pos_x: 0, pos_y: 0, width: 100, height: 100 }, 50, 1000);
    assert.deepStrictEqual(p, { x: 50, y: 100 });
});

test('ponto na borda: alvo na diagonal exata cai no canto', () => {
    const p = pontoNaBorda({ pos_x: 0, pos_y: 0, width: 100, height: 100 }, 1000, 1000);
    assert.deepStrictEqual(p, { x: 100, y: 100 });
});

test('ponto na borda: alvo no proprio centro devolve o centro, sem dividir por zero', () => {
    const p = pontoNaBorda({ pos_x: 0, pos_y: 0, width: 100, height: 100 }, 50, 50);
    assert.deepStrictEqual(p, { x: 50, y: 50 });
});

test('ponto na borda: caixa deslocada da origem', () => {
    // centro em (250,180); alvo bem a esquerda -> borda esquerda, meio da altura
    const p = pontoNaBorda({ pos_x: 200, pos_y: 100, width: 100, height: 160 }, -1000, 180);
    assert.deepStrictEqual(p, { x: 200, y: 180 });
});
