import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    podeEditar, motivoParaNaoEditar, preverReajuste, parcelasDaRecorrencia,
    preverMudancaDeData, sugerirMudancaDeData, comDiaDoMes, somarDias,
    ultimoDiaDoMes,
} from './reajusteDeContas.ts';
import type { ContaEditavel } from './reajusteDeContas.ts';

const conta = (over: Partial<ContaEditavel> = {}): ContaEditavel => ({
    id: 'c1',
    description: 'Energia',
    original_amount: 100,
    due_date: '2026-08-10',
    paid_amount: 0,
    ...over,
});

// ─── quem pode ser editada ───────────────────────────────────────────────────

test('conta sem pagamento aceita correção de valor', () => {
    assert.equal(podeEditar(conta()), true);
    assert.equal(motivoParaNaoEditar(conta()), null);
});

test('pagamento lançado tranca o valor — é aí que a imutabilidade importa', () => {
    const c = conta({ paid_amount: 40 });
    assert.equal(podeEditar(c), false);
    assert.match(motivoParaNaoEditar(c)!, /pagamento/i);
});

test('pagamento parcial também tranca: o "falta" já foi calculado contra o valor', () => {
    assert.equal(podeEditar(conta({ paid_amount: 0.01 })), false);
});

test('conta cancelada não é corrigida, é refeita', () => {
    assert.equal(podeEditar(conta({ cancelled_at: '2026-08-01' })), false);
    assert.equal(podeEditar(conta({ derived_status: 'cancelled' })), false);
});

test('conta inexistente responde em vez de estourar', () => {
    assert.equal(podeEditar(null), false);
    assert.match(motivoParaNaoEditar(undefined)!, /não encontrada/i);
});

// ─── reajuste ────────────────────────────────────────────────────────────────

const serie = [
    conta({ id: '1', original_amount: 100, due_date: '2026-08-10' }),
    conta({ id: '2', original_amount: 100, due_date: '2026-09-10' }),
    conta({ id: '3', original_amount: 100, due_date: '2026-10-10' }),
];

test('percentual aplica sobre cada parcela e soma a diferença', () => {
    const p = preverReajuste(serie, { modo: 'percentual', quantia: 10 });
    assert.equal(p.linhas.length, 3);
    assert.deepEqual(p.linhas.map(l => l.para), [110, 110, 110]);
    assert.equal(p.totalAtual, 300);
    assert.equal(p.totalNovo, 330);
    assert.equal(p.diferenca, 30);
});

test('percentual negativo é redução, não erro', () => {
    const p = preverReajuste(serie, { modo: 'percentual', quantia: -10 });
    assert.deepEqual(p.linhas.map(l => l.para), [90, 90, 90]);
    assert.equal(p.diferenca, -30);
});

test('percentual arredonda para centavo — não deixa fração de real na conta', () => {
    const p = preverReajuste([conta({ original_amount: 133.33 })], { modo: 'percentual', quantia: 7.5 });
    assert.equal(p.linhas[0].para, 143.33);
});

test('valor fixo soma reais em vez de porcentagem', () => {
    const p = preverReajuste(serie, { modo: 'valor', quantia: 15.5 });
    assert.deepEqual(p.linhas.map(l => l.para), [115.5, 115.5, 115.5]);
});

test('novoValor carimba o mesmo valor em todas', () => {
    const misto = [
        conta({ id: '1', original_amount: 90 }),
        conta({ id: '2', original_amount: 110, due_date: '2026-09-10' }),
    ];
    const p = preverReajuste(misto, { modo: 'novoValor', quantia: 100 });
    assert.deepEqual(p.linhas.map(l => l.para), [100, 100]);
    assert.deepEqual(p.linhas.map(l => l.de), [90, 110]);
});

test('a data de corte protege o passado', () => {
    const p = preverReajuste(serie, { modo: 'percentual', quantia: 10, aPartirDe: '2026-09-01' });
    assert.deepEqual(p.linhas.map(l => l.id), ['2', '3']);
    assert.equal(p.forintervalo, 1);
});

test('parcela paga fica de fora e é contada, não sumida', () => {
    const comPaga = [...serie, conta({ id: '4', paid_amount: 100, due_date: '2026-11-10' })];
    const p = preverReajuste(comPaga, { modo: 'percentual', quantia: 10 });
    assert.equal(p.linhas.length, 3);
    assert.equal(p.travadas, 1);
});

test('reajuste que zeraria a conta não passa — isso é cancelamento, não reajuste', () => {
    const p = preverReajuste([conta({ original_amount: 100 })], { modo: 'valor', quantia: -100 });
    assert.equal(p.linhas.length, 0);
    assert.equal(p.travadas, 1);
});

test('parcela que não muda de valor não entra na lista', () => {
    const p = preverReajuste(serie, { modo: 'novoValor', quantia: 100 });
    assert.equal(p.linhas.length, 0);
    assert.equal(p.diferenca, 0);
});

test('quantia zero não produz alteração nenhuma', () => {
    const p = preverReajuste(serie, { modo: 'percentual', quantia: 0 });
    assert.equal(p.linhas.length, 0);
});

test('a prévia sai em ordem de vencimento, não na ordem que veio', () => {
    const fora = [
        conta({ id: 'z', due_date: '2026-12-10' }),
        conta({ id: 'a', due_date: '2026-08-10' }),
    ];
    const p = preverReajuste(fora, { modo: 'percentual', quantia: 5 });
    assert.deepEqual(p.linhas.map(l => l.id), ['a', 'z']);
});

test('lista vazia devolve prévia zerada, não NaN', () => {
    const p = preverReajuste([], { modo: 'percentual', quantia: 10 });
    assert.deepEqual([p.linhas.length, p.totalAtual, p.totalNovo, p.diferenca], [0, 0, 0, 0]);
});

// ─── série ───────────────────────────────────────────────────────────────────

test('as parcelas da série vêm em ordem e sem a que está aberta na tela', () => {
    const todas = [
        conta({ id: '1', recurrence_id: 'r1', due_date: '2026-09-10' }),
        conta({ id: '2', recurrence_id: 'r1', due_date: '2026-08-10' }),
        conta({ id: '3', recurrence_id: 'outra', due_date: '2026-08-10' }),
    ];
    const r = parcelasDaRecorrencia(todas, 'r1', '2');
    assert.deepEqual(r.map(c => c.id), ['1']);
});

test('conta sem recorrência não tem série', () => {
    assert.deepEqual(parcelasDaRecorrencia([conta()], null), []);
    assert.deepEqual(parcelasDaRecorrencia([conta()], undefined), []);
});

// ─── mudança de data em lote ─────────────────────────────────────────────────

test('último dia do mês respeita fevereiro e ano bissexto', () => {
    assert.equal(ultimoDiaDoMes(2026, 2), 28);
    assert.equal(ultimoDiaDoMes(2028, 2), 29);
    assert.equal(ultimoDiaDoMes(2026, 4), 30);
    assert.equal(ultimoDiaDoMes(2026, 12), 31);
});

test('comDiaDoMes troca o dia mantendo mês e ano', () => {
    assert.equal(comDiaDoMes('2026-08-10', 15), '2026-08-15');
    assert.equal(comDiaDoMes('2026-08-10', 5), '2026-08-05');
});

test('dia 31 em fevereiro cai no último dia, não vaza para março', () => {
    assert.equal(comDiaDoMes('2026-02-10', 31), '2026-02-28');
    assert.equal(comDiaDoMes('2028-02-10', 31), '2028-02-29');
    assert.equal(comDiaDoMes('2026-04-10', 31), '2026-04-30');
});

test('somarDias atravessa mês e ano sem escorregar por fuso', () => {
    assert.equal(somarDias('2026-08-30', 5), '2026-09-04');
    assert.equal(somarDias('2026-12-30', 3), '2027-01-02');
    assert.equal(somarDias('2026-03-02', -5), '2026-02-25');
});

test('lote por dia do mês move cada parcela dentro do próprio mês', () => {
    const serie = [
        conta({ id: 'a', due_date: '2026-09-10' }),
        conta({ id: 'b', due_date: '2026-10-10' }),
        conta({ id: 'c', due_date: '2026-11-10' }),
    ];
    const p = preverMudancaDeData(serie, { modo: 'diaDoMes', dia: 20 });
    assert.deepEqual(p.linhas.map(l => l.para),
        ['2026-09-20', '2026-10-20', '2026-11-20']);
});

test('lote por deslocamento soma os mesmos dias em todas', () => {
    const serie = [
        conta({ id: 'a', due_date: '2026-09-10' }),
        conta({ id: 'b', due_date: '2026-10-10' }),
    ];
    const p = preverMudancaDeData(serie, { modo: 'deslocamento', dias: 30 });
    assert.deepEqual(p.linhas.map(l => l.para), ['2026-10-10', '2026-11-09']);
});

test('parcela que já vence no dia pedido não entra na lista', () => {
    const serie = [
        conta({ id: 'a', due_date: '2026-09-20' }),
        conta({ id: 'b', due_date: '2026-10-10' }),
    ];
    const p = preverMudancaDeData(serie, { modo: 'diaDoMes', dia: 20 });
    assert.equal(p.linhas.length, 1);
    assert.equal(p.linhas[0].id, 'b');
});

test('parcela com pagamento fica de fora e é contada à parte', () => {
    const serie = [
        conta({ id: 'a', due_date: '2026-09-10', paid_amount: 50 }),
        conta({ id: 'b', due_date: '2026-10-10' }),
    ];
    const p = preverMudancaDeData(serie, { modo: 'diaDoMes', dia: 20 });
    assert.equal(p.travadas, 1);
    assert.equal(p.linhas.length, 1);
});

test('data de corte deixa de fora quem vence antes', () => {
    const serie = [
        conta({ id: 'a', due_date: '2026-09-10' }),
        conta({ id: 'b', due_date: '2026-10-10' }),
        conta({ id: 'c', due_date: '2026-11-10' }),
    ];
    const p = preverMudancaDeData(serie, { modo: 'diaDoMes', dia: 20, aPartirDe: '2026-10-01' });
    assert.equal(p.forintervalo, 1);
    assert.deepEqual(p.linhas.map(l => l.id), ['b', 'c']);
});

test('mesma competência sugere trocar o dia do mês', () => {
    assert.deepEqual(sugerirMudancaDeData('2026-08-10', '2026-08-15'),
        { modo: 'diaDoMes', dia: 15 });
});

test('mês diferente sugere deslocar a série toda', () => {
    assert.deepEqual(sugerirMudancaDeData('2026-08-10', '2026-09-10'),
        { modo: 'deslocamento', dias: 31 });
    assert.deepEqual(sugerirMudancaDeData('2026-08-10', '2026-07-31'),
        { modo: 'deslocamento', dias: -10 });
});

test('sem mudança de data não há o que sugerir', () => {
    assert.equal(sugerirMudancaDeData('2026-08-10', '2026-08-10'), null);
    assert.equal(sugerirMudancaDeData('', '2026-08-10'), null);
});

test('lote de data preserva a ordem cronológica na prévia', () => {
    const serie = [
        conta({ id: 'c', due_date: '2026-11-10' }),
        conta({ id: 'a', due_date: '2026-09-10' }),
        conta({ id: 'b', due_date: '2026-10-10' }),
    ];
    const p = preverMudancaDeData(serie, { modo: 'diaDoMes', dia: 25 });
    assert.deepEqual(p.linhas.map(l => l.id), ['a', 'b', 'c']);
});
