import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folhaDoPeriodo, lucroPorPedido, ehCategoriaDeFolha } from './lucroPorPedido.ts';
import type { ContaResumo } from './base.ts';

const conta = (o: Partial<ContaResumo> & { id: string }): ContaResumo => ({
    type: 'payable', description: 'x', due_date: '2026-10-05', original_amount: 0, remaining_amount: 0,
    derived_status: 'open', category: 'Salários', ...o,
});

const contas: ContaResumo[] = [
    conta({ id: 's1', original_amount: 3000 }),                                         // salário de outubro
    conta({ id: 's2', original_amount: 1000, category: 'INSS', due_date: '2026-10-20' }),
    conta({ id: 's3', original_amount: 500, category: 'Folha - FGTS' }),                // nome antigo vale
    conta({ id: 's4', original_amount: 9999, derived_status: 'cancelled' }),             // cancelada: fora
    conta({ id: 's5', original_amount: 7000, category: 'Pró-labore' }),                  // pró-labore: fora
    conta({ id: 's6', original_amount: 2000, due_date: '2026-09-05' }),                  // setembro
    conta({ id: 's7', original_amount: 400, category: 'Tecidos e malhas' }),             // não é folha
    conta({ id: 'r1', type: 'receivable', original_amount: 8000 }),                      // a receber: fora
];

// Fichas por produto (quantidade por peça, na unidade do insumo).
const fichas = new Map([
    ['camiseta', [{ insumo_id: 'malha', quantity: 0.2 }, { insumo_id: 'linha', quantity: 1 }]],
    ['calca', [{ insumo_id: 'brim', quantity: 1.5 }]],
    ['bone', []],                                                                        // sem ficha
]);
const insumos = new Map([
    ['malha', { id: 'malha', name: 'Malha', unit: 'kg', current_stock: 0, average_unit_cost: 50, category: 'Tecidos' }],
    ['malha2', { id: 'malha2', name: 'Malha especial', unit: 'kg', current_stock: 0, average_unit_cost: 80, category: 'Tecidos' }],
    ['linha', { id: 'linha', name: 'Linha', unit: 'un', current_stock: 0, average_unit_cost: 0.5, category: 'Aviamentos' }],
    ['brim', { id: 'brim', name: 'Brim', unit: 'm', current_stock: 0, average_unit_cost: 0, category: 'Tecidos' }],   // sem custo
]);

const pedido = (id: string, entregue: string | null, total: number, items: Array<{ product_id: string; quantity: number; fabric_insumo_id?: string }>) => ({
    id, order_number: id.toUpperCase(), client_id: 'cli', status: entregue ? 'Entregue' : 'Em Produção',
    delivered_at: entregue, total_amount: total, deadline: '', items,
});

const pedidos = [
    pedido('p1', '2026-10-10', 2000, [{ product_id: 'camiseta', quantity: 50 }]),                              // 50 peças
    pedido('p2', '2026-10-25', 3000, [{ product_id: 'camiseta', quantity: 30, fabric_insumo_id: 'malha2' }, { product_id: 'calca', quantity: 20 }]),
    pedido('p3', '2026-10-28', 900, [{ product_id: 'bone', quantity: 50 }]),
    pedido('p4', null, 5000, [{ product_id: 'camiseta', quantity: 500 }]),                                     // não entregue: fora
    pedido('p5', '2026-09-30', 1000, [{ product_id: 'camiseta', quantity: 100 }]),                             // setembro
];

test('categorias de folha: novas e antigas; pro-labore e outras ficam fora', () => {
    for (const c of ['Salários', 'salarios', 'INSS', 'FGTS', '13º salário', 'Folha - Salários', 'Folha - INSS', 'Folha - 13º', 'Folha de Pagamento']) {
        assert.equal(ehCategoriaDeFolha(c), true, c);
    }
    for (const c of ['Pró-labore', 'Tecidos e malhas', '', null, undefined]) assert.equal(ehCategoriaDeFolha(c), false, String(c));
});

test('folha do periodo: competencia pelo vencimento, so a pagar nao cancelada', () => {
    assert.equal(folhaDoPeriodo(contas, ['2026-10']), 4500);
    assert.equal(folhaDoPeriodo(contas, ['2026-09']), 2000);
    assert.equal(folhaDoPeriodo(contas, ['2026-08', '2026-09', '2026-10']), 6500);   // trimestre soma
});

test('mao de obra por peca = folha / pecas entregues no periodo, e cada pedido leva a sua parte', () => {
    const r = lucroPorPedido({ pedidos, contas, fichas, insumos, meses: ['2026-10'] });
    assert.equal(r.resumo.folha, 4500);
    assert.equal(r.resumo.pecas, 150);                       // p1 50 + p2 50 + p3 50
    assert.equal(r.resumo.maoDeObraPorPeca, 30);
    const p1 = r.linhas.find(l => l.id === 'p1')!;
    assert.equal(p1.maoDeObra, 1500);
    assert.equal(r.linhas.length, 3);                        // p4 (não entregue) e p5 (setembro) fora
});

test('material = ficha x pecas x custo medio; o tecido do item substitui o da ficha', () => {
    const r = lucroPorPedido({ pedidos, contas, fichas, insumos, meses: ['2026-10'] });
    const p1 = r.linhas.find(l => l.id === 'p1')!;
    assert.equal(p1.material, 525);                          // 50 × (0,2 × 50 + 1 × 0,5)
    assert.equal(p1.lucro, -25);                             // 2000 − 525 − 1500
    assert.deepEqual(p1.faltas, []);
    assert.equal(p1.completo, true);
    const p2 = r.linhas.find(l => l.id === 'p2')!;
    assert.equal(p2.material, 495);                          // 30 × (0,2 × 80 + 0,5); a calça (brim sem custo) não soma
});

test('faltas viram teto: insumo sem custo e produto sem ficha', () => {
    const r = lucroPorPedido({ pedidos, contas, fichas, insumos, meses: ['2026-10'] });
    const p2 = r.linhas.find(l => l.id === 'p2')!;
    assert.equal(p2.completo, false);
    assert.deepEqual(p2.faltas, ['insumo sem custo: Brim']);
    const p3 = r.linhas.find(l => l.id === 'p3')!;
    assert.equal(p3.material, 0);
    assert.equal(p3.completo, false);
    assert.deepEqual(p3.faltas, ['produto sem ficha técnica']);
    assert.equal(r.resumo.pedidosIncompletos, 2);
});

test('linhas da pior margem para a melhor; margem sobre o valor do pedido', () => {
    const r = lucroPorPedido({ pedidos, contas, fichas, insumos, meses: ['2026-10'] });
    const margens = r.linhas.map(l => l.margem);
    assert.deepEqual([...margens].sort((a, b) => (a ?? 0) - (b ?? 0)), margens);
    assert.equal(r.linhas.find(l => l.id === 'p1')!.margem, -1.25);   // −25 / 2000
});

test('periodo sem peca entregue: mao de obra por peca nula, sem divisao por zero', () => {
    const r = lucroPorPedido({ pedidos, contas, fichas, insumos, meses: ['2026-11'] });
    assert.equal(r.resumo.pecas, 0);
    assert.equal(r.resumo.maoDeObraPorPeca, null);
    assert.deepEqual(r.linhas, []);
});

test('periodo com entrega e sem folha lancada: avisa, nao inventa custo', () => {
    const r = lucroPorPedido({ pedidos, contas: [], fichas, insumos, meses: ['2026-10'] });
    assert.equal(r.resumo.folha, 0);
    assert.equal(r.resumo.semFolha, true);
    assert.equal(r.linhas.find(l => l.id === 'p1')!.maoDeObra, 0);
});

test('totais do periodo somam as linhas', () => {
    const r = lucroPorPedido({ pedidos, contas, fichas, insumos, meses: ['2026-10'] });
    assert.equal(r.resumo.valor, 5900);
    assert.equal(r.resumo.maoDeObra, 4500);                  // a folha inteira foi repartida
    assert.equal(r.resumo.lucro, Math.round((r.linhas.reduce((s, l) => s + l.lucro, 0)) * 100) / 100);
});

// --- Tarefa 1 (sugestões, 17/10): preço do pedido → último preço pago → custo médio ---
const base = { pedidos, contas, fichas, insumos, meses: ['2026-10'] };
const linha = (r: ReturnType<typeof lucroPorPedido>, id: string) => r.linhas.find(l => l.id === id)!;

test('preco do proprio pedido vence o ultimo preco, que vence o custo medio', () => {
    const r = lucroPorPedido({
        ...base,
        vinculado: new Map([['p1', new Map([['malha', { quantidade: 10, valor: 600 }]])]]),
        ultimoPreco: new Map([['malha', 70]]),
    });
    const p1 = linha(r, 'p1');
    assert.equal(p1.material, 625);                          // malha 10 kg × 60 (do pedido) + linha 50 × 0,5 (médio)
    assert.deepEqual(p1.origens, ['compra do pedido', 'custo médio']);
    const so = lucroPorPedido({ ...base, ultimoPreco: new Map([['malha', 70]]) });
    assert.equal(linha(so, 'p1').material, 725);             // sem vínculo: 10 × 70 (última compra) + 25
    assert.deepEqual(linha(so, 'p1').origens, ['última compra', 'custo médio']);
});

test('vinculo parcial: o que falta da ficha vai pelo proximo preco da fila', () => {
    const r = lucroPorPedido({
        ...base,
        vinculado: new Map([['p1', new Map([['malha', { quantidade: 4, valor: 240 }]])]]),
        ultimoPreco: new Map([['malha', 70]]),
    });
    assert.equal(linha(r, 'p1').material, 685);              // 4 × 60 + 6 × 70 + 25
});

test('ultimo preco resolve o insumo sem custo medio (compra vinculada nao atualiza o medio)', () => {
    const r = lucroPorPedido({ ...base, ultimoPreco: new Map([['brim', 25]]) });
    const p2 = linha(r, 'p2');
    assert.equal(p2.material, 1245);                         // 495 da camiseta + 30 m × 25
    assert.equal(p2.completo, true);
});

test('produto sem ficha com compra vinculada: o vinculado inteiro e gasto, sem falta', () => {
    const r = lucroPorPedido({
        ...base,
        insumos: new Map([...insumos, ['feltro', { id: 'feltro', name: 'Feltro', unit: 'm', current_stock: 0, average_unit_cost: 0, category: 'Tecidos' }]]),
        vinculado: new Map([['p3', new Map([['feltro', { quantidade: 5, valor: 100 }]])]]),
    });
    const p3 = linha(r, 'p3');
    assert.equal(p3.material, 100);
    assert.deepEqual(p3.faltas, []);
    assert.equal(p3.completo, true);
});

test('vinculo com preco zero (uso do estoque sem custo) cai para o proximo preco', () => {
    const r = lucroPorPedido({
        ...base,
        vinculado: new Map([['p1', new Map([['malha', { quantidade: 10, valor: 0 }]])]]),
    });
    assert.equal(linha(r, 'p1').material, 525);              // malha pelo médio (50)
    assert.deepEqual(linha(r, 'p1').origens, ['custo médio']);
});

// --- Tarefa 2 (sugestões, 17/10): imposto = valor × alíquota do perfil ---
test('imposto sai do lucro: valor x aliquota, e a margem ja vem liquida', () => {
    const r = lucroPorPedido({ ...base, aliquota: 0.06 });
    const p1 = linha(r, 'p1');
    assert.equal(p1.imposto, 120);                           // 2000 × 6%
    assert.equal(p1.lucro, -145);                            // 2000 − 525 − 1500 − 120
    assert.equal(p1.margem, -7.25);
    assert.equal(r.resumo.imposto, 354);                     // 5900 × 6%
    assert.equal(r.resumo.semAliquota, false);
});

test('sem aliquota cadastrada: imposto zero e o aviso, nunca um imposto inventado', () => {
    for (const aliquota of [undefined, null, 0]) {
        const r = lucroPorPedido({ ...base, aliquota });
        assert.equal(linha(r, 'p1').imposto, 0);
        assert.equal(r.resumo.semAliquota, true);
    }
});
