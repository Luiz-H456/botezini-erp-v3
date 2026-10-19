import test from 'node:test';
import assert from 'node:assert';
import {
    montarQuadrantes, quadranteDe, mediana, potencialDoAjuste,
    ROTULO_DO_QUADRANTE, EXPLICACAO_DO_QUADRANTE, MINIMO_DE_PRODUTOS,
} from './quadranteDeProdutos.ts';
import type { ProdutoNoQuadrante } from './quadranteDeProdutos.ts';

const p = (
    produto: string, pecas: number, margemPct: number, precoMedio = 50,
): ProdutoNoQuadrante => ({
    produto, pecas, margemPct, precoMedio,
    contribuicaoTotal: precoMedio * (margemPct / 100) * pecas,
});

// ── mediana ─────────────────────────────────────────────────────────────────

test('mediana ímpar e par', () => {
    assert.strictEqual(mediana([3, 1, 2]), 2);
    assert.strictEqual(mediana([1, 2, 3, 4]), 2.5);
});

test('mediana de lista vazia é zero, não NaN', () => {
    assert.strictEqual(mediana([]), 0);
    assert.strictEqual(mediana([NaN, 5]), 5);
});

// ── a classificação ─────────────────────────────────────────────────────────

test('volume alto e margem baixa é o canto que importa', () => {
    assert.strictEqual(quadranteDe(100, 10, 50, 30), 'ocupa-e-nao-paga');
});

test('os outros três cantos', () => {
    assert.strictEqual(quadranteDe(100, 50, 50, 30), 'carro-chefe');
    assert.strictEqual(quadranteDe(10, 50, 50, 30), 'joia-escondida');
    assert.strictEqual(quadranteDe(10, 10, 50, 30), 'cauda');
});

test('quem está exatamente na mediana conta como alto', () => {
    assert.strictEqual(quadranteDe(50, 30, 50, 30), 'carro-chefe',
        'a linha divisória não empurra ninguém para uma lista de ação');
});

test('todo quadrante tem rótulo e explicação com o que fazer', () => {
    for (const q of Object.keys(ROTULO_DO_QUADRANTE) as (keyof typeof ROTULO_DO_QUADRANTE)[]) {
        assert.ok(ROTULO_DO_QUADRANTE[q].length > 0);
        assert.ok(EXPLICACAO_DO_QUADRANTE[q].length > 20, `${q} sem orientação`);
    }
});

// ── a montagem ──────────────────────────────────────────────────────────────

test('os cortes são as medianas da própria carteira', () => {
    const q = montarQuadrantes([
        p('a', 10, 10), p('b', 20, 20), p('c', 30, 30), p('d', 40, 40), p('e', 50, 50),
    ]);
    assert.strictEqual(q.corteDeVolume, 30);
    assert.strictEqual(q.corteDeMargem, 30);
});

test('a carteira inteira acima de um limiar fixo ainda se divide ao meio', () => {
    // Todas as margens são "boas" em termos absolutos: um corte fixo de 30%
    // poria as cinco do mesmo lado e a tela não diria nada. A mediana da
    // própria carteira continua separando as piores das melhores.
    const q = montarQuadrantes([
        p('a', 50, 55), p('b', 40, 60), p('c', 30, 65), p('d', 20, 70), p('e', 10, 75),
    ]);
    assert.strictEqual(q.corteDeMargem, 65);
    assert.deepStrictEqual(
        q.porQuadrante['ocupa-e-nao-paga'].map(x => x.produto), ['a', 'b'],
        'as duas de maior volume e menor margem, mesmo com 55% e 60%');
});

test('quando volume e margem andam juntos, o canto vermelho fica vazio', () => {
    // E isso é resultado, não falha: se o que mais vende também é o que mais
    // paga, não existe produto ocupando a fábrica de graça. Forçar um ponto
    // ali seria inventar um problema.
    const q = montarQuadrantes([
        p('a', 10, 55), p('b', 20, 60), p('c', 30, 65), p('d', 40, 70), p('e', 50, 75),
    ]);
    assert.deepStrictEqual(q.porQuadrante['ocupa-e-nao-paga'], []);
    assert.strictEqual(potencialDoAjuste(q), 0);
});

test('produto sem venda não entra', () => {
    const q = montarQuadrantes([p('a', 0, 90), p('b', 10, 10), p('c', 20, 20)]);
    assert.deepStrictEqual(q.pontos.map(x => x.produto), ['b', 'c']);
});

test('cada ponto sabe seu quadrante e é agrupado', () => {
    const q = montarQuadrantes([
        p('vilao', 500, 5), p('heroi', 400, 60),
        p('joia', 5, 70), p('cauda', 3, 3), p('meio', 50, 30),
    ]);
    assert.strictEqual(q.porQuadrante['ocupa-e-nao-paga'][0].produto, 'vilao');
    assert.strictEqual(q.porQuadrante['carro-chefe'][0].produto, 'heroi');
    assert.strictEqual(q.porQuadrante['joia-escondida'][0].produto, 'joia');
    const soma = Object.values(q.porQuadrante).reduce((s, l) => s + l.length, 0);
    assert.strictEqual(soma, q.pontos.length);
});

test('no canto vermelho a ordem é por volume — o que mais ocupa a fábrica', () => {
    const q = montarQuadrantes([
        p('muito', 900, 2), p('pouco', 300, 1),
        p('x', 10, 80), p('y', 20, 90), p('z', 5, 85),
    ]);
    assert.deepStrictEqual(
        q.porQuadrante['ocupa-e-nao-paga'].map(x => x.produto), ['muito', 'pouco']);
});

test('nos outros cantos a ordem é pela contribuição total', () => {
    const q = montarQuadrantes([
        p('grande', 100, 60), p('menor', 90, 61),
        p('a', 1, 1), p('b', 2, 2), p('c', 3, 3),
    ]);
    const chefes = q.porQuadrante['carro-chefe'];
    assert.ok(chefes[0].contribuicaoTotal >= chefes[1].contribuicaoTotal);
});

test('as posições no eixo ficam entre 0 e 1', () => {
    const q = montarQuadrantes([
        p('a', 10, -20), p('b', 200, 5), p('c', 50, 40), p('d', 5, 80), p('e', 90, 15),
    ]);
    for (const ponto of q.pontos) {
        assert.ok(ponto.x >= 0 && ponto.x <= 1, `x fora: ${ponto.x}`);
        assert.ok(ponto.y >= 0 && ponto.y <= 1, `y fora: ${ponto.y}`);
    }
});

test('margem negativa não quebra a escala', () => {
    const q = montarQuadrantes([p('a', 10, -50), p('b', 20, -10), p('c', 30, 20)]);
    assert.strictEqual(q.menorMargem, -50);
    assert.ok(q.pontos.every(x => Number.isFinite(x.y)));
});

test('todos com a mesma margem não dividem por zero', () => {
    const q = montarQuadrantes([p('a', 10, 30), p('b', 20, 30), p('c', 30, 30)]);
    assert.ok(q.pontos.every(x => Number.isFinite(x.y)));
});

test('lista vazia devolve estrutura válida', () => {
    const q = montarQuadrantes([]);
    assert.deepStrictEqual(q.pontos, []);
    assert.strictEqual(q.corteDeVolume, 0);
    assert.ok(Number.isFinite(q.maiorVolume));
    assert.deepStrictEqual(montarQuadrantes(null).pontos, []);
});

// ── o potencial ─────────────────────────────────────────────────────────────

test('o potencial mede o que falta para chegar à margem mediana', () => {
    const q = montarQuadrantes([
        p('vilao', 100, 10, 50),                       // faltam 20 pontos
        p('a', 10, 30, 50), p('b', 20, 30, 50),
        p('c', 30, 50, 50), p('d', 40, 50, 50),
    ]);
    assert.strictEqual(q.corteDeMargem, 30);
    // 50 × 0,20 × 100 = 1000
    assert.strictEqual(potencialDoAjuste(q), 1000);
});

test('sem produto no canto vermelho, o potencial é zero', () => {
    const q = montarQuadrantes([p('a', 10, 50), p('b', 20, 50), p('c', 30, 50)]);
    assert.strictEqual(potencialDoAjuste(q), 0);
});

test('produto sem preço médio não entra no potencial — não há o que reajustar', () => {
    const semPreco: ProdutoNoQuadrante = {
        produto: 'x', pecas: 100, margemPct: 5, contribuicaoTotal: 0,
    };
    const q = montarQuadrantes([
        semPreco, p('a', 10, 30), p('b', 20, 30), p('c', 30, 50), p('d', 40, 50),
    ]);
    assert.strictEqual(potencialDoAjuste(q), 0);
});

test('o mínimo de produtos é uma constante que a tela consulta', () => {
    assert.ok(MINIMO_DE_PRODUTOS >= 4, 'abaixo disso a mediana separa um de dois');
});
