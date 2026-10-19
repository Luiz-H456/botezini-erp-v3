import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    chaveDaSerie,
    parcelasDaSerie,
    preverCancelamentoDaSerie,
    resumoDoCancelamento,
    type ContaDaSerie,
} from './serieDeContas.ts';

const conta = (p: Partial<ContaDaSerie> & { id: string }): ContaDaSerie => ({
    payment_count: 0, original_amount: 100, ...p,
});

// ── que série é esta ────────────────────────────────────────────────────────

test('reconhece recorrencia e parcelamento como series diferentes', () => {
    assert.deepEqual(chaveDaSerie(conta({ id: '1', recurrence_id: 'r1' })),
        { tipo: 'recorrencia', id: 'r1' });
    assert.deepEqual(chaveDaSerie(conta({ id: '2', split_group_id: 's1' })),
        { tipo: 'parcelamento', id: 's1' });
});

test('conta avulsa nao pertence a serie nenhuma', () => {
    assert.equal(chaveDaSerie(conta({ id: '1' })), null);
    assert.deepEqual(parcelasDaSerie([conta({ id: '1' })], conta({ id: '1' })), []);
});

test('com as duas colunas, a recorrencia manda — e o grupo maior', () => {
    assert.deepEqual(chaveDaSerie(conta({ id: '1', recurrence_id: 'r1', split_group_id: 's1' })),
        { tipo: 'recorrencia', id: 'r1' });
});

test('junta a serie inteira, a propria inclusive, por vencimento', () => {
    const todas = [
        conta({ id: 'b', recurrence_id: 'r1', due_date: '2026-02-10' }),
        conta({ id: 'a', recurrence_id: 'r1', due_date: '2026-01-10' }),
        conta({ id: 'x', recurrence_id: 'outra', due_date: '2026-01-10' }),
        conta({ id: 'c', recurrence_id: 'r1', due_date: '2026-03-10' }),
    ];
    const achadas = parcelasDaSerie(todas, todas[1]).map(c => c.id);
    assert.deepEqual(achadas, ['a', 'b', 'c']);
});

test('nao confunde parcelamento com recorrencia de mesmo id', () => {
    // Ids diferentes por natureza, mas se um dia colidirem o campo consultado
    // e que tem de ser o certo — nao o valor.
    const todas = [
        conta({ id: '1', recurrence_id: 'mesmo' }),
        conta({ id: '2', split_group_id: 'mesmo' }),
    ];
    assert.deepEqual(parcelasDaSerie(todas, todas[1]).map(c => c.id), ['2']);
});

// ── a previsão ──────────────────────────────────────────────────────────────

test('parcela com pagamento ativo fica de fora, nao no bolo do cancelamento', () => {
    const p = preverCancelamentoDaSerie([
        conta({ id: '1', payment_count: 1 }),
        conta({ id: '2' }),
        conta({ id: '3' }),
    ]);
    assert.deepEqual(p.cancelar.map(c => c.id), ['2', '3']);
    assert.deepEqual(p.manterPorPagamento.map(c => c.id), ['1']);
});

test('ja cancelada nao entra de novo, e nao vira "mantida por pagamento"', () => {
    const p = preverCancelamentoDaSerie([
        conta({ id: '1', cancelled_at: '2026-08-01' }),
        conta({ id: '2' }),
    ]);
    assert.deepEqual(p.cancelar.map(c => c.id), ['2']);
    assert.deepEqual(p.jaCanceladas.map(c => c.id), ['1']);
    assert.equal(p.manterPorPagamento.length, 0);
});

test('cancelada QUE TEM pagamento conta como ja cancelada, nao como mantida', () => {
    // A ordem dos testes importa: cancelled_at vem antes de payment_count,
    // senao uma parcela ja resolvida apareceria no aviso como se estivesse
    // travando o cancelamento.
    const p = preverCancelamentoDaSerie([
        conta({ id: '1', cancelled_at: '2026-08-01', payment_count: 2 }),
    ]);
    assert.deepEqual(p.jaCanceladas.map(c => c.id), ['1']);
    assert.equal(p.manterPorPagamento.length, 0);
});

test('apenasFuturas preserva o que ja venceu', () => {
    const p = preverCancelamentoDaSerie([
        conta({ id: 'passada', due_date: '2026-01-10' }),
        conta({ id: 'hoje', due_date: '2026-09-03' }),
        conta({ id: 'futura', due_date: '2026-10-10' }),
    ], { apenasFuturas: true, hoje: '2026-09-03' });
    assert.deepEqual(p.cancelar.map(c => c.id), ['futura']);
});

test('sem apenasFuturas, a data nao importa', () => {
    const p = preverCancelamentoDaSerie([
        conta({ id: 'passada', due_date: '2026-01-10' }),
        conta({ id: 'futura', due_date: '2026-10-10' }),
    ], { hoje: '2026-09-03' });
    assert.deepEqual(p.cancelar.map(c => c.id), ['passada', 'futura']);
});

test('soma o valor que sai da previsao de caixa', () => {
    const p = preverCancelamentoDaSerie([
        conta({ id: '1', original_amount: 1850 }),
        conta({ id: '2', original_amount: 1850 }),
        conta({ id: '3', original_amount: 1850, payment_count: 1 }),
    ]);
    assert.equal(p.valorCancelado, 3700, 'a paga nao entra na soma');
});

// ── o aviso ─────────────────────────────────────────────────────────────────

test('o aviso diz quantas caem E quantas ficam, com o motivo', () => {
    const p = preverCancelamentoDaSerie([
        conta({ id: '1' }), conta({ id: '2' }), conta({ id: '3', payment_count: 1 }),
    ]);
    const t = resumoDoCancelamento(p, 'recorrencia');
    assert.match(t, /2 parcelas desta recorrência serão canceladas/);
    assert.match(t, /1 fica de fora/);
    assert.match(t, /estorne o pagamento antes/);
});

test('o aviso fala no singular quando e uma so', () => {
    const t = resumoDoCancelamento(preverCancelamentoDaSerie([conta({ id: '1' })]), 'parcelamento');
    assert.match(t, /1 parcela deste parcelamento será cancelada/);
    // "desta parcelamento" foi o que este teste pegou na primeira execucao.
    assert.doesNotMatch(t, /desta parcelamento/);
    assert.doesNotMatch(t, /serão/);
});

test('quando nada pode ser cancelado, o aviso diz POR QUE', () => {
    // "Nenhuma parcela sera cancelada" sozinho faz a pessoa clicar de novo
    // achando que travou.
    const p = preverCancelamentoDaSerie([conta({ id: '1', payment_count: 1 })]);
    const t = resumoDoCancelamento(p, 'recorrencia');
    assert.match(t, /já têm pagamento registrado/);
});

test('serie vazia nao produz aviso que promete acao', () => {
    const t = resumoDoCancelamento(preverCancelamentoDaSerie([]), 'recorrencia');
    assert.match(t, /Não há nenhuma parcela em aberto/);
    assert.doesNotMatch(t, /será cancelada/);
});
