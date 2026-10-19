import test from 'node:test';
import assert from 'node:assert';
import {
    apurarCompletude, quantosResolvem, temCusto, porImpacto,
} from './completudeDoCadastro.ts';
import type { EntradaDaCompletude, LinhaPendente } from './completudeDoCadastro.ts';

// Cenário base: dois produtos, três insumos.
//   POLO  — tem ficha (malha), tecido escolhido na linha = malha
//   CALCA — SEM ficha
//   malha  — tem custo
//   linha  — SEM custo
//   brim   — SEM custo, nunca vendido
const base = (): EntradaDaCompletude => ({
    vendas: [],
    produtos: [
        { id: 'polo', name: 'POLO' },
        { id: 'calca', name: 'CALCA' },
    ],
    insumos: [
        { id: 'malha', name: 'MALHA', average_unit_cost: 12 },
        { id: 'linha', name: 'LINHA', average_unit_cost: 0 },
        { id: 'brim', name: 'BRIM', average_unit_cost: null },
    ],
    fichaPorProduto: new Map([['polo', ['malha']]]),
});

const venda = (p: Partial<EntradaDaCompletude['vendas'][number]> = {}) => ({
    produtoId: 'polo', quantidade: 10, faturamento: 1000, order_id: 'p1', ...p,
});

// ── temCusto ────────────────────────────────────────────────────────────────

test('custo só existe quando é número positivo', () => {
    assert.ok(temCusto({ id: 'a', average_unit_cost: 0.01 }));
    assert.ok(!temCusto({ id: 'a', average_unit_cost: 0 }));
    assert.ok(!temCusto({ id: 'a', average_unit_cost: null }));
    assert.ok(!temCusto({ id: 'a' }));
    assert.ok(!temCusto(undefined));
    assert.ok(!temCusto({ id: 'a', average_unit_cost: -5 }));
});

// ── ordem por impacto ───────────────────────────────────────────────────────

test('ordena por faturamento, não por nome', () => {
    const e = base();
    e.vendas = [
        venda({ produtoId: 'calca', faturamento: 5000, order_id: 'p1' }),
        venda({ produtoId: 'polo', faturamento: 100, order_id: 'p2' }),
    ];
    // Ambos entram: calça sem ficha, polo tem ficha → só calça na lista.
    e.fichaPorProduto = new Map();
    const r = apurarCompletude(e);
    assert.deepStrictEqual(r.produtosSemFicha.map(l => l.nome), ['CALCA', 'POLO']);
});

test('peças desempatam quando o faturamento é igual', () => {
    const a: LinhaPendente = { id: 'a', nome: 'AAA', motivo: 'sem-custo', pecas: 5, faturamento: 100, pedidos: 1, fatia: 0 };
    const b: LinhaPendente = { id: 'b', nome: 'BBB', motivo: 'sem-custo', pecas: 50, faturamento: 100, pedidos: 1, fatia: 0 };
    assert.ok(porImpacto(a, b) > 0, 'quem tem mais peças vem antes');
});

test('nome desempata para a lista não dançar entre recargas', () => {
    const a: LinhaPendente = { id: 'a', nome: 'ZEBRA', motivo: 'sem-custo', pecas: 0, faturamento: 0, pedidos: 0, fatia: 0 };
    const b: LinhaPendente = { id: 'b', nome: 'ABACA', motivo: 'sem-custo', pecas: 0, faturamento: 0, pedidos: 0, fatia: 0 };
    assert.ok(porImpacto(a, b) > 0);
});

test('cadastro que nunca girou fica no fim, com peso zero', () => {
    const e = base();
    e.vendas = [venda({ tecidoId: 'linha' })];
    const r = apurarCompletude(e);
    const nomes = r.insumosSemCusto.map(l => l.nome);
    assert.deepStrictEqual(nomes, ['LINHA', 'BRIM']);
    assert.strictEqual(r.insumosSemCusto[1].pecas, 0);
    assert.strictEqual(r.insumosSemCusto[1].faturamento, 0);
});

// ── o que entra em cada lista ───────────────────────────────────────────────

test('produto com ficha não aparece como pendente', () => {
    const r = apurarCompletude(base());
    assert.deepStrictEqual(r.produtosSemFicha.map(l => l.id), ['calca']);
});

test('insumo com custo não aparece como pendente', () => {
    const r = apurarCompletude(base());
    assert.ok(!r.insumosSemCusto.some(l => l.id === 'malha'));
});

test('ficha vazia conta como sem ficha', () => {
    const e = base();
    e.fichaPorProduto = new Map([['polo', []]]);
    const r = apurarCompletude(e);
    assert.deepStrictEqual(r.produtosSemFicha.map(l => l.id).sort(), ['calca', 'polo']);
});

// ── peso: o insumo herda o giro do produto que o consome ────────────────────

test('o insumo da ficha herda as peças do produto vendido', () => {
    const e = base();
    e.fichaPorProduto = new Map([['polo', ['malha', 'linha']]]);
    e.vendas = [venda({ quantidade: 30, faturamento: 3000 })];
    const r = apurarCompletude(e);
    const linha = r.insumosSemCusto.find(l => l.id === 'linha')!;
    assert.strictEqual(linha.pecas, 30);
    assert.strictEqual(linha.faturamento, 3000);
});

test('o tecido da linha pesa mesmo sem estar na ficha', () => {
    const e = base();
    e.vendas = [venda({ tecidoId: 'brim', quantidade: 7, faturamento: 700 })];
    const r = apurarCompletude(e);
    const brim = r.insumosSemCusto.find(l => l.id === 'brim')!;
    assert.strictEqual(brim.pecas, 7);
});

test('tecido citado na ficha E na linha não conta em dobro', () => {
    const e = base();
    e.fichaPorProduto = new Map([['polo', ['linha']]]);
    e.vendas = [venda({ tecidoId: 'linha', quantidade: 10, faturamento: 1000 })];
    const r = apurarCompletude(e);
    assert.strictEqual(r.insumosSemCusto.find(l => l.id === 'linha')!.pecas, 10);
});

test('pedidos distintos são contados uma vez cada', () => {
    const e = base();
    e.fichaPorProduto = new Map([['polo', ['linha']]]);
    e.vendas = [
        venda({ order_id: 'p1', quantidade: 5, faturamento: 500 }),
        venda({ order_id: 'p1', quantidade: 5, faturamento: 500 }),
        venda({ order_id: 'p2', quantidade: 5, faturamento: 500 }),
    ];
    const r = apurarCompletude(e);
    const l = r.insumosSemCusto.find(x => x.id === 'linha')!;
    assert.strictEqual(l.pedidos, 2, 'duas peças do mesmo pedido não são dois pedidos');
    assert.strictEqual(l.pecas, 15);
});

// ── apelidos ────────────────────────────────────────────────────────────────

test('apelido de insumo soma no cadastro oficial, em vez de repartir', () => {
    const e = base();
    e.insumos.push({ id: 'linha-2', name: 'LINHA POLIESTER', average_unit_cost: 0 });
    e.canonicoDeInsumo = new Map([['linha-2', 'linha']]);
    e.vendas = [
        venda({ tecidoId: 'linha', quantidade: 10, faturamento: 1000, order_id: 'p1' }),
        venda({ tecidoId: 'linha-2', quantidade: 10, faturamento: 1000, order_id: 'p2' }),
    ];
    const r = apurarCompletude(e);
    const oficial = r.insumosSemCusto.find(l => l.id === 'linha')!;
    assert.strictEqual(oficial.pecas, 20, 'as duas grafias somam no oficial');
    assert.strictEqual(r.insumosSemCusto.find(l => l.id === 'linha-2')!.pecas, 0);
});

test('apelido de produto soma no cadastro oficial', () => {
    const e = base();
    e.fichaPorProduto = new Map();
    e.canonicoDeProduto = new Map([['polo-velho', 'polo']]);
    e.vendas = [
        venda({ produtoId: 'polo', faturamento: 100, order_id: 'p1' }),
        venda({ produtoId: 'polo-velho', faturamento: 900, order_id: 'p2' }),
    ];
    const r = apurarCompletude(e);
    assert.strictEqual(r.produtosSemFicha.find(l => l.id === 'polo')!.faturamento, 1000);
});

// ── cobertura ───────────────────────────────────────────────────────────────

test('peça inteiramente cadastrada cobre; um furo derruba a peça toda', () => {
    const e = base();
    e.vendas = [
        venda({ produtoId: 'polo', tecidoId: 'malha', faturamento: 600, order_id: 'p1' }),
        venda({ produtoId: 'calca', tecidoId: 'malha', faturamento: 400, order_id: 'p2' }),
    ];
    const r = apurarCompletude(e);
    assert.strictEqual(r.faturamentoConhecido, 1000);
    assert.strictEqual(r.faturamentoCoberto, 600, 'a calça não tem ficha');
    assert.strictEqual(r.cobertura, 0.6);
});

test('produto com ficha mas insumo sem custo não cobre', () => {
    const e = base();
    e.fichaPorProduto = new Map([['polo', ['malha', 'linha']]]);
    e.vendas = [venda({ faturamento: 1000 })];
    const r = apurarCompletude(e);
    assert.strictEqual(r.faturamentoCoberto, 0);
    assert.strictEqual(r.cobertura, 0);
});

test('item fora do cadastro nunca cobre', () => {
    const e = base();
    e.vendas = [venda({ produtoId: null, produtoNome: 'digitado à mão', faturamento: 800 })];
    const r = apurarCompletude(e);
    assert.strictEqual(r.faturamentoConhecido, 800);
    assert.strictEqual(r.faturamentoCoberto, 0);
});

test('peça sem preço conhecido fica FORA da conta, não em zero', () => {
    const e = base();
    e.vendas = [
        venda({ produtoId: 'polo', tecidoId: 'malha', faturamento: 500, order_id: 'p1' }),
        venda({ produtoId: 'calca', faturamento: 0, faturamentoConhecido: false, quantidade: 40, order_id: 'p2' }),
    ];
    const r = apurarCompletude(e);
    assert.strictEqual(r.faturamentoConhecido, 500);
    assert.strictEqual(r.cobertura, 1, 'a peça sem preço não derruba nem infla a cobertura');
    assert.strictEqual(r.pecasSemPreco, 40);
});

test('sem venda nenhuma, a cobertura é zero e não NaN', () => {
    const r = apurarCompletude(base());
    assert.strictEqual(r.cobertura, 0);
    assert.ok(Number.isFinite(r.cobertura));
    assert.ok(r.produtosSemFicha.every(l => l.fatia === 0));
});

test('a fatia de cada linha é sobre o faturamento conhecido', () => {
    const e = base();
    e.fichaPorProduto = new Map();
    e.vendas = [
        venda({ produtoId: 'polo', faturamento: 750, order_id: 'p1' }),
        venda({ produtoId: 'calca', faturamento: 250, order_id: 'p2' }),
    ];
    const r = apurarCompletude(e);
    assert.strictEqual(r.produtosSemFicha.find(l => l.id === 'polo')!.fatia, 0.75);
});

// ── contagens ───────────────────────────────────────────────────────────────

test('conta as pendências e separa a cauda sem giro', () => {
    const e = base();
    e.vendas = [venda({ tecidoId: 'linha' })];
    const r = apurarCompletude(e);
    assert.strictEqual(r.produtosPendentes, 1);   // calca
    assert.strictEqual(r.insumosPendentes, 2);    // linha, brim
    // calca (nunca vendida) + brim (nunca vendido)
    assert.strictEqual(r.pendenciasSemGiro, 2);
});

// ── quantosResolvem ─────────────────────────────────────────────────────────

const pend = (nome: string, faturamento: number): LinhaPendente =>
    ({ id: nome, nome, motivo: 'sem-custo', pecas: 1, faturamento, pedidos: 1, fatia: 0 });

test('diz quantos cadastros do topo respondem por 80% do pendente', () => {
    const linhas = [pend('a', 700), pend('b', 200), pend('c', 50), pend('d', 50)];
    assert.strictEqual(quantosResolvem(linhas), 2);
});

test('o alvo é configurável', () => {
    const linhas = [pend('a', 700), pend('b', 200), pend('c', 100)];
    assert.strictEqual(quantosResolvem(linhas, 0.5), 1);
    assert.strictEqual(quantosResolvem(linhas, 1), 3);
});

test('lista vazia ou sem peso responde zero, não divide por zero', () => {
    assert.strictEqual(quantosResolvem([]), 0);
    assert.strictEqual(quantosResolvem([pend('a', 0), pend('b', 0)]), 0);
});

test('quando nenhum item sozinho alcança o alvo, devolve a lista inteira', () => {
    const linhas = [pend('a', 10), pend('b', 10), pend('c', 10)];
    assert.strictEqual(quantosResolvem(linhas, 0.99), 3);
});
