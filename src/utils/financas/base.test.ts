import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    centavos, diasEntre, somarDias, ultimoDiaDoMes, mesAnterior, proximoMes,
    nomeDoMes, diaDaSemana, diaEMes, reais, trimestreDe, nomeDoTrimestre,
} from './base.ts';

test('centavos arredonda meio centavo para cima', () => {
    assert.equal(centavos(49.9995), 50);
    assert.equal(centavos(0.1 + 0.2), 0.3);
});

test('diasEntre conta dias de calendário, atravessando mês', () => {
    assert.equal(diasEntre('2026-09-30', '2026-10-06'), 6);
    assert.equal(diasEntre('2026-10-06', '2026-10-06'), 0);
    assert.equal(diasEntre('2026-10-06', '2026-10-01'), -5);
});

test('somarDias e ultimoDiaDoMes atravessam mês e ano', () => {
    assert.equal(somarDias('2026-10-28', 6), '2026-11-03');
    assert.equal(somarDias('2026-12-30', 3), '2027-01-02');
    assert.equal(ultimoDiaDoMes('2026-02-10'), '2026-02-28');
    assert.equal(ultimoDiaDoMes('2026-10-06'), '2026-10-31');
});

test('meses vizinhos e nome do mês', () => {
    assert.equal(mesAnterior('2026-01'), '2025-12');
    assert.equal(proximoMes('2026-12'), '2027-01');
    assert.equal(nomeDoMes('2026-10'), 'outubro 2026');
});

test('trimestre civil de um mês', () => {
    assert.deepEqual(trimestreDe('2026-08'), ['2026-07', '2026-08', '2026-09']);
    assert.deepEqual(trimestreDe('2026-01'), ['2026-01', '2026-02', '2026-03']);
    assert.equal(nomeDoTrimestre('2026-11'), '4º trimestre 2026');
});

test('dia da semana e dia/mês curtos', () => {
    assert.equal(diaDaSemana('2026-10-06'), 'ter');
    assert.equal(diaEMes('2026-10-06'), '06/10');
});

test('reais formata com ponto de milhar e vírgula', () => {
    assert.equal(reais(1234567.5), 'R$ 1.234.567,50');
    assert.equal(reais(300), 'R$ 300,00');
    assert.equal(reais(-300), '-R$ 300,00');
});
