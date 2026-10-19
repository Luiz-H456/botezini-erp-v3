import test from 'node:test';
import assert from 'node:assert';
import { semanasNoMes, capacidadeMensal, CAPACIDADE_SEMANAL_PADRAO } from './capacityCalendar.ts';

test('semanas do mês respeitam o calendário real', () => {
    assert.strictEqual(semanasNoMes('2026-02'), 4);              // 28 dias
    assert.strictEqual(semanasNoMes('2026-07'), 31 / 7);         // 31 dias
    assert.strictEqual(semanasNoMes('2026-04'), 30 / 7);         // 30 dias
});

test('ano bissexto é considerado', () => {
    assert.strictEqual(semanasNoMes('2028-02'), 29 / 7);
});

test('formato inválido cai no mês médio, nunca em NaN', () => {
    for (const entrada of [undefined, '', '2026', 'julho', '2026-7']) {
        const v = semanasNoMes(entrada as string | undefined);
        assert.ok(Number.isFinite(v) && v > 4 && v < 4.5, `entrada ${entrada} → ${v}`);
    }
});

test('capacidade mensal = gargalo semanal × semanas do mês', () => {
    assert.deepStrictEqual(capacidadeMensal(100, '2026-02'), { semanal: 100, mensal: 400 });
    assert.deepStrictEqual(capacidadeMensal(100, '2026-07'), { semanal: 100, mensal: 443 });
});

test('sem capacidade cadastrada usa o mesmo padrão do PCP', () => {
    assert.strictEqual(capacidadeMensal(0, '2026-02').semanal, CAPACIDADE_SEMANAL_PADRAO);
    assert.strictEqual(capacidadeMensal(undefined, '2026-02').semanal, CAPACIDADE_SEMANAL_PADRAO);
    // valor negativo é dado sujo — não pode virar capacidade negativa
    assert.strictEqual(capacidadeMensal(-50, '2026-02').semanal, CAPACIDADE_SEMANAL_PADRAO);
});

test('capacidade mensal é sempre positiva e inteira', () => {
    const { mensal } = capacidadeMensal(37, '2026-11');
    assert.ok(Number.isInteger(mensal) && mensal > 0);
});
