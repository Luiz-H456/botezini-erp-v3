import test from 'node:test';
import assert from 'node:assert';
import { margemPorProduto } from './lucratividade.ts';
import type { LinhaParaMargem } from './lucratividade.ts';

const linha = (o: Partial<LinhaParaMargem>): LinhaParaMargem => ({
    produto: 'Polo', quantidade: 1, valorUnit: 50, valorTotal: 50, precoConhecido: true, ...o,
});

test('margem é preço médio menos custo, com o percentual sobre o preço', () => {
    const r = margemPorProduto(
        [linha({ produto: 'Polo', quantidade: 10, valorUnit: 50, valorTotal: 500 })],
        new Map([['Polo', 30]]),
    );
    const [p] = r.comCusto;
    assert.strictEqual(p.precoMedio, 50);
    assert.strictEqual(p.custoUnitario, 30);
    assert.strictEqual(p.margemUnitaria, 20);
    assert.strictEqual(p.margemPct, 40);
    assert.strictEqual(p.contribuicaoTotal, 200);
});

test('preço médio é ponderado pelo volume, não média simples', () => {
    // 100 peças a R$40 e 1 a R$100: a média simples daria R$70 e mentiria.
    const r = margemPorProduto([
        linha({ produto: 'Polo', quantidade: 100, valorUnit: 40, valorTotal: 4000 }),
        linha({ produto: 'Polo', quantidade: 1, valorUnit: 100, valorTotal: 100 }),
    ], new Map([['Polo', 30]]));
    assert.strictEqual(r.comCusto[0].precoMedio, 40.59);
});

test('ordena pela margem DA PEÇA, não pelo volume vendido', () => {
    // O campeão de volume esconderia a peça de margem alta que ninguém empurra
    // — que é justamente a que a lista deve revelar.
    const r = margemPorProduto([
        linha({ produto: 'Camiseta', quantidade: 1000, valorUnit: 25, valorTotal: 25000 }),
        linha({ produto: 'Jaleco', quantidade: 5, valorUnit: 120, valorTotal: 600 }),
    ], new Map([['Camiseta', 20], ['Jaleco', 60]]));

    assert.deepStrictEqual(r.comCusto.map(p => p.produto), ['Jaleco', 'Camiseta']);
    // A contribuição total diria o contrário, e está lá para quem quiser ver.
    assert.strictEqual(r.comCusto[0].contribuicaoTotal, 300);
    assert.strictEqual(r.comCusto[1].contribuicaoTotal, 5000);
});

test('produto sem custo cadastrado sai à parte, não com margem de 100%', () => {
    // Calcular contra custo zero colocaria os mal cadastrados no topo.
    const r = margemPorProduto(
        [linha({ produto: 'Avental', quantidade: 8, valorTotal: 400 })],
        new Map(),
    );
    assert.deepStrictEqual(r.comCusto, []);
    assert.deepStrictEqual(r.semCusto, [{ produto: 'Avental', pecas: 8 }]);
});

test('custo zero conta como não cadastrado', () => {
    const r = margemPorProduto(
        [linha({ produto: 'Avental', quantidade: 8, valorTotal: 400 })],
        new Map([['Avental', 0]]),
    );
    assert.strictEqual(r.comCusto.length, 0);
    assert.strictEqual(r.semCusto.length, 1);
});

test('peça sem preço encontrado não entra na conta, mas é declarada', () => {
    const r = margemPorProduto([
        linha({ produto: 'Polo', quantidade: 10, valorTotal: 500 }),
        linha({ produto: 'Polo', quantidade: 4, valorTotal: 0, precoConhecido: false }),
    ], new Map([['Polo', 30]]));

    assert.strictEqual(r.comCusto[0].pecas, 10, 'as 4 sem preço não podem inflar o volume');
    assert.strictEqual(r.comCusto[0].precoMedio, 50);
    assert.strictEqual(r.pecasSemPreco, 4);
});

test('margem negativa aparece — é o achado mais importante da lista', () => {
    const r = margemPorProduto(
        [linha({ produto: 'Colete', quantidade: 10, valorTotal: 250 })],
        new Map([['Colete', 40]]),
    );
    assert.strictEqual(r.comCusto[0].margemUnitaria, -15);
    assert.strictEqual(r.comCusto[0].margemPct, -60);
});

test('sem linhas, devolve tudo vazio sem quebrar', () => {
    const r = margemPorProduto([], new Map([['Polo', 30]]));
    assert.deepStrictEqual(r, { comCusto: [], semCusto: [], pecasSemPreco: 0 });
});
