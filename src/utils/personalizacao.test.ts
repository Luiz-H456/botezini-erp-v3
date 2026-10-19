import test from 'node:test';
import assert from 'node:assert/strict';
import {
    sugerirPrecoBordado,
    precoDaTabela,
    resumirHistorico,
    compararTabelaComPraticado,
    coresDaArte,
    ritmoDeBordado,
    estimarTempo,
    type LinhaDePreco,
    type LancamentoDePersonalizacao,
} from './personalizacao.ts';

// --- sugestão de bordado -----------------------------------------------------

test('bordado: 8.000 pontos a R$ 3/mil sugere R$ 24', () => {
    const s = sugerirPrecoBordado(8000, { tecnica: 'bordado', preco_por_mil_pontos: 3 });
    assert.equal(s.valor, 24);
    assert.equal(s.aplicouMinimo, false);
    assert.match(s.memoria, /8\.000 pontos/);
});

test('bordado: o mínimo é piso, não teto', () => {
    const pequeno = sugerirPrecoBordado(500, { tecnica: 'bordado', preco_por_mil_pontos: 3, valor_minimo: 8 });
    assert.equal(pequeno.valor, 8);            // 1,50 pela regra de três → sobe para 8
    assert.equal(pequeno.aplicouMinimo, true);

    const grande = sugerirPrecoBordado(20000, { tecnica: 'bordado', preco_por_mil_pontos: 3, valor_minimo: 8 });
    assert.equal(grande.valor, 60);            // acima do mínimo, o mínimo não interfere
    assert.equal(grande.aplicouMinimo, false);
});

test('bordado: sem preço por mil pontos não inventa número', () => {
    const s = sugerirPrecoBordado(8000, { tecnica: 'bordado' });
    assert.equal(s.valor, null);
    assert.match(s.memoria, /Notas/);
});

test('bordado: sem pontos cai no mínimo, se houver', () => {
    assert.equal(sugerirPrecoBordado(null, { tecnica: 'bordado', preco_por_mil_pontos: 3, valor_minimo: 8 }).valor, 8);
    assert.equal(sugerirPrecoBordado(0, { tecnica: 'bordado', preco_por_mil_pontos: 3 }).valor, null);
});

test('bordado: a sugestão nunca vira NaN nem string vazia', () => {
    const casos: any[] = [undefined, null, NaN, -100, '', 'abc'];
    for (const pontos of casos) {
        for (const notas of [null, undefined, {}, { preco_por_mil_pontos: 3 }] as any[]) {
            const s = sugerirPrecoBordado(pontos, notas);
            assert.ok(s.valor === null || Number.isFinite(s.valor), `valor inválido para ${pontos}`);
            assert.ok(s.memoria.length > 0);
            assert.ok(!s.memoria.includes('NaN') && !s.memoria.includes('undefined'), s.memoria);
        }
    }
});

test('bordado: o valor da arte não entra no preço por peça', () => {
    const s = sugerirPrecoBordado(10000, { tecnica: 'bordado', preco_por_mil_pontos: 4, valor_da_arte: 150 });
    assert.equal(s.valor, 40);   // e não 190
});

// --- tabela ------------------------------------------------------------------

const tabela: LinhaDePreco[] = [
    { tecnica: 'bordado', descricao: 'Bordado peito', valor: 12 },
    { tecnica: 'bordado', descricao: 'Bordado peito (acima de 100)', valor: 9, faixa_min: 100 },
    { tecnica: 'dtf', descricao: 'DTF metro', valor: 60, unidade: 'm' },
    { tecnica: 'silk', descricao: 'Silk 1 cor', valor: 5, is_active: false },
];

test('tabela: faixa mais estreita ganha da genérica', () => {
    assert.equal(precoDaTabela(tabela, 'bordado', 30)?.valor, 12);
    assert.equal(precoDaTabela(tabela, 'bordado', 150)?.valor, 9);
});

test('tabela: linha inativa não é oferecida', () => {
    assert.equal(precoDaTabela(tabela, 'silk', 10), null);
});

test('tabela: técnica sem linha devolve null', () => {
    assert.equal(precoDaTabela(tabela, 'sublimacao', 10), null);
});

// --- histórico ---------------------------------------------------------------

const historico: LancamentoDePersonalizacao[] = [
    { tecnica: 'bordado', descricao: 'Logo A', quantidade: 500, valor_unitario: 3, data: '2026-01-10' },
    { tecnica: 'bordado', descricao: 'Logo B', quantidade: 2, valor_unitario: 20, data: '2026-03-02' },
    { tecnica: 'dtf', descricao: 'Estampa costas', quantidade: 10, valor_unitario: 6, data: '2026-02-01' },
];

test('histórico: a média é ponderada pela quantidade, não pelas linhas', () => {
    const r = resumirHistorico(historico, 'bordado')!;
    // (500×3 + 2×20) / 502 = 1540/502 = 3.07 — e não a média simples 11,50
    assert.equal(r.faturamento, 1540);
    assert.equal(r.quantidadeTotal, 502);
    assert.equal(r.valorMedio, 3.07);
});

test('histórico: mediana, extremos e última data', () => {
    const r = resumirHistorico(historico, 'bordado')!;
    assert.equal(r.valorMediano, 11.5);   // dois valores: (3+20)/2
    assert.equal(r.menorValor, 3);
    assert.equal(r.maiorValor, 20);
    assert.equal(r.ultimaData, '2026-03-02');
    assert.equal(r.lancamentos, 2);
});

test('histórico: técnica sem lançamento devolve null', () => {
    assert.equal(resumirHistorico(historico, 'sublimacao'), null);
});

test('histórico: quantidade zerada não produz NaN', () => {
    const r = resumirHistorico(
        [{ tecnica: 'silk', descricao: 'x', quantidade: 0, valor_unitario: 7, data: '2026-01-01' }],
        'silk')!;
    assert.equal(r.valorMedio, 7);
    assert.ok(Number.isFinite(r.valorMedio));
});

// --- divergência -------------------------------------------------------------

test('divergência: tabela R$ 12 e prática R$ 3,07 aparece como desconto', () => {
    const d = compararTabelaComPraticado(tabela, historico);
    const bordado = d.find(x => x.tecnica === 'bordado')!;
    assert.equal(bordado.tabelado, 12);
    assert.equal(bordado.praticado, 3.07);
    assert.equal(bordado.diferenca, -8.93);
    assert.ok(bordado.diferencaPct! < 0);
});

test('divergência: técnica sem linha na tabela não vira divisão por zero', () => {
    const d = compararTabelaComPraticado([], historico);
    for (const x of d) {
        assert.equal(x.tabelado, null);
        assert.equal(x.diferenca, null);
        assert.equal(x.diferencaPct, null);
    }
});

// --- artes -------------------------------------------------------------------

test('cores: separa por vírgula, barra e ponto-e-vírgula', () => {
    assert.deepEqual(coresDaArte('Branco, Azul Marinho / Dourado; Preto'),
        ['Branco', 'Azul Marinho', 'Dourado', 'Preto']);
    assert.deepEqual(coresDaArte(''), []);
    assert.deepEqual(coresDaArte(null), []);
    assert.deepEqual(coresDaArte('  ,  , Branco , '), ['Branco']);
});

test('ritmo: minutos por mil pontos vem das artes cronometradas', () => {
    const artes = [
        { id: '1', nome: 'A', pontos: 10000, tempo_minutos: 20 },
        { id: '2', nome: 'B', pontos: 5000, tempo_minutos: 10 },
        { id: '3', nome: 'C', pontos: 8000 },           // sem tempo: ignorada
    ];
    assert.equal(ritmoDeBordado(artes), 2);             // 30 min / 15 mil pontos
    assert.equal(estimarTempo(12000, 2), 24);
});

test('ritmo: sem nenhuma arte cronometrada não estima nada', () => {
    assert.equal(ritmoDeBordado([{ id: '1', nome: 'A', pontos: 9000 }]), null);
    assert.equal(estimarTempo(9000, null), null);
    assert.equal(estimarTempo(null, 2), null);
});
