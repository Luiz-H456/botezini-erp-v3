import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    montarGrade, alturaDoBloco, linhasQueCabemEm, paginarFotos, posicoesDoBloco,
} from './gradeDeFotos.ts';

/** A4 do orçamento: 210 mm menos 14 mm de margem de cada lado. */
const LARGURA_UTIL = 182;
/** De finalY = 18 até pageHeight − 16 = 281. */
const PAGINA = 263;

const g = montarGrade(LARGURA_UTIL);

const somaDasFotos = (blocos: ReturnType<typeof paginarFotos>) =>
    blocos.reduce((s, b) => s + b.quantidade, 0);

// ─── a grade ─────────────────────────────────────────────────────────────────

test('duas colunas dão célula de metade da página útil', () => {
    assert.equal(g.colunas, 2);
    assert.equal(g.larguraDaCelula, 85);
    assert.equal(g.alturaDaCelula, 110.5);
});

test('a proporção retrato é o que torna a foto grande — e alta', () => {
    assert.ok(g.alturaDaCelula > g.larguraDaCelula);
});

// ─── a conta que denuncia o bug ──────────────────────────────────────────────

test('até 4 fotos o campo inteiro cabe numa folha', () => {
    assert.ok(alturaDoBloco(g, 1) <= PAGINA);
    assert.ok(alturaDoBloco(g, 2) <= PAGINA);
});

test('TRÊS fileiras não cabem: era isto que transbordava e sumia do PDF', () => {
    assert.ok(alturaDoBloco(g, 3) > PAGINA);
    assert.ok(alturaDoBloco(g, 3) > 297, 'passa até do tamanho físico da folha');
});

// ─── quantas fileiras cabem ──────────────────────────────────────────────────

test('a folha inteira comporta duas fileiras', () => {
    assert.equal(linhasQueCabemEm(g, PAGINA), 2);
});

test('espaço menor que uma fileira não comporta nenhuma', () => {
    assert.equal(linhasQueCabemEm(g, 50), 0);
});

test('espaço para exatamente uma fileira devolve uma', () => {
    assert.equal(linhasQueCabemEm(g, alturaDoBloco(g, 1)), 1);
});

test('espaço para exatamente duas devolve duas, sem arredondar para cima', () => {
    assert.equal(linhasQueCabemEm(g, alturaDoBloco(g, 2)), 2);
    assert.equal(linhasQueCabemEm(g, alturaDoBloco(g, 2) - 1), 1);
});

// ─── paginação ───────────────────────────────────────────────────────────────

test('nenhuma foto não gera bloco', () => {
    assert.deepEqual(paginarFotos(0, g, { agora: PAGINA, emPaginaNova: PAGINA }), []);
});

test('duas fotos cabem num bloco só', () => {
    const b = paginarFotos(2, g, { agora: PAGINA, emPaginaNova: PAGINA });
    assert.equal(b.length, 1);
    assert.equal(b[0].quantidade, 2);
    assert.equal(b[0].linhas, 1);
});

test('seis fotos viram DOIS blocos em vez de transbordar', () => {
    const b = paginarFotos(6, g, { agora: PAGINA, emPaginaNova: PAGINA });
    assert.equal(b.length, 2);
    assert.deepEqual(b.map(x => x.quantidade), [4, 2]);
    assert.equal(b[1].novaPagina, true);
});

test('nenhum bloco ultrapassa a altura da folha', () => {
    for (const total of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 20]) {
        for (const bloco of paginarFotos(total, g, { agora: PAGINA, emPaginaNova: PAGINA })) {
            assert.ok(bloco.altura <= PAGINA, `${total} fotos: bloco de ${bloco.altura}mm`);
        }
    }
});

test('nenhuma foto se perde na paginação', () => {
    for (const total of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 20]) {
        const b = paginarFotos(total, g, { agora: PAGINA, emPaginaNova: PAGINA });
        assert.equal(somaDasFotos(b), total, `${total} fotos`);
    }
});

test('os blocos são contíguos: cada um começa onde o anterior parou', () => {
    const b = paginarFotos(9, g, { agora: PAGINA, emPaginaNova: PAGINA });
    let esperado = 0;
    for (const bloco of b) {
        assert.equal(bloco.inicio, esperado);
        esperado += bloco.quantidade;
    }
});

test('pouco espaço na folha corrente empurra o primeiro bloco para a próxima', () => {
    const b = paginarFotos(2, g, { agora: 40, emPaginaNova: PAGINA });
    assert.equal(b[0].novaPagina, true);
});

test('espaço suficiente aproveita a folha corrente', () => {
    const b = paginarFotos(2, g, { agora: PAGINA, emPaginaNova: PAGINA });
    assert.equal(b[0].novaPagina, false);
});

test('folha corrente com espaço para uma fileira usa e continua na próxima', () => {
    const b = paginarFotos(4, g, { agora: alturaDoBloco(g, 1), emPaginaNova: PAGINA });
    assert.equal(b.length, 2);
    assert.equal(b[0].novaPagina, false);
    assert.equal(b[0].quantidade, 2);
    assert.equal(b[1].novaPagina, true);
});

test('célula maior que a folha não trava o laço', () => {
    const gigante = montarGrade(LARGURA_UTIL, { colunas: 1, proporcao: 5 });
    const b = paginarFotos(3, gigante, { agora: 50, emPaginaNova: 60 });
    assert.deepEqual(b, []);
});

test('foto ímpar sobrando ainda entra no último bloco', () => {
    const b = paginarFotos(5, g, { agora: PAGINA, emPaginaNova: PAGINA });
    assert.equal(somaDasFotos(b), 5);
    assert.equal(b[b.length - 1].quantidade, 1);
});

// ─── posições ────────────────────────────────────────────────────────────────

test('as duas colunas da primeira fileira ficam lado a lado', () => {
    const b = paginarFotos(2, g, { agora: PAGINA, emPaginaNova: PAGINA })[0];
    const p = posicoesDoBloco(g, b, LARGURA_UTIL);
    assert.equal(p[0].y, p[1].y);
    assert.equal(p[1].x - p[0].x, g.larguraDaCelula + g.espaco);
});

test('a segunda fileira desce uma célula mais o vão', () => {
    const b = paginarFotos(4, g, { agora: PAGINA, emPaginaNova: PAGINA })[0];
    const p = posicoesDoBloco(g, b, LARGURA_UTIL);
    assert.equal(p[2].y - p[0].y, g.alturaDaCelula + g.espaco);
    assert.equal(p[2].x, p[0].x);
});

test('foto sozinha é centralizada, não encostada à esquerda', () => {
    const b = paginarFotos(1, g, { agora: PAGINA, emPaginaNova: PAGINA })[0];
    const p = posicoesDoBloco(g, b, LARGURA_UTIL);
    const sobraDireita = LARGURA_UTIL - g.recheio - (p[0].x + g.larguraDaCelula);
    assert.ok(Math.abs(sobraDireita - (p[0].x - g.recheio)) < 0.01);
});

test('nenhuma foto é desenhada fora da moldura', () => {
    for (const total of [1, 2, 3, 4, 5, 6, 9]) {
        for (const bloco of paginarFotos(total, g, { agora: PAGINA, emPaginaNova: PAGINA })) {
            for (const p of posicoesDoBloco(g, bloco, LARGURA_UTIL)) {
                assert.ok(p.x >= 0 && p.x + g.larguraDaCelula <= LARGURA_UTIL + 0.01);
                assert.ok(p.y + g.alturaDaCelula <= bloco.altura + 0.01,
                    `${total} fotos: y=${p.y} extrapola bloco de ${bloco.altura}`);
            }
        }
    }
});
