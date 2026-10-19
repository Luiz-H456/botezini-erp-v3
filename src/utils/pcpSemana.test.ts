import test from 'node:test';
import assert from 'node:assert';
import {
    somarDias, segundaDaSemana, domingoDaSemana, mesmaSemana, diasEntre, urgenciaDoPedido,
} from './pcpSemana.ts';

// Referência usada nos testes: 2026-08-05 é uma QUARTA-feira.
// Semana dela: segunda 2026-08-03 → domingo 2026-08-09.
const QUARTA = '2026-08-05';

test('somarDias atravessa virada de mês e de ano', () => {
    assert.strictEqual(somarDias('2026-08-30', 3), '2026-09-02');
    assert.strictEqual(somarDias('2026-12-31', 1), '2027-01-01');
    assert.strictEqual(somarDias('2026-03-01', -1), '2026-02-28');
});

test('somarDias atravessa horário de verão sem perder o dia', () => {
    // Datas montadas por componente local; mesmo com fuso mudando no meio,
    // somar 1 dia tem que andar exatamente 1 dia no calendário.
    assert.strictEqual(somarDias('2026-10-17', 1), '2026-10-18');
    assert.strictEqual(somarDias('2026-02-14', 1), '2026-02-15');
});

test('segundaDaSemana devolve a própria data quando já é segunda', () => {
    assert.strictEqual(segundaDaSemana('2026-08-03'), '2026-08-03');
});

test('segundaDaSemana volta para a segunda a partir de qualquer dia', () => {
    assert.strictEqual(segundaDaSemana(QUARTA), '2026-08-03');
    assert.strictEqual(segundaDaSemana('2026-08-07'), '2026-08-03');  // sexta
});

test('domingo pertence à semana que começou na segunda anterior', () => {
    // É a regra que separa esta convenção da semana "domingo a sábado" usada
    // no financeiro: aqui domingo FECHA a semana, não abre a próxima.
    assert.strictEqual(segundaDaSemana('2026-08-09'), '2026-08-03');
    assert.strictEqual(domingoDaSemana(QUARTA), '2026-08-09');
});

test('mesmaSemana separa sábado/domingo da segunda seguinte', () => {
    assert.ok(mesmaSemana('2026-08-03', '2026-08-09'));   // segunda e domingo, mesma semana
    assert.ok(!mesmaSemana('2026-08-09', '2026-08-10'));  // domingo e segunda, semanas diferentes
});

test('diasEntre conta corridos e fica negativo no passado', () => {
    assert.strictEqual(diasEntre(QUARTA, '2026-08-08'), 3);
    assert.strictEqual(diasEntre(QUARTA, QUARTA), 0);
    assert.strictEqual(diasEntre(QUARTA, '2026-08-01'), -4);
});

test('urgência: prazo vencido é atrasado', () => {
    assert.strictEqual(urgenciaDoPedido({ deadline: '2026-08-04' }, QUARTA), 'atrasado');
});

test('urgência: entrega hoje ainda não é atraso', () => {
    // O pedido vence hoje — tem o dia inteiro para sair. Marcar como atrasado
    // seria mentir e faria o quadro gritar sem motivo toda manhã.
    assert.strictEqual(urgenciaDoPedido({ deadline: QUARTA }, QUARTA), 'entrega-semana');
});

test('urgência: entrega nesta semana', () => {
    assert.strictEqual(urgenciaDoPedido({ deadline: '2026-08-07' }, QUARTA), 'entrega-semana');
    assert.strictEqual(urgenciaDoPedido({ deadline: '2026-08-09' }, QUARTA), 'entrega-semana');
});

test('urgência: entrega na semana seguinte é normal', () => {
    assert.strictEqual(urgenciaDoPedido({ deadline: '2026-08-10' }, QUARTA), 'normal');
});

test('urgência: início planejado nesta semana', () => {
    assert.strictEqual(
        urgenciaDoPedido({ deadline: '2026-09-30', inicioPlanejado: '2026-08-03' }, QUARTA),
        'inicio-semana',
    );
});

test('urgência: entrega da semana vence o início da semana', () => {
    // Os dois caem nesta semana. O prazo com o cliente é o que manda.
    assert.strictEqual(
        urgenciaDoPedido({ deadline: '2026-08-07', inicioPlanejado: '2026-08-03' }, QUARTA),
        'entrega-semana',
    );
});

test('urgência: atrasado vence tudo', () => {
    assert.strictEqual(
        urgenciaDoPedido({ deadline: '2026-08-01', inicioPlanejado: '2026-08-03' }, QUARTA),
        'atrasado',
    );
});

test('urgência: sem datas é normal', () => {
    assert.strictEqual(urgenciaDoPedido({}, QUARTA), 'normal');
    assert.strictEqual(urgenciaDoPedido({ deadline: null, inicioPlanejado: null }, QUARTA), 'normal');
});
