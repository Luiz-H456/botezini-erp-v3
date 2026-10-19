import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    contasDoPedido, resumirPagamentoDoPedido, situacaoDaConta, estaCancelada,
} from './situacaoDoPedido.ts';
import type { ContaDoPedido } from './situacaoDoPedido.ts';

const pedido = { id: 'ord-1', order_number: '1' };
const pedido14 = { id: 'ord-14', order_number: '14' };

const conta = (over: Partial<ContaDoPedido> = {}): ContaDoPedido => ({
    id: 'c1',
    order_id: 'ord-1',
    description: 'Pedido #1 (Orçamento ORC-9)',
    original_amount: 700,
    paid_amount: 0,
    remaining_amount: 700,
    derived_status: 'open',
    ...over,
});

// ─── o casamento por texto que pegava o pedido errado ────────────────────────

test('Pedido #1 não captura a conta do Pedido #14', () => {
    const contas = [
        conta({ id: 'a', order_id: null, description: 'Pedido #14 (Orçamento ORC-3)' }),
    ];
    assert.deepEqual(contasDoPedido(contas, pedido), []);
});

test('Pedido #1 não captura #10, #100 nem #1234', () => {
    const contas = ['#10', '#100', '#1234'].map((n, i) =>
        conta({ id: String(i), order_id: null, description: `Pedido ${n} (Orçamento X)` }));
    assert.deepEqual(contasDoPedido(contas, pedido), []);
});

test('mas ainda acha o Pedido #1 legado, sem order_id', () => {
    const contas = [conta({ id: 'a', order_id: null })];
    assert.deepEqual(contasDoPedido(contas, pedido).map(c => c.id), ['a']);
});

test('order_id manda: descrição divergente não atrapalha', () => {
    const contas = [conta({ id: 'a', description: 'Adiantamento avulso' })];
    assert.deepEqual(contasDoPedido(contas, pedido).map(c => c.id), ['a']);
});

test('order_id de outro pedido não entra, mesmo com descrição parecida', () => {
    const contas = [conta({ id: 'a', order_id: 'ord-99', description: 'Pedido #1 (Orçamento X)' })];
    assert.deepEqual(contasDoPedido(contas, pedido), []);
});

test('notes com o id do pedido serve de rede para lançamento antigo', () => {
    const contas = [conta({ id: 'a', order_id: null, description: null, notes: 'ord-1' })];
    assert.deepEqual(contasDoPedido(contas, pedido).map(c => c.id), ['a']);
});

test('o Pedido #14 acha a própria conta', () => {
    const contas = [conta({ id: 'a', order_id: null, description: 'Pedido #14 (Orçamento X)' })];
    assert.deepEqual(contasDoPedido(contas, pedido14).map(c => c.id), ['a']);
});

// ─── cancelada não conta ─────────────────────────────────────────────────────

test('conta cancelada fica de fora da lista ativa', () => {
    const contas = [
        conta({ id: 'velha', derived_status: 'cancelled' }),
        conta({ id: 'nova' }),
    ];
    assert.deepEqual(contasDoPedido(contas, pedido).map(c => c.id), ['nova']);
});

test('cancelled_at cancela mesmo que o status diga outra coisa', () => {
    const c = conta({ derived_status: 'paid', cancelled_at: '2026-08-01T10:00:00Z' });
    assert.equal(situacaoDaConta(c), 'cancelled');
    assert.equal(estaCancelada(c), true);
});

test('o histórico das reversões continua acessível quando pedido', () => {
    const contas = [
        conta({ id: 'velha', derived_status: 'cancelled' }),
        conta({ id: 'nova' }),
    ];
    assert.equal(contasDoPedido(contas, pedido, true).length, 2);
});

// ─── derived_status ganha do status gravado ──────────────────────────────────

test('derived_status vence a cópia defasada da tabela', () => {
    assert.equal(situacaoDaConta(conta({ status: 'paid', derived_status: 'overdue' })), 'overdue');
});

test('sem derived_status, o status gravado serve de reserva', () => {
    assert.equal(situacaoDaConta(conta({ status: 'partial', derived_status: null })), 'partial');
});

// ─── consolidação de várias parcelas ─────────────────────────────────────────

test('entrada paga e saldo em aberto é PARCIAL, não LIQUIDADO', () => {
    const contas = [
        conta({ id: 'e', original_amount: 700, paid_amount: 700, remaining_amount: 0, derived_status: 'paid' }),
        conta({ id: 's', original_amount: 700, paid_amount: 0, remaining_amount: 700, derived_status: 'open' }),
    ];
    const r = resumirPagamentoDoPedido(contas, pedido, 1400);
    assert.equal(r.situacao, 'partial');
    assert.equal(r.parcelas, 2);
    assert.equal(r.pago, 700);
    assert.equal(r.falta, 700);
});

test('uma parcela vencida contamina o pedido inteiro', () => {
    const contas = [
        conta({ id: 'e', derived_status: 'paid', paid_amount: 700, remaining_amount: 0 }),
        conta({ id: 's', derived_status: 'overdue' }),
    ];
    const r = resumirPagamentoDoPedido(contas, pedido, 1400);
    assert.equal(r.situacao, 'overdue');
    assert.equal(r.vencidas, 1);
});

test('todas quitadas é LIQUIDADO', () => {
    const contas = [
        conta({ id: 'e', derived_status: 'paid', paid_amount: 700, remaining_amount: 0 }),
        conta({ id: 's', derived_status: 'paid', paid_amount: 700, remaining_amount: 0 }),
    ];
    assert.equal(resumirPagamentoDoPedido(contas, pedido, 1400).situacao, 'paid');
});

test('nada recebido e nada vencido é EM ABERTO', () => {
    const contas = [conta({ id: 'e' }), conta({ id: 's' })];
    assert.equal(resumirPagamentoDoPedido(contas, pedido, 1400).situacao, 'open');
});

test('pedido sem conta nenhuma é sem_conta, não em aberto', () => {
    assert.equal(resumirPagamentoDoPedido([], pedido, 1400).situacao, 'sem_conta');
});

test('pedido cujas contas foram todas canceladas é CANCELADA, não sem_conta', () => {
    const contas = [conta({ id: 'a', derived_status: 'cancelled' })];
    const r = resumirPagamentoDoPedido(contas, pedido, 1400);
    assert.equal(r.situacao, 'cancelled');
    assert.equal(r.canceladas, 1);
    assert.equal(r.parcelas, 0);
});

// ─── a divergência que denuncia o plano velho ────────────────────────────────

test('duas parcelas de 400 num pedido de 1400 acusam a divergência', () => {
    const contas = [
        conta({ id: 'a', original_amount: 400, remaining_amount: 400 }),
        conta({ id: 'b', original_amount: 400, remaining_amount: 400 }),
    ];
    const r = resumirPagamentoDoPedido(contas, pedido, 1400);
    assert.equal(r.total, 800);
    assert.equal(r.divergencia, -600);
});

test('financeiro batendo com o pedido dá divergência zero', () => {
    const contas = [
        conta({ id: 'a', original_amount: 700, remaining_amount: 700 }),
        conta({ id: 'b', original_amount: 700, remaining_amount: 700 }),
    ];
    assert.equal(resumirPagamentoDoPedido(contas, pedido, 1400).divergencia, 0);
});

test('as canceladas não entram no total nem na divergência', () => {
    const contas = [
        conta({ id: 'velha', original_amount: 400, derived_status: 'cancelled' }),
        conta({ id: 'a', original_amount: 700, remaining_amount: 700 }),
        conta({ id: 'b', original_amount: 700, remaining_amount: 700 }),
    ];
    const r = resumirPagamentoDoPedido(contas, pedido, 1400);
    assert.equal(r.total, 1400);
    assert.equal(r.divergencia, 0);
    assert.equal(r.canceladas, 1);
});

test('lista nula não quebra', () => {
    assert.deepEqual(contasDoPedido(null, pedido), []);
    assert.equal(resumirPagamentoDoPedido(undefined, pedido, 0).situacao, 'sem_conta');
});
