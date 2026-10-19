import test from 'node:test';
import assert from 'node:assert';
import {
    camposDaConta, tocaEmSaldo, CAMPOS_DE_SALDO, CAMPOS_DESCRITIVOS,
} from './contaBancaria.ts';

const conta = (over = {}) => ({
    id: 'c1',
    name: 'Botezini',
    bank_name: 'Itau',
    agency: '0001',
    account_number: '12345',
    type: 'checking',
    currency: 'BRL',
    is_active: true,
    initial_balance: 0,
    current_balance: 49557.89,
    ...over,
});

// ── A regra que custou 76.640,84 ────────────────────────────────────────────

test('conta EXISTENTE nao manda saldo nenhum — nem inicial, nem atual', () => {
    const campos = camposDaConta(conta(), false);
    assert.ok(!tocaEmSaldo(campos), JSON.stringify(campos));
    for (const c of CAMPOS_DE_SALDO) {
        assert.ok(!(c in campos), `${c} vazou para o payload de update`);
    }
});

test('o cenario exato do acidente: formulario velho nao desfaz a ancora', () => {
    // A RPC ancorou initial_balance em 76640.84. O formulario, aberto ANTES,
    // ainda tem 0 em memoria. Salvar depois disso nao pode devolver o zero.
    const doFormularioDesatualizado = conta({ initial_balance: 0, current_balance: 49557.89 });
    const campos = camposDaConta(doFormularioDesatualizado, false);

    assert.ok(!('initial_balance' in campos));
    assert.ok(!('current_balance' in campos));
    assert.strictEqual(campos.name, 'Botezini', 'o que e descritivo continua sendo salvo');
});

test('conta NOVA informa o saldo inicial — ali ele e fato, nao ancora', () => {
    const campos = camposDaConta(conta({ id: undefined, initial_balance: 1500 }), true);
    assert.strictEqual(campos.initial_balance, 1500);
    assert.strictEqual(campos.current_balance, 1500, 'sem lancamento, o saldo de hoje e o inicial');
});

test('conta nova ignora um current_balance divergente — ela nasceria sem fechar', () => {
    const campos = camposDaConta(conta({ id: undefined, initial_balance: 100, current_balance: 9999 }), true);
    assert.strictEqual(campos.current_balance, 100);
});

test('saldo inicial ausente ou invalido vira zero, nao NaN', () => {
    assert.strictEqual(camposDaConta({ name: 'X' }, true).initial_balance, 0);
    assert.strictEqual(camposDaConta({ name: 'X', initial_balance: NaN }, true).initial_balance, 0);
    assert.strictEqual(camposDaConta({ name: 'X', initial_balance: 'abc' as never }, true).initial_balance, 0);
});

// ── O que o formulario legitimamente possui ────────────────────────────────

test('todo campo descritivo atravessa, nos dois casos', () => {
    for (const ehNova of [true, false]) {
        const campos = camposDaConta(conta(), ehNova);
        for (const c of CAMPOS_DESCRITIVOS) {
            assert.ok(c in campos, `${c} sumiu (ehNova=${ehNova})`);
        }
    }
});

test('padroes sensatos quando o formulario vem incompleto', () => {
    const campos = camposDaConta({ name: 'Caixa' }, false);
    assert.strictEqual(campos.type, 'checking');
    assert.strictEqual(campos.currency, 'BRL');
    assert.strictEqual(campos.is_active, true);
    assert.strictEqual(campos.bank_name, null, 'texto vazio vira null, nao string vazia');
});

test('is_active falso e respeitado — so o ausente vira verdadeiro', () => {
    assert.strictEqual(camposDaConta(conta({ is_active: false }), false).is_active, false);
    assert.strictEqual(camposDaConta({ name: 'X' }, false).is_active, true);
});

test('tocaEmSaldo reconhece os dois campos', () => {
    assert.ok(tocaEmSaldo({ initial_balance: 0 }));
    assert.ok(tocaEmSaldo({ current_balance: 0 }));
    assert.ok(!tocaEmSaldo({ name: 'X' }));
});

import { camposDaConta as camposDaContaNova } from './contaBancaria.ts';

test('titular e PIX só vão ao banco quando vieram na conta (SQL pode não ter rodado)', () => {
    const sem = camposDaContaNova({ name: 'Itaú' }, true);
    assert.ok(!('titular' in sem) && !('chave_pix' in sem));

    const com = camposDaContaNova({ name: 'Itaú', titular: 'Sueli', chave_pix: '' }, false);
    assert.equal(com.titular, 'Sueli');
    assert.equal(com.chave_pix, null);
});
