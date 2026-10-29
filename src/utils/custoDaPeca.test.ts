import test from 'node:test';
import assert from 'node:assert';
import {
    custoDaPeca, custoDoTecidoPorMetro, horasPorPeca, margemDoPreco,
    abaixoDoPiso, descreverFaltas, OVERHEAD_PADRAO,
} from './custoDaPeca.ts';
import type { ParametrosDoCusto } from './custoDaPeca.ts';

const perto = (a: number, b: number, tol = 0.005) =>
    assert.ok(Math.abs(a - b) < tol, `esperava ~${b}, veio ${a}`);

// Tudo cadastrado: tecido a R$ 20/m, 1,5 m por peça, overhead 40%,
// 2 operários entregando 40 peças/dia a R$ 15/h.
const completo = (): ParametrosDoCusto => ({
    consumoM: 1.5,
    tecido: { average_unit_cost: 20, unit: 'm' },
    overheadPercent: 40,
    operarios: 2,
    pecasPorDia: 40,
    custoHora: 15,
    aliquota: 0,
});

// ── custo do metro ──────────────────────────────────────────────────────────

test('tecido vendido por metro usa o custo direto', () => {
    assert.deepStrictEqual(custoDoTecidoPorMetro({ average_unit_cost: 18, unit: 'm' }), { valor: 18 });
});

test('tecido em kg converte pelo rendimento', () => {
    const r = custoDoTecidoPorMetro({ average_unit_cost: 32, unit: 'kg', rendimento: 3.2 });
    perto(r.valor!, 10);
});

test('kg sem rendimento é impossível de converter — devolve ausência, não o preço do quilo', () => {
    const r = custoDoTecidoPorMetro({ average_unit_cost: 32, unit: 'kg' });
    assert.strictEqual(r.valor, null);
    assert.strictEqual(r.falta, 'tecido-sem-rendimento');
});

test('kg com rendimento zero também é ausência', () => {
    assert.strictEqual(custoDoTecidoPorMetro({ average_unit_cost: 32, unit: 'kg', rendimento: 0 }).falta,
        'tecido-sem-rendimento');
});

test('KG maiúsculo e com espaço continua sendo peso', () => {
    assert.strictEqual(custoDoTecidoPorMetro({ average_unit_cost: 32, unit: ' KG ' }).falta,
        'tecido-sem-rendimento');
});

test('tecido sem custo e tecido não escolhido são faltas diferentes', () => {
    assert.strictEqual(custoDoTecidoPorMetro({ average_unit_cost: 0, unit: 'm' }).falta, 'tecido-sem-custo');
    assert.strictEqual(custoDoTecidoPorMetro(null).falta, 'tecido-nao-escolhido');
    assert.strictEqual(custoDoTecidoPorMetro(undefined).falta, 'tecido-nao-escolhido');
});

// ── horas por peça ──────────────────────────────────────────────────────────

test('a jornada da equipe se reparte entre as peças do dia', () => {
    perto(horasPorPeca(2, 40)!, 0.4);          // 2 × 8h ÷ 40 peças
    perto(horasPorPeca(1, 8)!, 1);
});

test('jornada diferente de 8h é respeitada', () => {
    perto(horasPorPeca(1, 10, 10)!, 1);
});

test('sem capacidade diária não há por onde repartir', () => {
    assert.strictEqual(horasPorPeca(2, 0), null);
    assert.strictEqual(horasPorPeca(2, null), null);
    assert.strictEqual(horasPorPeca(null, 40), null);
});

// ── a conta inteira ─────────────────────────────────────────────────────────

test('soma tecido, overhead e mão de obra', () => {
    const c = custoDaPeca(completo());
    perto(c.tecido!, 30);          // 20 × 1,5
    perto(c.overhead!, 12);        // 40% de 30
    perto(c.maoDeObra!, 6);        // 0,4 h × 15
    perto(c.producao, 48);
    assert.ok(c.completo);
    assert.deepStrictEqual(c.faltas, []);
});

test('sem imposto o piso é o próprio custo', () => {
    perto(custoDaPeca(completo()).piso, 48);
});

test('o imposto incide sobre a venda: divide por (1 − alíquota)', () => {
    const c = custoDaPeca({ ...completo(), aliquota: 0.06 });
    perto(c.piso, 48 / 0.94);
    assert.ok(c.piso > 48 * 1.06, 'multiplicar por (1+a) provisionaria imposto a menos');
});

test('alíquota absurda é limitada para o piso não ir ao infinito', () => {
    const c = custoDaPeca({ ...completo(), aliquota: 1 });
    assert.strictEqual(c.aliquota, 0.9);
    assert.ok(Number.isFinite(c.piso));
});

test('alíquota negativa é tratada como zero', () => {
    assert.strictEqual(custoDaPeca({ ...completo(), aliquota: -0.2 }).aliquota, 0);
});

// ── overhead ────────────────────────────────────────────────────────────────

test('overhead ausente cai no padrão da casa', () => {
    const c = custoDaPeca({ ...completo(), overheadPercent: undefined });
    perto(c.overhead!, 30 * (OVERHEAD_PADRAO / 100));
    assert.ok(c.completo, 'o padrão é convenção combinada, não dado inventado');
});

test('overhead zero explícito é zero, não o padrão', () => {
    perto(custoDaPeca({ ...completo(), overheadPercent: 0 }).overhead!, 0);
});

test('sem tecido conhecido não há sobre o que o overhead incidir', () => {
    const c = custoDaPeca({ ...completo(), tecido: null });
    assert.strictEqual(c.overhead, null);
});

// ── ausência declarada ──────────────────────────────────────────────────────

test('tecido sem custo: nada de tecido na conta, e a falta é nomeada', () => {
    const c = custoDaPeca({ ...completo(), tecido: { average_unit_cost: 0, unit: 'm' } });
    assert.strictEqual(c.tecido, null);
    assert.ok(c.faltas.includes('tecido-sem-custo'));
    assert.ok(!c.completo);
});

test('consumo não cadastrado zera o tecido mesmo com custo conhecido', () => {
    const c = custoDaPeca({ ...completo(), consumoM: null });
    assert.strictEqual(c.tecido, null);
    assert.ok(c.faltas.includes('consumo-nao-cadastrado'));
});

test('mão de obra ausente vira falta, e o resto da conta continua valendo', () => {
    const c = custoDaPeca({ ...completo(), custoHora: 0 });
    assert.strictEqual(c.maoDeObra, null);
    assert.ok(c.faltas.includes('mao-de-obra-nao-cadastrada'));
    perto(c.producao, 42, 0.01);   // tecido + overhead, sem mão de obra
    assert.ok(c.temAlgo, 'o parcial ainda é um piso útil');
    assert.ok(!c.completo);
});

test('nada cadastrado: producao zero, mas temAlgo é falso — não é custo zero', () => {
    const c = custoDaPeca({});
    assert.strictEqual(c.producao, 0);
    assert.strictEqual(c.temAlgo, false);
    assert.strictEqual(c.completo, false);
    assert.ok(c.faltas.length > 0);
});

test('as faltas viram uma frase legível', () => {
    assert.strictEqual(descreverFaltas([]), '');
    assert.strictEqual(descreverFaltas(['tecido-sem-custo']), 'tecido sem custo');
    assert.strictEqual(
        descreverFaltas(['tecido-sem-custo', 'mao-de-obra-nao-cadastrada']),
        'tecido sem custo e mão de obra não cadastrada');
    assert.strictEqual(
        descreverFaltas(['tecido-nao-escolhido', 'consumo-nao-cadastrado', 'mao-de-obra-nao-cadastrada']),
        'tecido não escolhido, consumo de tecido não cadastrado e mão de obra não cadastrada');
});

// ── margem ──────────────────────────────────────────────────────────────────

test('margem desconta o imposto da receita', () => {
    const c = custoDaPeca({ ...completo(), aliquota: 0.06 });
    // preço 100: recolhe 6, custa 48, sobram 46
    perto(margemDoPreco(100, c)!, 0.46);
});

test('margem sem imposto é o complemento do custo', () => {
    perto(margemDoPreco(96, custoDaPeca(completo()))!, 0.5);
});

test('sem custo conhecido a margem é null, nunca 100%', () => {
    const vazio = custoDaPeca({});
    assert.strictEqual(margemDoPreco(100, vazio), null);
});

test('preço zero ou ausente não produz margem', () => {
    const c = custoDaPeca(completo());
    assert.strictEqual(margemDoPreco(0, c), null);
    assert.strictEqual(margemDoPreco(null, c), null);
    assert.strictEqual(margemDoPreco(undefined, c), null);
});

test('preço abaixo do custo dá margem negativa, não zero', () => {
    assert.ok(margemDoPreco(30, custoDaPeca(completo()))! < 0);
});

// ── piso ────────────────────────────────────────────────────────────────────

test('abaixo do piso é exatamente abaixo, não igual', () => {
    const c = custoDaPeca(completo());
    assert.ok(abaixoDoPiso(47.99, c));
    assert.ok(!abaixoDoPiso(48, c));
    assert.ok(!abaixoDoPiso(60, c));
});

test('com custo parcial o piso continua valendo, e mais forte', () => {
    const c = custoDaPeca({ ...completo(), custoHora: 0 });   // piso = 42
    assert.ok(abaixoDoPiso(40, c), 'já não cobre nem o que se conhece');
    assert.ok(!abaixoDoPiso(45, c), 'cobre o conhecido; o que falta ainda pode derrubar');
});

test('sem custo conhecido nada é declarado abaixo do piso', () => {
    assert.ok(!abaixoDoPiso(1, custoDaPeca({})));
});

test('tabela verdade: custo de referência vence o custo médio; sem ela, vale o médio', () => {
    const base = { unit: 'kg', rendimento: 2, average_unit_cost: 20 };
    assert.equal(custoDoTecidoPorMetro({ ...base, custo_referencia: 30 }).valor, 15);
    assert.equal(custoDoTecidoPorMetro({ ...base, custo_referencia: null }).valor, 10);
});
