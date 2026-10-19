import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    valorDoCiclo, pecasDoCiclo, agendaDoContrato, resumirContrato, sugerirContrato,
} from './contratoRecorrente.ts';
import type { ContratoRecorrente } from './contratoRecorrente.ts';

const base: ContratoRecorrente = {
    client_id: 'cli-1',
    periodicidade: 'mensal',
    inicio: '2026-01-10',
    ciclos: 3,
    itens: [
        { produto: 'Camisa Brim', quantidade: 100, precoUnitario: 40 },
        { produto: 'Calça', quantidade: 50, precoUnitario: 60 },
    ],
};

test('o ciclo soma quantidade × preço de cada item', () => {
    assert.equal(valorDoCiclo(base.itens), 7000);
    assert.equal(pecasDoCiclo(base.itens), 150);
});

test('a agenda tem uma entrega por ciclo, no passo da periodicidade', () => {
    const a = agendaDoContrato(base);
    assert.deepEqual(a.map(e => e.data), ['2026-01-10', '2026-02-10', '2026-03-10']);
});

test('trimestral avança de três em três meses', () => {
    const a = agendaDoContrato({ ...base, periodicidade: 'trimestral', ciclos: 3 });
    assert.deepEqual(a.map(e => e.data), ['2026-01-10', '2026-04-10', '2026-07-10']);
});

test('dia 31 não escorrega para o mês seguinte', () => {
    // 31/01 + 1 mês = 28/02, não 03/03. O contrato que vira o mês sozinho
    // produz entrega em data que ninguém combinou.
    const a = agendaDoContrato({ ...base, inicio: '2026-01-31', ciclos: 2 });
    assert.deepEqual(a.map(e => e.data), ['2026-01-31', '2026-02-28']);
});

test('sem reajuste, todo ciclo vale o mesmo', () => {
    const a = agendaDoContrato({ ...base, ciclos: 13 });
    assert.equal(a[0].valor, a[12].valor);
    assert.equal(a.some(e => e.reajustado), true, 'ainda marca a virada do ano');
});

test('o reajuste entra depois de 12 meses do início, não no ano-calendário', () => {
    const a = agendaDoContrato({ ...base, ciclos: 14, reajusteAnualPct: 10 });
    // Ciclos 1..12 = meses 0..11 (mesmo ano de contrato). Ciclo 13 = mês 12.
    assert.equal(a[11].valor, 7000, 'décimo segundo ciclo ainda sem reajuste');
    assert.equal(a[12].valor, 7700, 'décimo terceiro já reajustado');
    assert.equal(a[11].reajustado, false);
    assert.equal(a[12].reajustado, true);
});

test('o reajuste é composto ano a ano, não somado', () => {
    const a = agendaDoContrato({ ...base, ciclos: 25, reajusteAnualPct: 10 });
    // 7000 × 1,1² = 8470 — somar daria 8400.
    assert.equal(a[24].valor, 8470);
});

test('o resumo traz total, peças e duração', () => {
    const r = resumirContrato(base);
    assert.equal(r.valorDoCiclo, 7000);
    assert.equal(r.valorTotal, 21000);
    assert.equal(r.pecasTotais, 450);
    assert.equal(r.primeiraEntrega, '2026-01-10');
    assert.equal(r.ultimaEntrega, '2026-03-10');
    assert.equal(r.duracaoMeses, 2);
});

test('contrato de zero ciclos não gera agenda nem NaN', () => {
    const r = resumirContrato({ ...base, ciclos: 0 });
    assert.equal(r.valorTotal, 0);
    assert.equal(r.primeiraEntrega, undefined);
    assert.equal(r.duracaoMeses, 0);
});

test('contrato sem itens vale zero, sem quebrar', () => {
    assert.equal(valorDoCiclo([]), 0);
    assert.equal(resumirContrato({ ...base, itens: [] }).valorTotal, 0);
});

// ── Sugestão a partir do histórico ──────────────────────────────────────────

const pecas = [
    { produto: 'Camisa Brim', quantidadeOrcada: 400, aparicoes: 4, precoMedio: 37 },
    { produto: 'Calça', quantidadeOrcada: 100, aparicoes: 2, precoMedio: 60 },
];

test('a quantidade sugerida é a média por pedido, não o total histórico', () => {
    const c = sugerirContrato('cli-1', 30, pecas, '2026-09-01')!;
    // 400 peças em 4 aparições = 100 por ciclo. O total proporia 400/mês.
    assert.equal(c.itens[0].quantidade, 100);
    assert.equal(c.itens[1].quantidade, 50);
});

test('a periodicidade sai do intervalo entre pedidos, na régua comercial', () => {
    assert.equal(sugerirContrato('c', 30, pecas, '2026-01-01')!.periodicidade, 'mensal');
    assert.equal(sugerirContrato('c', 60, pecas, '2026-01-01')!.periodicidade, 'bimestral');
    assert.equal(sugerirContrato('c', 100, pecas, '2026-01-01')!.periodicidade, 'trimestral');
    assert.equal(sugerirContrato('c', 200, pecas, '2026-01-01')!.periodicidade, 'semestral');
    assert.equal(sugerirContrato('c', 400, pecas, '2026-01-01')!.periodicidade, 'anual');
});

test('sem histórico de intervalo, assume mensal', () => {
    assert.equal(sugerirContrato('c', null, pecas, '2026-01-01')!.periodicidade, 'mensal');
});

test('peça sem preço não entra na sugestão', () => {
    const c = sugerirContrato('c', 30, [
        { produto: 'X', quantidadeOrcada: 10, aparicoes: 1, precoMedio: 0 },
    ], '2026-01-01');
    assert.equal(c, null, 'sem nada precificável não há contrato a propor');
});

test('cliente sem peças não gera sugestão', () => {
    assert.equal(sugerirContrato('c', 30, [], '2026-01-01'), null);
});

test('a sugestão usa o preço médio praticado, que é o argumento de travar', () => {
    const c = sugerirContrato('c', 30, pecas, '2026-01-01')!;
    assert.equal(c.itens[0].precoUnitario, 37);
});
