import test from 'node:test';
import assert from 'node:assert';
import {
    precoDoItem, montarItensVendidos, resumirPorProduto, caracteristicasDoItem,
    serieMensal, ranking,
} from './itensVendidos.ts';
import type { PedidoVendido, OrcamentoRef } from './itensVendidos.ts';

const nome = (id?: string) => (id === 'c1' ? 'Hospital Santa Casa' : id === 'c2' ? 'Colégio Alfa' : '—');

test('preço vem do mesmo índice do orçamento', () => {
    const orcados = [
        { product_id: 'p1', unit_price: 40 },
        { product_id: 'p2', unit_price: 90 },
    ];
    assert.strictEqual(precoDoItem({ product_id: 'p1' }, 0, orcados), 40);
    assert.strictEqual(precoDoItem({ product_id: 'p2' }, 1, orcados), 90);
});

test('índice com produto diferente não é aceito — cai para produto+cor+tamanho', () => {
    // Orçamento reordenado depois de virar pedido: o índice apontaria para a
    // peça errada, e passar o preço de outra peça é pior que não ter preço.
    const orcados = [
        { product_id: 'p2', color: 'AZUL', size: 'M', unit_price: 90 },
        { product_id: 'p1', color: 'BRANCO', size: 'G', unit_price: 40 },
    ];
    const achado = precoDoItem({ product_id: 'p1', color: 'BRANCO', size: 'G' }, 0, orcados);
    assert.strictEqual(achado, 40);
});

test('cor e tamanho comparam sem depender de caixa', () => {
    const orcados = [{ product_id: 'p1', color: 'Azul Claro', size: 'm', unit_price: 55 }];
    assert.strictEqual(precoDoItem({ product_id: 'p1', color: 'AZUL CLARO', size: 'M' }, 9, orcados), 55);
});

test('sem orçamento, ou sem correspondência, devolve null — nunca chute', () => {
    assert.strictEqual(precoDoItem({ product_id: 'p1' }, 0, undefined), null);
    assert.strictEqual(precoDoItem({ product_id: 'p1' }, 0, []), null);
    assert.strictEqual(precoDoItem({ product_id: 'pX' }, 0, [{ product_id: 'p1', unit_price: 40 }]), null);
});

test('preço zero é preço, não ausência', () => {
    // Brinde/cortesia: 0 é um valor real e precisa ser distinguido de "não achei".
    assert.strictEqual(precoDoItem({ product_id: 'p1' }, 0, [{ product_id: 'p1', unit_price: 0 }]), 0);
});

test('características viram texto de tela', () => {
    assert.deepStrictEqual(
        caracteristicasDoItem({ sleeve_type: 'manga_curta', gender: 'masculino', fit: 'slim', has_band: true }),
        ['Manga curta', 'Masc', 'Slim', 'Faixa refletiva'],
    );
    assert.deepStrictEqual(caracteristicasDoItem({}), []);
    // has_band false não vira "sem faixa" — só o que é afirmativo aparece.
    assert.deepStrictEqual(caracteristicasDoItem({ has_band: false }), []);
});

const PEDIDOS: PedidoVendido[] = [
    {
        id: 'o1', order_number: '1001', client_id: 'c1', budget_id: 'b1',
        created_at: '2026-03-10T14:30:00Z',
        items: [
            { product_id: 'p1', product_name: 'Camisa Polo', color: 'Azul Claro', size: 'M', quantity: 20, fabric_name: 'Piquê', sleeve_type: 'manga_curta' },
            { product_id: 'p2', product_name: 'Calça', color: 'Preto', size: 'G', quantity: 5 },
        ],
    },
    {
        id: 'o2', order_number: '1002', client_id: 'c2', budget_id: 'b2',
        created_at: '2026-04-02T09:00:00Z',
        items: [
            { product_id: 'p1', product_name: 'Camisa Polo', color: 'Branco', size: 'P', quantity: 10 },
        ],
    },
];

const ORCAMENTOS: OrcamentoRef[] = [
    { id: 'b1', items: [{ product_id: 'p1', unit_price: 45 }, { product_id: 'p2', unit_price: 80 }] },
    { id: 'b2', items: [{ product_id: 'p1', unit_price: 52 }] },
];

test('achata os pedidos em uma linha por item', () => {
    const linhas = montarItensVendidos(PEDIDOS, ORCAMENTOS, nome);
    assert.strictEqual(linhas.length, 3);

    const primeira = linhas[0];
    assert.strictEqual(primeira.pedido, '1001');
    assert.strictEqual(primeira.empresa, 'Hospital Santa Casa');
    assert.strictEqual(primeira.data, '2026-03-10');   // sem hora
    assert.strictEqual(primeira.produto, 'Camisa Polo');
    assert.strictEqual(primeira.cor, 'Azul Claro');
    assert.strictEqual(primeira.quantidade, 20);
    assert.strictEqual(primeira.valorUnit, 45);
    assert.strictEqual(primeira.valorTotal, 900);
    assert.deepStrictEqual(primeira.caracteristicas, ['Manga curta']);
});

test('item sem preço encontrado é marcado, não some do relatório', () => {
    const linhas = montarItensVendidos(
        [{ id: 'o9', order_number: '9', client_id: 'c1', items: [{ product_id: 'pX', product_name: 'Avental', quantity: 3 }] }],
        [], nome,
    );
    assert.strictEqual(linhas.length, 1);
    assert.strictEqual(linhas[0].precoConhecido, false);
    assert.strictEqual(linhas[0].valorTotal, 0);
});

test('pedido sem itens não gera linha', () => {
    assert.deepStrictEqual(
        montarItensVendidos([{ id: 'o0', order_number: '0', items: [] }], [], nome), [],
    );
    assert.deepStrictEqual(
        montarItensVendidos([{ id: 'o0', order_number: '0' }], [], nome), [],
    );
});

test('resumo mostra as variações de preço do mesmo produto', () => {
    const resumo = resumirPorProduto(montarItensVendidos(PEDIDOS, ORCAMENTOS, nome));
    const polo = resumo.find(r => r.produto === 'Camisa Polo')!;

    assert.strictEqual(polo.quantidade, 30);              // 20 + 10
    assert.strictEqual(polo.valorTotal, 900 + 520);
    // Dois preços praticados para a mesma peça — é o ponto do relatório.
    assert.deepStrictEqual(polo.variacoes, [
        { valorUnit: 52, quantidade: 10, ocorrencias: 1 },
        { valorUnit: 45, quantidade: 20, ocorrencias: 1 },
    ]);
});

test('resumo ordena por faturamento, do maior para o menor', () => {
    const resumo = resumirPorProduto(montarItensVendidos(PEDIDOS, ORCAMENTOS, nome));
    assert.deepStrictEqual(resumo.map(r => r.produto), ['Camisa Polo', 'Calça']);
});

test('linha sem preço conta na quantidade mas não vira variação', () => {
    const linhas = montarItensVendidos(
        [{
            id: 'o1', order_number: '1', client_id: 'c1', budget_id: 'b1',
            items: [
                { product_id: 'p1', product_name: 'Polo', quantity: 10 },
                { product_id: 'pZ', product_name: 'Polo', quantity: 4 },   // sem preço
            ],
        }],
        [{ id: 'b1', items: [{ product_id: 'p1', unit_price: 30 }] }],
        nome,
    );
    const polo = resumirPorProduto(linhas)[0];
    assert.strictEqual(polo.quantidade, 14);
    assert.strictEqual(polo.variacoes.length, 1);
    assert.deepStrictEqual(polo.variacoes[0], { valorUnit: 30, quantidade: 10, ocorrencias: 1 });
});

// ── Séries para os gráficos ─────────────────────────────────────────────────

test('série mensal soma por mês, em ordem cronológica', () => {
    const s = serieMensal(montarItensVendidos(PEDIDOS, ORCAMENTOS, nome), 'valor');
    assert.deepStrictEqual(s.map(p => p.chave), ['2026-03', '2026-04']);
    assert.strictEqual(s[0].valor, 900 + 5 * 80);   // polo + calça de março
    assert.strictEqual(s[1].valor, 520);
    assert.strictEqual(s[0].rotulo, 'mar/26');
});

test('mês sem venda entra com zero, não some da sequência', () => {
    // Buraco na série faria março e junho virarem barras vizinhas, e "está
    // subindo" seria lido errado.
    const linhas = montarItensVendidos([
        { id: 'a', order_number: '1', created_at: '2026-01-10T00:00:00Z', items: [{ product_id: 'p', product_name: 'X', quantity: 5 }] },
        { id: 'b', order_number: '2', created_at: '2026-04-10T00:00:00Z', items: [{ product_id: 'p', product_name: 'X', quantity: 3 }] },
    ], [], nome);
    const s = serieMensal(linhas, 'pecas');
    assert.deepStrictEqual(s.map(p => p.chave), ['2026-01', '2026-02', '2026-03', '2026-04']);
    assert.deepStrictEqual(s.map(p => p.valor), [5, 0, 0, 3]);
});

test('série cruza a virada do ano sem pular mês', () => {
    const linhas = montarItensVendidos([
        { id: 'a', order_number: '1', created_at: '2025-11-05T00:00:00Z', items: [{ product_id: 'p', quantity: 1 }] },
        { id: 'b', order_number: '2', created_at: '2026-02-05T00:00:00Z', items: [{ product_id: 'p', quantity: 1 }] },
    ], [], nome);
    assert.deepStrictEqual(
        serieMensal(linhas, 'pecas').map(p => p.chave),
        ['2025-11', '2025-12', '2026-01', '2026-02'],
    );
});

test('linha sem data não entra na série nem quebra', () => {
    const linhas = montarItensVendidos(
        [{ id: 'a', order_number: '1', items: [{ product_id: 'p', quantity: 9 }] }], [], nome);
    assert.deepStrictEqual(serieMensal(linhas, 'pecas'), []);
});

test('ranking ordena por maior e corta a cauda', () => {
    const linhas = montarItensVendidos(PEDIDOS, ORCAMENTOS, nome);
    assert.deepStrictEqual(ranking(linhas, 'produto', 'valor'), [
        { nome: 'Camisa Polo', valor: 1420 },
        { nome: 'Calça', valor: 400 },
    ]);
    assert.strictEqual(ranking(linhas, 'produto', 'valor', 1).length, 1);
});

test('ranking por empresa usa a métrica pedida', () => {
    const linhas = montarItensVendidos(PEDIDOS, ORCAMENTOS, nome);
    assert.deepStrictEqual(ranking(linhas, 'empresa', 'pecas'), [
        { nome: 'Hospital Santa Casa', valor: 25 },
        { nome: 'Colégio Alfa', valor: 10 },
    ]);
});

test('ranking descarta zerados — barra de tamanho zero não é informação', () => {
    const linhas = montarItensVendidos(
        [{ id: 'a', order_number: '1', created_at: '2026-01-01T00:00:00Z',
           items: [{ product_id: 'pX', product_name: 'Sem preço', quantity: 4 }] }],
        [], nome);
    assert.deepStrictEqual(ranking(linhas, 'produto', 'valor'), []);
    // Em peças ele existe — a quantidade é real, só o preço que falta.
    assert.deepStrictEqual(ranking(linhas, 'produto', 'pecas'), [{ nome: 'Sem preço', valor: 4 }]);
});
