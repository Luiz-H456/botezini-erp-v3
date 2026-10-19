import test from 'node:test';
import assert from 'node:assert';
import { isColunaAusente, ehValorDuplicado, isFuncaoAusente } from './postgrestErrors.ts';

test('reconhece o formato PGRST204 do PostgREST', () => {
    assert.ok(isColunaAusente({
        code: 'PGRST204',
        message: "Could not find the 'reference_photos' column of 'budgets' in the schema cache",
    }, 'reference_photos'));
});

test('reconhece o erro cru do Postgres 42703', () => {
    assert.ok(isColunaAusente({
        code: '42703',
        message: 'column "reference_photos" does not exist',
    }, 'reference_photos'));
});

test('reconhece pela mensagem mesmo sem codigo', () => {
    assert.ok(isColunaAusente({
        message: 'column "reference_photos" does not exist',
    }, 'reference_photos'));
});

test('nao confunde com erro de outra coluna', () => {
    assert.ok(!isColunaAusente({
        code: 'PGRST204',
        message: "Could not find the 'outra_coisa' column of 'budgets' in the schema cache",
    }, 'reference_photos'));
});

test('nao engole erro diferente que mencione a coluna', () => {
    // violacao de check constraint cita a coluna, mas a coluna EXISTE — deixar
    // passar aqui esconderia o bug de formato que a trava do SQL pega.
    assert.ok(!isColunaAusente({
        code: '23514',
        message: 'new row violates check constraint "budgets_reference_photos_array"',
    }, 'reference_photos'));
});

test('nulo, vazio e coluna vazia nao dao falso positivo', () => {
    assert.ok(!isColunaAusente(null, 'reference_photos'));
    assert.ok(!isColunaAusente(undefined, 'reference_photos'));
    assert.ok(!isColunaAusente({}, 'reference_photos'));
    assert.ok(!isColunaAusente({ message: 'qualquer coisa' }, ''));
});

test('usa details quando a mensagem nao traz a coluna', () => {
    assert.ok(isColunaAusente({
        code: '42703',
        message: 'erro ao inserir',
        details: 'column "reference_photos" does not exist',
    }, 'reference_photos'));
});

// ── ehValorDuplicado ────────────────────────────────────────────────────────

const COLISAO_DE_NUMERO = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "orders_order_number_unique"',
    details: 'Key (order_number)=(PED-2026-0031) already exists.',
};

test('reconhece a colisão pelo código 23505', () => {
    assert.ok(ehValorDuplicado(COLISAO_DE_NUMERO));
});

test('reconhece a colisão pelo texto, sem depender do código', () => {
    assert.ok(ehValorDuplicado({
        message: 'duplicate key value violates unique constraint',
    }));
});

test('o campo restringe: order_number bate, serial_number não', () => {
    assert.ok(ehValorDuplicado(COLISAO_DE_NUMERO, 'order_number'));
    assert.ok(!ehValorDuplicado(COLISAO_DE_NUMERO, 'serial_number'));
});

test('o campo é encontrado no nome do índice, não só no details', () => {
    assert.ok(ehValorDuplicado({
        code: '23505',
        message: 'duplicate key value violates unique constraint "orders_order_number_unique"',
    }, 'order_number'));
});

test('outro erro do Postgres não vira duplicidade', () => {
    assert.ok(!ehValorDuplicado({ code: '42703', message: 'column "x" does not exist' }));
    assert.ok(!ehValorDuplicado({ code: '23503', message: 'violates foreign key constraint' }));
});

test('erro ausente não quebra', () => {
    assert.ok(!ehValorDuplicado(null));
    assert.ok(!ehValorDuplicado(undefined));
    assert.ok(!ehValorDuplicado({}));
});

test('sem campo, qualquer duplicidade responde verdadeiro', () => {
    assert.ok(ehValorDuplicado({ code: '23505', message: 'duplicate key value' }));
});

// ── isFuncaoAusente ─────────────────────────────────────────────────────────

test('reconhece a função ausente pelo PGRST202', () => {
    assert.ok(isFuncaoAusente({
        code: 'PGRST202',
        message: "Could not find the function public.baixar_estoque_da_producao(...) in the schema cache",
    }, 'baixar_estoque_da_producao'));
});

test('reconhece a função ausente pelo 42883 do Postgres', () => {
    assert.ok(isFuncaoAusente({
        code: '42883',
        message: 'function public.baixar_estoque_da_producao(uuid, text) does not exist',
    }));
});

test('o nome restringe: outra função não bate', () => {
    const erro = {
        code: 'PGRST202',
        message: 'Could not find the function public.log_production in the schema cache',
    };
    assert.ok(isFuncaoAusente(erro, 'log_production'));
    assert.ok(!isFuncaoAusente(erro, 'baixar_estoque_da_producao'));
});

test('coluna ausente não é função ausente', () => {
    assert.ok(!isFuncaoAusente({ code: 'PGRST204', message: "Could not find the 'x' column" }));
});

test('erro ausente não quebra isFuncaoAusente', () => {
    assert.ok(!isFuncaoAusente(null));
    assert.ok(!isFuncaoAusente({}));
});
