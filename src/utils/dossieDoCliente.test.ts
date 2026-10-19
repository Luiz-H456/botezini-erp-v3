import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarDossie } from './dossieDoCliente.ts';

const HOJE = '2026-08-15';
const EU = 'cli-1';
const OUTRO = 'cli-2';

const orcamentos = [
    { id: 'o1', client_id: EU, date: '2026-01-10', total_amount: 1000, status: 'Converted' },
    { id: 'o2', client_id: EU, date: '2026-03-05', total_amount: 2000, status: 'Sent' },
    { id: 'o3', client_id: EU, date: '2026-02-01', total_amount: 500, status: 'Draft' },
    { id: 'o4', client_id: EU, date: '2026-04-01', total_amount: 800, status: 'Approved' },
    { id: 'o5', client_id: OUTRO, date: '2026-05-01', total_amount: 9999, status: 'Converted' },
];

const pedidos = [
    { id: 'p1', client_id: EU, created_at: '2026-01-15', total_amount: 1000 },
    { id: 'p2', client_id: EU, created_at: '2026-04-10', total_amount: 800 },
    { id: 'p3', client_id: OUTRO, created_at: '2026-05-05', total_amount: 9999 },
];

const contas = [
    { id: 'c1', client_id: EU, type: 'receivable', due_date: '2026-02-10', original_amount: 1000, paid_amount: 1000, remaining_amount: 0 },
    { id: 'c2', client_id: EU, type: 'receivable', due_date: '2026-08-01', original_amount: 800, paid_amount: 300, remaining_amount: 500 },
    { id: 'c3', client_id: EU, type: 'receivable', due_date: '2026-12-01', original_amount: 400, paid_amount: 0, remaining_amount: 400 },
    { id: 'c4', client_id: OUTRO, type: 'receivable', due_date: '2026-08-01', original_amount: 50, paid_amount: 0, remaining_amount: 50 },
];

const dossie = () => montarDossie(EU, orcamentos, pedidos, contas, HOJE);

test('só entra o que é do cliente — nada de outro vaza', () => {
    const d = dossie();
    assert.equal(d.orcamentos.length, 4);
    assert.equal(d.pedidos.length, 2);
    assert.equal(d.contas.length, 3);
});

test('as listas vêm da mais recente para a mais antiga', () => {
    const d = dossie();
    assert.deepEqual(d.orcamentos.map(o => o.id), ['o4', 'o2', 'o3', 'o1']);
    assert.deepEqual(d.pedidos.map(p => p.id), ['p2', 'p1']);
});

test('fechado é aprovado ou convertido', () => {
    const d = dossie();
    assert.deepEqual(d.orcamentosFechados.map(o => o.id).sort(), ['o1', 'o4']);
});

test('rascunho fica de fora da taxa — nunca chegou ao cliente', () => {
    const d = dossie();
    // Enviados: o1, o2, o4 = 3. Fechados: o1, o4 = 2.
    assert.equal(d.orcamentosConsiderados, 3);
    assert.equal(d.taxaDeFechamento, 0.67);
});

test('cliente sem orçamento enviado tem taxa nula, não zero', () => {
    // Zero diria "nunca fechou nada"; nulo diz "não há como saber ainda".
    const d = montarDossie(EU, [{ id: 'x', client_id: EU, status: 'Draft' }], [], [], HOJE);
    assert.equal(d.taxaDeFechamento, null);
});

test('os totais somam pedidos, recebido e a receber', () => {
    const d = dossie();
    assert.equal(d.totalEmPedidos, 1800);
    assert.equal(d.totalRecebido, 1300);
    assert.equal(d.aReceber, 900);
});

test('vencido é só o que passou da data e ainda tem saldo', () => {
    const d = dossie();
    // c2 vence 01/08 e tem 500 em aberto; c3 vence em dezembro, não conta.
    assert.equal(d.vencido, 500);
});

test('conta cancelada sai das somas mas continua na lista para auditoria', () => {
    const comCancelada = [...contas,
    { id: 'c9', client_id: EU, type: 'receivable', due_date: '2026-01-01', original_amount: 5000, remaining_amount: 5000, cancelled_at: '2026-01-02' }];
    const d = montarDossie(EU, orcamentos, pedidos, comCancelada, HOJE);
    assert.equal(d.aReceber, 900, 'cancelada não engorda o a receber');
    assert.equal(d.vencido, 500, 'cancelada não vira vencido');
    assert.equal(d.contas.length, 4, 'mas continua visível na lista');
});

test('conta a pagar não entra no financeiro do cliente', () => {
    const comPagavel = [...contas,
    { id: 'cp', client_id: EU, type: 'payable', due_date: '2026-01-01', original_amount: 700, remaining_amount: 700 }];
    const d = montarDossie(EU, orcamentos, pedidos, comPagavel, HOJE);
    assert.equal(d.aReceber, 900);
});

test('ticket médio é o total dividido pelo número de pedidos', () => {
    assert.equal(dossie().ticketMedio, 900);
});

test('cliente sem pedido tem ticket nulo, não zero', () => {
    const d = montarDossie(EU, [], [], [], HOJE);
    assert.equal(d.ticketMedio, null);
    assert.equal(d.totalEmPedidos, 0);
});

test('as últimas datas são as mais recentes de cada lista', () => {
    const d = dossie();
    assert.equal(d.ultimoPedidoEm, '2026-04-10');
    assert.equal(d.ultimoOrcamentoEm, '2026-04-01');
});

test('listas ausentes não quebram', () => {
    const d = montarDossie(EU, undefined, undefined, undefined, HOJE);
    assert.deepEqual([d.orcamentos.length, d.pedidos.length, d.contas.length], [0, 0, 0]);
    assert.equal(d.totalEmPedidos, 0);
    assert.equal(d.ultimoPedidoEm, undefined);
});

test('valores quebrados não viram dízima no total', () => {
    const d = montarDossie(EU, [], [
        { id: 'a', client_id: EU, total_amount: 0.1 },
        { id: 'b', client_id: EU, total_amount: 0.2 },
    ], [], HOJE);
    assert.equal(d.totalEmPedidos, 0.3);
});

// ── Peças que o cliente compra ──────────────────────────────────────────────

import { pecasDoCliente, pedidosPorMes, padraoDePedidos } from './dossieDoCliente.ts';

const comItens = [
    {
        id: 'a', client_id: EU, date: '2026-01-10', status: 'Converted', items: [
            { product_name: 'Camisa Brim', quantity: 100, unit_price: 40 },
            { product_name: 'Calça', quantity: 50, unit_price: 60 },
        ]
    },
    {
        id: 'b', client_id: EU, date: '2026-03-10', status: 'Sent', items: [
            { product_name: 'Camisa Brim', quantity: 300, unit_price: 36 },
        ]
    },
];

test('soma as peças orçadas e separa o que fechou', () => {
    const r = pecasDoCliente(comItens);
    const camisa = r.find(p => p.produto === 'Camisa Brim')!;
    assert.equal(camisa.quantidadeOrcada, 400);
    assert.equal(camisa.quantidadeFechada, 100, 'só o orçamento Converted conta como fechado');
    assert.equal(camisa.aparicoes, 2);
});

test('o preço médio é ponderado pela quantidade, não pela média simples', () => {
    const r = pecasDoCliente(comItens);
    const camisa = r.find(p => p.produto === 'Camisa Brim')!;
    // (100×40 + 300×36) / 400 = 37 — a média simples daria 38.
    assert.equal(camisa.precoMedio, 37);
});

test('o último preço é o do orçamento mais recente, não o maior', () => {
    const r = pecasDoCliente(comItens);
    assert.equal(r.find(p => p.produto === 'Camisa Brim')!.ultimoPreco, 36);
});

test('a peça mais pedida vem primeiro', () => {
    assert.equal(pecasDoCliente(comItens)[0].produto, 'Camisa Brim');
});

test('linha sem preço não derruba a média para zero', () => {
    const r = pecasDoCliente([{
        id: 'x', client_id: EU, date: '2026-01-01', status: 'Sent', items: [
            { product_name: 'Touca', quantity: 10, unit_price: 20 },
            { product_name: 'Touca', quantity: 10, unit_price: 0 },
        ]
    }]);
    assert.equal(r[0].precoMedio, 20);
});

test('orçamento sem itens não quebra', () => {
    assert.deepEqual(pecasDoCliente([{ id: 'z', client_id: EU, date: '2026-01-01' }]), []);
});

// ── Série mensal ────────────────────────────────────────────────────────────

test('agrupa pedidos por mês em ordem cronológica', () => {
    const r = pedidosPorMes([
        { id: '1', client_id: EU, created_at: '2026-03-05', total_amount: 100 },
        { id: '2', client_id: EU, created_at: '2026-01-20', total_amount: 200 },
        { id: '3', client_id: EU, created_at: '2026-03-25', total_amount: 300 },
    ]);
    assert.deepEqual(r.map(m => m.mes), ['2026-01', '2026-03']);
    assert.deepEqual(r.map(m => m.pedidos), [1, 2]);
    assert.equal(r[1].valor, 400);
});

test('pedido sem data fica de fora da série', () => {
    assert.deepEqual(pedidosPorMes([{ id: '1', client_id: EU, total_amount: 5 }]), []);
});

// ── Padrão de pedidos ───────────────────────────────────────────────────────

const HJ = '2026-08-15';

test('com dois ou mais pedidos, estima o intervalo e o próximo', () => {
    const r = padraoDePedidos([
        { id: '1', client_id: EU, created_at: '2026-01-01' },
        { id: '2', client_id: EU, created_at: '2026-02-01' },
        { id: '3', client_id: EU, created_at: '2026-03-03' },
    ], HJ);
    assert.equal(r.baseDeCalculo, 2);
    assert.equal(r.intervaloMedioDias, 31);
    assert.equal(r.proximoPedidoEstimado, '2026-04-03');
});

test('a faixa entre menor e maior intervalo acompanha a média', () => {
    const r = padraoDePedidos([
        { id: '1', client_id: EU, created_at: '2026-01-01' },
        { id: '2', client_id: EU, created_at: '2026-01-11' },
        { id: '3', client_id: EU, created_at: '2026-04-11' },
    ], HJ);
    assert.equal(r.menorIntervalo, 10);
    assert.equal(r.maiorIntervalo, 90);
});

test('um pedido só não vira padrão — evento não é ritmo', () => {
    const r = padraoDePedidos([{ id: '1', client_id: EU, created_at: '2026-08-01' }], HJ);
    assert.equal(r.intervaloMedioDias, null);
    assert.equal(r.proximoPedidoEstimado, null);
    assert.equal(r.diasDesdeUltimo, 14, 'mas ainda diz há quanto tempo não compra');
});

test('passou do intervalo típico, marca como atrasado', () => {
    const r = padraoDePedidos([
        { id: '1', client_id: EU, created_at: '2026-01-01' },
        { id: '2', client_id: EU, created_at: '2026-02-01' },
    ], HJ);
    assert.equal(r.atrasado, true, 'último pedido em fevereiro, intervalo de 31 dias');
});

test('dentro do intervalo típico, não está atrasado', () => {
    const r = padraoDePedidos([
        { id: '1', client_id: EU, created_at: '2026-07-01' },
        { id: '2', client_id: EU, created_at: '2026-08-01' },
    ], HJ);
    assert.equal(r.atrasado, false);
});

test('nenhum pedido devolve padrão vazio sem NaN', () => {
    const r = padraoDePedidos([], HJ);
    assert.deepEqual([r.intervaloMedioDias, r.diasDesdeUltimo, r.atrasado], [null, null, false]);
});

import { montarDossie as dossieDe } from './dossieDoCliente.ts';
import { clientesQueDevem } from './financas/clientes.ts';

const HOJE_ENTREGA = '2026-10-08';
const conta = (id: string, p: Record<string, unknown> = {}) => ({
    id, client_id: 'c1', type: 'receivable', description: id, due_date: '2026-09-01',
    original_amount: 100, paid_amount: 0, remaining_amount: 100, derived_status: 'pending',
    cancelled_at: null, awaiting_delivery: false, ...p,
});

test('parcela de pedido não entregue não é vencida nem a receber: fica em produção', () => {
    const d = dossieDe('c1', [], [], [conta('a', { awaiting_delivery: true })], HOJE_ENTREGA);
    assert.equal(d.vencido, 0);
    assert.equal(d.aReceber, 0);
    assert.equal(d.emProducao, 100);
});

test('vencido, a receber e em produção batem com Clientes que devem', () => {
    const contas = [
        conta('vencida'),
        conta('futura', { due_date: '2026-11-01', original_amount: 50, remaining_amount: 50 }),
        conta('producao', { awaiting_delivery: true, original_amount: 70, remaining_amount: 70 }),
        conta('paga', { remaining_amount: 0, paid_amount: 100, derived_status: 'paid' }),
        conta('cancelada', { derived_status: 'cancelled', cancelled_at: '2026-09-02' }),
    ];
    const d = dossieDe('c1', [], [], contas, HOJE_ENTREGA);
    const [l] = clientesQueDevem(contas as any, HOJE_ENTREGA);
    assert.equal(d.vencido, l.vencido);
    assert.equal(d.aReceber, l.vencido + l.aVencer);
    assert.equal(d.emProducao, l.emProducao);
});
