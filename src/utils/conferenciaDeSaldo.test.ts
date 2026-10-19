import test from 'node:test';
import assert from 'node:assert';
import {
    conferirSaldos, saldoEsperado, somaDosMovimentos, movimentoAtivo, FOLGA,
} from './conferenciaDeSaldo.ts';
import type { MovimentoDeConta } from './conferenciaDeSaldo.ts';

const conta = (over = {}) => ({
    id: 'c1', name: 'ITAÚ', initial_balance: 1000, current_balance: 1000, is_active: true, ...over,
});

const mov = (over: Partial<MovimentoDeConta> = {}): MovimentoDeConta => ({
    account_id: 'c1', amount: 100, tipo: 'receivable', ...over,
});

// ── o movimento ativo ───────────────────────────────────────────────────────

test('pagamento normal é ativo', () => {
    assert.ok(movimentoAtivo(mov()));
});

test('estornado, estorno e informativo não movem saldo', () => {
    assert.ok(!movimentoAtivo(mov({ reversed_at: '2026-01-01' })));
    assert.ok(!movimentoAtivo(mov({ reversal_of: 'outro-id' })));
    assert.ok(!movimentoAtivo(mov({ affects_balance: false })));
});

test('affects_balance ausente é tratado como verdadeiro', () => {
    assert.ok(movimentoAtivo(mov({ affects_balance: undefined })));
    assert.ok(movimentoAtivo(mov({ affects_balance: null })));
});

// ── a soma ──────────────────────────────────────────────────────────────────

test('recebível entra, pagável sai', () => {
    assert.strictEqual(somaDosMovimentos([
        mov({ amount: 500, tipo: 'receivable' }),
        mov({ amount: 200, tipo: 'payable' }),
    ]).total, 300);
});

test('os inativos ficam de fora da soma', () => {
    assert.strictEqual(somaDosMovimentos([
        mov({ amount: 500 }),
        mov({ amount: 999, reversed_at: '2026-01-01' }),
        mov({ amount: 999, reversal_of: 'x' }),
        mov({ amount: 999, affects_balance: false }),
    ]).total, 500);
});

test('lista vazia soma zero', () => {
    assert.strictEqual(somaDosMovimentos([]).total, 0);
    assert.strictEqual(somaDosMovimentos(null).total, 0);
});

test('valor em texto é lido como número', () => {
    assert.strictEqual(somaDosMovimentos([mov({ amount: '250' as any })]).total, 250);
});

// ── o saldo esperado ────────────────────────────────────────────────────────

test('saldo esperado é o inicial mais os movimentos', () => {
    assert.strictEqual(saldoEsperado(conta({ initial_balance: 1000 }), [mov({ amount: 300 })]).valor, 1300);
});

// ── a conferência ───────────────────────────────────────────────────────────

test('conta certa não vira divergência', () => {
    const r = conferirSaldos([conta({ initial_balance: 1000, current_balance: 1300 })], [mov({ amount: 300 })]);
    assert.deepStrictEqual(r.divergencias, []);
    assert.strictEqual(r.conferidas, 1);
    assert.strictEqual(r.totalDivergente, 0);
});

test('divergência diz de quanto é, e para que lado', () => {
    const r = conferirSaldos([conta({ initial_balance: 1000, current_balance: 1500 })], [mov({ amount: 300 })]);
    assert.strictEqual(r.divergencias.length, 1);
    const d = r.divergencias[0];
    assert.strictEqual(d.guardado, 1500);
    assert.strictEqual(d.calculado, 1300);
    assert.strictEqual(d.diferenca, 200);
    assert.strictEqual(d.movimentos, 1);
});

test('saldo guardado a menos também é divergência', () => {
    const r = conferirSaldos([conta({ initial_balance: 1000, current_balance: 1100 })], [mov({ amount: 300 })]);
    assert.strictEqual(r.divergencias[0].diferenca, -200);
});

test('um estorno não registrado no saldo aparece como sobra', () => {
    // O pagamento foi estornado, mas o saldo guardado ainda o contém.
    const r = conferirSaldos(
        [conta({ initial_balance: 1000, current_balance: 1300 })],
        [mov({ amount: 300, reversed_at: '2026-02-01' })]);
    assert.strictEqual(r.divergencias[0].diferenca, 300);
    assert.strictEqual(r.divergencias[0].movimentos, 0);
});

test('a folga absorve o resíduo do ponto flutuante, não erro de verdade', () => {
    const semDivergencia = conferirSaldos(
        [conta({ initial_balance: 0, current_balance: 0.005 })], []);
    assert.deepStrictEqual(semDivergencia.divergencias, []);

    const comDivergencia = conferirSaldos(
        [conta({ initial_balance: 0, current_balance: FOLGA + 0.005 })], []);
    assert.strictEqual(comDivergencia.divergencias.length, 1);
});

test('conta inativa fica de fora — o alerta seria permanente e insolúvel', () => {
    const r = conferirSaldos([
        conta({ id: 'viva', current_balance: 9999 }),
        conta({ id: 'morta', current_balance: 9999, is_active: false }),
    ], []);
    assert.strictEqual(r.conferidas, 1);
    assert.deepStrictEqual(r.divergencias.map(d => d.account_id), ['viva']);
});

test('cada conta soma só os próprios movimentos', () => {
    const r = conferirSaldos([
        conta({ id: 'a', initial_balance: 0, current_balance: 100 }),
        conta({ id: 'b', initial_balance: 0, current_balance: 100 }),
    ], [
        mov({ account_id: 'a', amount: 100 }),
        mov({ account_id: 'b', amount: 100 }),
    ]);
    assert.deepStrictEqual(r.divergencias, []);
});

test('movimento sem conta não polui ninguém', () => {
    const r = conferirSaldos(
        [conta({ initial_balance: 0, current_balance: 0 })],
        [mov({ account_id: null, amount: 500 })]);
    assert.deepStrictEqual(r.divergencias, []);
});

test('ordena pela maior diferença em módulo, sobrando ou faltando', () => {
    const r = conferirSaldos([
        conta({ id: 'peq', initial_balance: 0, current_balance: 10 }),
        conta({ id: 'gra', initial_balance: 0, current_balance: -900 }),
    ], []);
    assert.deepStrictEqual(r.divergencias.map(d => d.account_id), ['gra', 'peq']);
    assert.strictEqual(r.totalDivergente, 910);
});

test('sem contas não quebra', () => {
    const r = conferirSaldos(null, null);
    assert.strictEqual(r.conferidas, 0);
    assert.deepStrictEqual(r.divergencias, []);
});

// ── O BUG QUE CUSTOU UM SALDO ───────────────────────────────────────────────
//
// A primeira versao fazia `tipo === 'payable' ? -x : +x`. Todo movimento cujo
// tipo nao fosse encontrado — obrigacao fora da consulta, teto de linhas,
// qualquer motivo — virava DINHEIRO ENTRANDO, em silencio. O alerta de
// divergencia disparava, alguem clicava em "Sincronizar Saldos", e o saldo bom
// era sobrescrito pelo calculado errado.

test('movimento sem tipo NAO vira receita — ele nao entra na soma', () => {
    const r = somaDosMovimentos([
        mov({ amount: 500, tipo: 'receivable' }),
        mov({ amount: 9999, tipo: undefined }),
        mov({ amount: 8888, tipo: null }),
        mov({ amount: 7777, tipo: 'coisa-desconhecida' }),
    ]);
    assert.strictEqual(r.total, 500, 'so o que tem tipo conhecido soma');
    assert.strictEqual(r.semTipo, 3);
});

test('um movimento sem tipo derruba a conta inteira para inconclusiva', () => {
    const r = conferirSaldos(
        [conta({ initial_balance: 0, current_balance: 50000 })],
        [mov({ amount: 100, tipo: 'receivable' }), mov({ amount: 200, tipo: undefined })]);

    assert.deepStrictEqual(r.divergencias, [], 'nao acusa quem nao consegue julgar');
    assert.strictEqual(r.inconclusivas.length, 1);
    assert.strictEqual(r.inconclusivas[0].semTipo, 1);
    assert.strictEqual(r.conferidas, 0);
});

test('conta com tipos completos continua sendo julgada normalmente', () => {
    // As duas ancoradas (initial_balance != 0), para o teste falar de TIPO e
    // nao de linha de base — sao dois motivos diferentes de nao julgar, e
    // misturá-los aqui esconderia qualquer um dos dois ao quebrar.
    const r = conferirSaldos(
        [conta({ id: 'boa', initial_balance: 50, current_balance: 999 }),
         conta({ id: 'cega', initial_balance: 50, current_balance: 999 })],
        [mov({ account_id: 'boa', amount: 100, tipo: 'receivable' }),
         mov({ account_id: 'cega', amount: 100, tipo: undefined })]);

    assert.deepStrictEqual(r.divergencias.map(d => d.account_id), ['boa']);
    assert.deepStrictEqual(r.inconclusivas.map(d => d.account_id), ['cega']);
});

// ── O TETO DE LINHAS ────────────────────────────────────────────────────────

test('dado incompleto nao julga NADA — nem as contas que pareceriam certas', () => {
    const r = conferirSaldos(
        [conta({ initial_balance: 0, current_balance: 50000 })],
        [mov({ amount: 100, tipo: 'receivable' })],
        { dadosCompletos: false });

    assert.deepStrictEqual(r.divergencias, []);
    assert.deepStrictEqual(r.inconclusivas, []);
    assert.strictEqual(r.completo, false);
    assert.strictEqual(r.conferidas, 0);
});

test('sem a opcao, o padrao continua sendo julgar', () => {
    const r = conferirSaldos([conta({ initial_balance: 0, current_balance: 500 })], []);
    assert.strictEqual(r.completo, true);
    assert.strictEqual(r.divergencias.length, 1);
});

test('dadosCompletos true e o mesmo que nao passar nada', () => {
    const contas = [conta({ initial_balance: 0, current_balance: 500 })];
    assert.deepStrictEqual(
        conferirSaldos(contas, [], { dadosCompletos: true }),
        conferirSaldos(contas, []));
});

test('saldoEsperado avisa quando nao da para confiar', () => {
    assert.strictEqual(saldoEsperado(conta(), [mov({ tipo: 'receivable' })]).confiavel, true);
    assert.strictEqual(saldoEsperado(conta(), [mov({ tipo: undefined })]).confiavel, false);
});

test('estornado sem tipo nao conta como sem tipo — ele nem e olhado', () => {
    const r = somaDosMovimentos([mov({ tipo: undefined, reversed_at: '2026-01-01' })]);
    assert.strictEqual(r.semTipo, 0, 'movimento inativo sai antes da pergunta do tipo');
});

// ── O CASO BOTEZINI ─────────────────────────────────────────────────────────
//
// Saldo real 49.557,89, conferido no extrato e correto. 50 lancamentos somando
// -27.082,95. initial_balance zerado, porque a conta entrou no sistema sem o
// saldo de partida: os 76.640,84 que ja estavam la nunca viraram lancamento.
//
// Nada esta quebrado. Chamar isso de "Saldo Bancario Divergente / critico",
// todo dia, ao lado de um botao que sobrescreve o saldo, foi o erro.

test('conta que nunca foi ancorada NAO e divergencia', () => {
    const r = conferirSaldos(
        [conta({ id: 'botezini', name: 'Botezini', initial_balance: 0, current_balance: 49557.89 })],
        [mov({ account_id: 'botezini', amount: 27082.95, tipo: 'payable' })]);

    assert.deepStrictEqual(r.divergencias, [], 'o saldo esta certo — nao ha o que acusar');
    assert.strictEqual(r.semLinhaDeBase.length, 1);
    assert.strictEqual(r.semLinhaDeBase[0].nome, 'Botezini');
    assert.ok(Math.abs(r.semLinhaDeBase[0].semHistorico - 76640.84) < 0.01);
});

test('conta ancorada que passa a nao fechar CONTINUA sendo divergencia', () => {
    // Sueli: initial_balance negativo, sinal de que ja passou por
    // set_bank_balance. Se ela deixar de fechar, aí sim algo escapou.
    const r = conferirSaldos(
        [conta({ id: 'sueli', name: 'Sueli', initial_balance: -1233.31, current_balance: 5000 })],
        [mov({ account_id: 'sueli', amount: 3097.95, tipo: 'receivable' })]);

    assert.strictEqual(r.divergencias.length, 1);
    assert.deepStrictEqual(r.semLinhaDeBase, []);
});

test('conta ancorada em zero e que FECHA nao entra em lista nenhuma', () => {
    const r = conferirSaldos(
        [conta({ initial_balance: 0, current_balance: 500 })],
        [mov({ amount: 500, tipo: 'receivable' })]);
    assert.deepStrictEqual(r.divergencias, []);
    assert.deepStrictEqual(r.semLinhaDeBase, []);
});

test('conta zerada e sem movimento nenhum nao vira aviso', () => {
    const r = conferirSaldos([conta({ initial_balance: 0, current_balance: 0 })], []);
    assert.deepStrictEqual(r.divergencias, []);
    assert.deepStrictEqual(r.semLinhaDeBase, []);
});

test('conta sem movimento mas com saldo e divergencia de verdade', () => {
    // Sem lancamento nenhum, initial_balance deveria ser o proprio saldo.
    // Aqui nao ha historico faltando para explicar — ha um numero errado.
    const r = conferirSaldos([conta({ initial_balance: 0, current_balance: 800 })], []);
    assert.strictEqual(r.divergencias.length, 1);
    assert.deepStrictEqual(r.semLinhaDeBase, []);
});

import {
    movimentosDosPagamentos, situacaoDoSaldo, dadosCompletosDaConferencia, TETO_DE_CONTAS,
} from './conferenciaDeSaldo.ts';
import type { ResultadoDaConferencia } from './conferenciaDeSaldo.ts';

test('movimentos: o tipo vem da conta; pagamento sem conta conhecida fica sem tipo', () => {
    const m = movimentosDosPagamentos(
        [
            { account_id: 'b1', amount: 100, obligation_id: 'r1', reversed_at: null, reversal_of: null, affects_balance: true },
            { account_id: 'b1', amount: 40, obligation_id: 'p1' },
            { account_id: 'b2', amount: 10, obligation_id: 'sumiu' },
        ],
        [{ id: 'r1', type: 'receivable' }, { id: 'p1', type: 'payable' }],
    );
    assert.deepEqual(m.map(x => [x.account_id, x.amount, x.tipo]), [
        ['b1', 100, 'receivable'], ['b1', 40, 'payable'], ['b2', 10, undefined],
    ]);
    assert.equal(m[0].affects_balance, true);
});

test('dados completos: nenhum teto atingido', () => {
    assert.equal(dadosCompletosDaConferencia(false, 10), true);
    assert.equal(dadosCompletosDaConferencia(true, 10), false);
    assert.equal(dadosCompletosDaConferencia(false, TETO_DE_CONTAS), false);
});

const resultado = (p: Partial<ResultadoDaConferencia>): ResultadoDaConferencia => ({
    divergencias: [], semLinhaDeBase: [], inconclusivas: [], conferidas: 0, totalDivergente: 0, completo: true, ...p,
});

test('situação do saldo por banco', () => {
    const r = resultado({
        divergencias: [{ account_id: 'b1', nome: 'Itaú', guardado: 500, calculado: 450, diferenca: 50, movimentos: 3 }],
        semLinhaDeBase: [{ account_id: 'b2', nome: 'Caixa', semHistorico: 1, movimentos: 2 }],
        inconclusivas: [{ account_id: 'b3', nome: 'Sueli', semTipo: 1 }],
    });
    assert.deepEqual(situacaoDoSaldo(r, 'b1'), { tipo: 'nao-bate', guardado: 500, calculado: 450 });
    assert.deepEqual(situacaoDoSaldo(r, 'b2'), { tipo: 'sem-partida' });
    assert.deepEqual(situacaoDoSaldo(r, 'b3'), { tipo: 'sem-dados' });
    assert.deepEqual(situacaoDoSaldo(r, 'b4'), { tipo: 'bate' });
});

test('conferência incompleta: nenhum banco recebe veredito', () => {
    const r = resultado({ completo: false });
    assert.deepEqual(situacaoDoSaldo(r, 'b1'), { tipo: 'sem-dados' });
});

import { previaDaSincronizacao } from './conferenciaDeSaldo.ts';

test('prévia da sincronização mostra o saldo que FICA, não o saldo de partida', () => {
    // Âncora 286.036,69 e lançamentos que somam −226.965,12: o saldo que fica é 59.071,57.
    const p = previaDaSincronizacao(
        [{ id: 'b1', name: 'Botezini', initial_balance: 286036.69, current_balance: 59071.57, is_active: true }],
        [mov({ account_id: 'b1', amount: 226965.12, tipo: 'payable' })],
        true,
    );
    assert.deepStrictEqual(p, [{ id: 'b1', nome: 'Botezini', atual: 59071.57, depois: 59071.57, muda: false }]);
});

test('prévia: quando não bate, diz quanto muda; estorno e informativo não entram', () => {
    const [p] = previaDaSincronizacao(
        [{ id: 'b1', name: 'Itaú', initial_balance: 1000, current_balance: 900, is_active: true }],
        [
            mov({ account_id: 'b1', amount: 50, tipo: 'receivable' }),
            mov({ account_id: 'b1', amount: 999, tipo: 'payable', reversed_at: '2026-10-01' }),
            mov({ account_id: 'b1', amount: 999, tipo: 'payable', affects_balance: false }),
            mov({ account_id: 'b2', amount: 999, tipo: 'payable' }),
        ],
        true,
    );
    assert.deepStrictEqual(p, { id: 'b1', nome: 'Itaú', atual: 900, depois: 1050, muda: true });
});

test('prévia: sem dados completos ou com pagamento sem tipo, não promete número', () => {
    const contas = [{ id: 'b1', name: 'Itaú', initial_balance: 1000, current_balance: 1000, is_active: true }];
    assert.equal(previaDaSincronizacao(contas, [], false)[0].depois, null);
    assert.equal(previaDaSincronizacao(contas, [mov({ account_id: 'b1', amount: 10, tipo: null })], true)[0].depois, null);
});
