import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encaixeDtf, custoDtf, custoSilk, custoBordado } from './custosDePersonalizacao.ts';

// ── DTF: quantas cabem no rolo, e quantos metros lineares isso gasta ───────────────────────────
const rolo = { larguraUtilCm: 58, espacoCm: 1 };

test('encaixe: escolhe a orientação que gasta menos rolo', () => {
    // 10×8 cm em pé: (58+1)/(10+1) = 5 por linha; deitada (8 de largura): (59)/(9) = 6 por linha.
    // 30 peças: em pé 6 linhas × 9 cm = 53 cm; deitada 5 linhas × 11 cm = 54 cm → em pé vence.
    const e = encaixeDtf({ ...rolo, larguraCm: 10, alturaCm: 8, quantidade: 30 })!;
    assert.equal(e.girada, false);
    assert.equal(e.porLinha, 5);
    assert.equal(e.linhas, 6);
    assert.equal(e.comprimentoCm, 53, '6 linhas de 8 cm + 5 espaços de 1 cm');
    assert.ok(e.aproveitamento > 0 && e.aproveitamento <= 1);
});

test('encaixe: gira quando girar economiza', () => {
    // 25×5 cm: em pé (25 larg) cabem 2 por linha; deitada (5 larg) cabem 9.
    const e = encaixeDtf({ ...rolo, larguraCm: 25, alturaCm: 5, quantidade: 18 })!;
    assert.equal(e.girada, true);
    assert.equal(e.porLinha, 9);
    assert.equal(e.linhas, 2);
    assert.equal(e.comprimentoCm, 51, '2 linhas de 25 cm + 1 espaço');
});

test('encaixe: arte maior que o rolo nas duas orientações não cabe (null, nunca zero)', () => {
    assert.equal(encaixeDtf({ ...rolo, larguraCm: 70, alturaCm: 65, quantidade: 1 }), null);
    assert.equal(encaixeDtf({ ...rolo, larguraCm: 10, alturaCm: 8, quantidade: 0 }), null);
    assert.equal(encaixeDtf({ ...rolo, larguraUtilCm: 0, larguraCm: 10, alturaCm: 8, quantidade: 5 }), null);
});

test('custo do DTF: metros lineares × valor do metro + frete, dividido pelas peças', () => {
    const e = encaixeDtf({ ...rolo, larguraCm: 10, alturaCm: 8, quantidade: 30 })!;
    const c = custoDtf(e, { valorMetroLinear: 60, frete: 15 }, 30);
    assert.equal(c.metros, 0.53);
    assert.equal(c.total, 46.8, '0,53 m × 60 + 15');
    assert.equal(c.porPeca, 1.56);
});

// ── Silk: a grade da estamparia (tamanho × nº de cores) ────────────────────────────────────────
const grade = [
    { fornecedor_id: 'a', tamanho: 'A4', cores: 1, valor: 3 },
    { fornecedor_id: 'a', tamanho: 'A4', cores: 2, valor: 4.5 },
    { fornecedor_id: 'b', tamanho: 'A4', cores: 2, valor: 4 },
];

test('silk: valor da grade por estamparia, e a mais barata para o mesmo tamanho e cores', () => {
    const r = custoSilk(grade, 'A4', 2, 100);
    assert.deepEqual(r.map(x => [x.fornecedor_id, x.porPeca, x.total]), [['b', 4, 400], ['a', 4.5, 450]]);
    assert.deepEqual(custoSilk(grade, 'a4', 1, 10).map(x => x.fornecedor_id), ['a'], 'tamanho sem caso');
    assert.deepEqual(custoSilk(grade, 'A3', 1, 10), [], 'sem linha na grade não inventa preço');
});

// ── Bordado: arte uma vez + peças × (pontos/1000 × valor do milheiro) ─────────────────────────
test('bordado: a arte entra uma vez; cada peça paga os pontos, com o mínimo por peça', () => {
    const c = custoBordado({ pontos: 8000, quantidade: 50, precoPorMil: 0.5, valorMinimo: 3, valorDaArte: 60 })!;
    assert.equal(c.porPeca, 4, '8 mil pontos × 0,50');
    assert.equal(c.total, 260, '60 + 50 × 4');
    assert.equal(c.porPecaComArte, 5.2);
    const pequeno = custoBordado({ pontos: 2000, quantidade: 10, precoPorMil: 0.5, valorMinimo: 3, valorDaArte: 0 })!;
    assert.equal(pequeno.porPeca, 3, '1,00 pelos pontos, mas o mínimo é 3');
    assert.equal(pequeno.aplicouMinimo, true);
    assert.equal(custoBordado({ pontos: null, quantidade: 10, precoPorMil: 0.5, valorMinimo: null, valorDaArte: 0 }), null, 'sem pontos e sem mínimo não há conta');
});
