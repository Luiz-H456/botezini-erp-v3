import test from 'node:test';
import assert from 'node:assert';
import {
    ehTecido, previstoDeTecidos, razaoDoCorte, classificar, resumirRendimento,
    tendenciaDoCorte, TOLERANCIA, MINIMO_PARA_TENDENCIA, ROTULO_DO_VEREDITO,
} from './rendimentoDoCorte.ts';
import type { RegistroDeCorte } from './rendimentoDoCorte.ts';

const perto = (a: number, b: number, tol = 0.0005) =>
    assert.ok(Math.abs(a - b) < tol, `esperava ~${b}, veio ${a}`);

// ── o que é tecido ──────────────────────────────────────────────────────────

test('família cadastrada decide sozinha', () => {
    assert.ok(ehTecido({ id: 'a', fabric_family: 'MALHA PV', unit: 'un' }));
});

test('sem família, a unidade decide', () => {
    assert.ok(ehTecido({ id: 'a', unit: 'm' }));
    assert.ok(ehTecido({ id: 'a', unit: 'KG' }));
    assert.ok(ehTecido({ id: 'a', unit: ' Metros ' }));
});

test('a categoria é a terceira porta', () => {
    assert.ok(ehTecido({ id: 'a', unit: 'un', category: 'Tecidos leves' }));
});

test('botão em unidade não é tecido', () => {
    assert.ok(!ehTecido({ id: 'a', unit: 'un', name: 'BOTAO' }));
    assert.ok(!ehTecido(null));
    assert.ok(!ehTecido(undefined));
});

test('família em branco não conta como família', () => {
    assert.ok(!ehTecido({ id: 'a', fabric_family: '   ', unit: 'un' }));
});

// ── o previsto ──────────────────────────────────────────────────────────────

const insumos = [
    { id: 'malha', name: 'MALHA PV', unit: 'm', fabric_family: 'PV' },
    { id: 'brim', name: 'BRIM', unit: 'kg' },
    { id: 'botao', name: 'BOTAO', unit: 'un' },
];

test('fica só com os tecidos, e do maior para o menor', () => {
    const p = previstoDeTecidos([
        { insumo_id: 'botao', quantidade: 200 },
        { insumo_id: 'malha', quantidade: 15 },
        { insumo_id: 'brim', quantidade: 40 },
    ], insumos);
    assert.deepStrictEqual(p.map(x => x.insumo_id), ['brim', 'malha']);
});

test('a unidade do insumo acompanha o previsto', () => {
    const p = previstoDeTecidos([{ insumo_id: 'brim', quantidade: 40 }], insumos);
    assert.strictEqual(p[0].unidade, 'kg');
});

test('insumo desconhecido não vira tecido por acidente', () => {
    assert.deepStrictEqual(previstoDeTecidos([{ insumo_id: 'fantasma', quantidade: 5 }], insumos), []);
});

test('lista vazia ou ausente não quebra', () => {
    assert.deepStrictEqual(previstoDeTecidos([], insumos), []);
    assert.deepStrictEqual(previstoDeTecidos(null, insumos), []);
    assert.deepStrictEqual(previstoDeTecidos([{ insumo_id: 'malha', quantidade: 1 }], null), []);
});

// ── a razão ─────────────────────────────────────────────────────────────────

test('a razão é gasto sobre previsto', () => {
    perto(razaoDoCorte({ insumo_id: 'm', previsto: 100, gasto: 112 })!, 1.12);
});

test('sem gasto informado não há razão — e não é 1', () => {
    assert.strictEqual(razaoDoCorte({ insumo_id: 'm', previsto: 100 }), null);
    assert.strictEqual(razaoDoCorte({ insumo_id: 'm', previsto: 100, gasto: null }), null);
    assert.strictEqual(razaoDoCorte({ insumo_id: 'm', previsto: 100, gasto: 0 }), null);
});

test('previsto zero não divide por zero', () => {
    assert.strictEqual(razaoDoCorte({ insumo_id: 'm', previsto: 0, gasto: 50 }), null);
});

// ── o veredito ──────────────────────────────────────────────────────────────

test('a tolerância separa variação normal de desperdício', () => {
    assert.strictEqual(classificar(1), 'dentro');
    assert.strictEqual(classificar(1 + TOLERANCIA), 'dentro');
    assert.strictEqual(classificar(1 + TOLERANCIA + 0.001), 'desperdicio');
    assert.strictEqual(classificar(1 - TOLERANCIA), 'dentro');
    assert.strictEqual(classificar(1 - TOLERANCIA - 0.001), 'economia');
});

test('razão ausente não vira veredito', () => {
    assert.strictEqual(classificar(null), null);
    assert.strictEqual(classificar(undefined), null);
    assert.strictEqual(classificar(NaN), null);
});

test('todo veredito tem rótulo', () => {
    for (const v of Object.values(ROTULO_DO_VEREDITO)) assert.ok(v.length > 0);
});

// ── o resumo ────────────────────────────────────────────────────────────────

test('a razão da casa é ponderada pelo volume, não média das razões', () => {
    // Um corte pequeno terrível e um grande bom: a média simples diria 1,25;
    // ponderada diz 1,02, que é o que a fábrica de fato gastou.
    const r = resumirRendimento([
        { insumo_id: 'malha', previsto: 2, gasto: 3 },      // razão 1,5
        { insumo_id: 'malha', previsto: 200, gasto: 202 },  // razão 1,01
    ]);
    perto(r.razao!, 205 / 202);
    assert.ok(r.razao! < 1.02, 'o corte de 2 m não pode mandar no número');
});

test('registros sem gasto entram como pendentes e ficam fora da conta', () => {
    const r = resumirRendimento([
        { insumo_id: 'malha', previsto: 100, gasto: 110 },
        { insumo_id: 'malha', previsto: 50 },
    ]);
    assert.strictEqual(r.amostras, 1);
    assert.strictEqual(r.pendentes, 1);
    assert.strictEqual(r.previsto, 100, 'o previsto sem gasto não infla o denominador');
});

test('o excedente diz quanto material foi embora', () => {
    const r = resumirRendimento([{ insumo_id: 'malha', previsto: 100, gasto: 118 }]);
    perto(r.excedente, 18);
    assert.strictEqual(r.veredito, 'desperdicio');
});

test('agrupa por tecido e ordena pelo que mais escapou', () => {
    const r = resumirRendimento([
        { insumo_id: 'malha', insumo_name: 'MALHA', previsto: 100, gasto: 105 },
        { insumo_id: 'brim', insumo_name: 'BRIM', previsto: 100, gasto: 140 },
    ]);
    assert.deepStrictEqual(r.porTecido.map(t => t.insumo_id), ['brim', 'malha']);
    assert.strictEqual(r.porTecido[0].amostras, 1);
    perto(r.porTecido[0].razao, 1.4);
});

test('o mesmo tecido em cortes diferentes soma numa linha', () => {
    const r = resumirRendimento([
        { insumo_id: 'malha', insumo_name: 'MALHA', previsto: 100, gasto: 110 },
        { insumo_id: 'malha', insumo_name: 'MALHA', previsto: 100, gasto: 130 },
    ]);
    assert.strictEqual(r.porTecido.length, 1);
    assert.strictEqual(r.porTecido[0].amostras, 2);
    perto(r.porTecido[0].razao, 1.2);
});

test('sem registro nenhum, razão null e nada de NaN', () => {
    const r = resumirRendimento([]);
    assert.strictEqual(r.razao, null);
    assert.strictEqual(r.veredito, null);
    assert.strictEqual(r.excedente, 0);
    assert.deepStrictEqual(r.porTecido, []);
    assert.deepStrictEqual(resumirRendimento(null).porTecido, []);
});

// ── a tendência ─────────────────────────────────────────────────────────────

const serie = (razoes: number[]): RegistroDeCorte[] =>
    razoes.map((r, i) => ({
        insumo_id: 'malha',
        previsto: 100,
        gasto: 100 * r,
        data: `2026-0${1 + Math.floor(i / 9)}-${String((i % 9) + 1).padStart(2, '0')}`,
    }));

test('abaixo do mínimo não afirma tendência', () => {
    assert.strictEqual(tendenciaDoCorte(serie([1.2, 1.1, 1.05])), null);
    assert.strictEqual(tendenciaDoCorte(serie(Array(MINIMO_PARA_TENDENCIA - 1).fill(1.1))), null);
});

test('encaixe melhorando é detectado', () => {
    const t = tendenciaDoCorte(serie([1.3, 1.3, 1.3, 1.05, 1.05, 1.05]))!;
    assert.ok(t.melhorou);
    perto(t.antes, 1.3);
    perto(t.depois, 1.05);
    assert.ok(t.variacao < 0);
    assert.strictEqual(t.amostras, 6);
});

test('encaixe piorando também', () => {
    const t = tendenciaDoCorte(serie([1.0, 1.0, 1.0, 1.2, 1.2, 1.2]))!;
    assert.ok(!t.melhorou);
    assert.ok(t.variacao > 0);
});

test('a tendência lê a ordem do tempo, não a de chegada', () => {
    const fora = [...serie([1.0, 1.0, 1.0, 1.2, 1.2, 1.2])].reverse();
    const t = tendenciaDoCorte(fora)!;
    assert.ok(!t.melhorou, 'invertida na entrada, a série ainda piora no tempo');
});

test('registros sem gasto não entram na tendência', () => {
    const com = serie([1.2, 1.2, 1.2, 1.0, 1.0, 1.0]);
    const misturado = [...com, { insumo_id: 'malha', previsto: 100, data: '2026-03-01' }];
    const t = tendenciaDoCorte(misturado)!;
    assert.strictEqual(t.amostras, 6);
});
