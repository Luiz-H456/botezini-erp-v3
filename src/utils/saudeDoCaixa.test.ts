import test from 'node:test';
import assert from 'node:assert';
import {
    projetarSaldo, resumirFechamento, calcularPontoDeEquilibrio, lerSaude,
} from './saudeDoCaixa.ts';
import type { MovimentoPrevisto, BaseDoEquilibrio } from './saudeDoCaixa.ts';

const entra = (data: string, valor: number): MovimentoPrevisto => ({ data, valor, entra: true });
const sai = (data: string, valor: number): MovimentoPrevisto => ({ data, valor, entra: false });

// ── Projeção de saldo ───────────────────────────────────────────────────────

test('todo dia do intervalo aparece, mesmo sem movimento', () => {
    // Saltar os dias parados distorceria a inclinação da linha: dois dias
    // distantes viravam pontos vizinhos e a queda parecia mais suave.
    const p = projetarSaldo(1000, [], '2026-03-01', '2026-03-05');
    assert.strictEqual(p.length, 5);
    assert.deepStrictEqual(p.map(x => x.saldo), [1000, 1000, 1000, 1000, 1000]);
});

test('o saldo acumula entradas e saídas dia a dia', () => {
    const p = projetarSaldo(1000, [
        entra('2026-03-02', 500),
        sai('2026-03-03', 200),
    ], '2026-03-01', '2026-03-04');
    assert.deepStrictEqual(p.map(x => x.saldo), [1000, 1500, 1300, 1300]);
});

test('quem paga e recebe no mesmo dia não fica negativo pela ordem do lançamento', () => {
    // O saldo é o do FIM do dia. Se fosse movimento a movimento, lançar a saída
    // antes da entrada acusaria um negativo que nunca existiu.
    const p = projetarSaldo(0, [sai('2026-03-02', 800), entra('2026-03-02', 1000)], '2026-03-01', '2026-03-02');
    assert.strictEqual(p[1].saldo, 200);
    assert.strictEqual(p[1].entradas, 1000);
    assert.strictEqual(p[1].saidas, 800);
});

test('movimento fora do intervalo é ignorado', () => {
    const p = projetarSaldo(100, [entra('2026-02-25', 9999), entra('2026-04-02', 9999)], '2026-03-01', '2026-03-03');
    assert.deepStrictEqual(p.map(x => x.saldo), [100, 100, 100]);
});

test('a projeção atravessa a virada do mês', () => {
    const p = projetarSaldo(0, [entra('2026-04-01', 50)], '2026-03-30', '2026-04-02');
    assert.deepStrictEqual(p.map(x => x.data), ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02']);
    assert.strictEqual(p[3].saldo, 50);
});

// ── Fechamento ──────────────────────────────────────────────────────────────

test('o mês pode fechar positivo E ter passado pelo vermelho', () => {
    // É o número que evita o cheque especial, e é o que o saldo final esconde.
    const pontos = projetarSaldo(1000, [
        sai('2026-03-18', 5000),    // folha
        entra('2026-03-25', 6000),  // cliente grande
    ], '2026-03-01', '2026-03-31');
    const f = resumirFechamento(pontos, 1000);

    assert.strictEqual(f.saldoFinal, 2000);
    assert.strictEqual(f.fecha, true);
    assert.strictEqual(f.primeiroDiaNegativo, '2026-03-18');
    assert.strictEqual(f.fechaMasFuraNoMeio, true, 'fechar bem não é nunca faltar dinheiro');
    assert.strictEqual(f.menorSaldo, -4000);
    assert.strictEqual(f.diaDoMenorSaldo, '2026-03-18');
});

test('mês que nunca fica negativo não acusa furo', () => {
    const pontos = projetarSaldo(1000, [entra('2026-03-10', 500)], '2026-03-01', '2026-03-31');
    const f = resumirFechamento(pontos, 1000);
    assert.strictEqual(f.primeiroDiaNegativo, null);
    assert.strictEqual(f.fechaMasFuraNoMeio, false);
    assert.strictEqual(f.fecha, true);
});

test('mês que termina negativo não fecha', () => {
    const pontos = projetarSaldo(100, [sai('2026-03-10', 500)], '2026-03-01', '2026-03-31');
    const f = resumirFechamento(pontos, 100);
    assert.strictEqual(f.fecha, false);
    assert.strictEqual(f.saldoFinal, -400);
    assert.strictEqual(f.fechaMasFuraNoMeio, false, 'não fechou, então não é "fecha mas fura"');
});

test('totais de entrada e saída somam o período todo', () => {
    const pontos = projetarSaldo(0, [
        entra('2026-03-02', 300), entra('2026-03-09', 700), sai('2026-03-05', 250),
    ], '2026-03-01', '2026-03-31');
    const f = resumirFechamento(pontos, 0);
    assert.strictEqual(f.entradas, 1000);
    assert.strictEqual(f.saidas, 250);
});

// ── Ponto de equilíbrio ─────────────────────────────────────────────────────
//
// A base é REGIME DE COMPETÊNCIA: receita das VENDAS do período e o custo
// variável DAQUELAS MESMAS peças. A versão anterior usava contas a receber e a
// pagar por vencimento — regime de caixa — e comparava uma receita com um custo
// que não a gerou.

const base = (o: Partial<BaseDoEquilibrio>): BaseDoEquilibrio => ({
    receita: 0, custoVariavelDasVendas: 0, receitaSemCustoConhecido: 0,
    despesasFixas: [], ...o,
});

test('ponto de equilíbrio = custo fixo dividido pelo índice de margem de contribuição', () => {
    const pe = calcularPontoDeEquilibrio(base({
        receita: 100000,
        custoVariavelDasVendas: 30000,
        despesasFixas: [
            { valor: 16000, natureza: 'fixo', categoria: 'Folha' },
            { valor: 4000, natureza: 'fixo', categoria: 'Aluguel' },
        ],
    }));
    assert.strictEqual(pe.custoFixo, 20000);
    assert.strictEqual(pe.margemContribuicao, 70000);
    assert.strictEqual(pe.margemContribuicaoPct, 70, 'o índice de MC');
    assert.strictEqual(pe.pontoDeEquilibrio, 28571.43);   // 20.000 / 0,70
    assert.strictEqual(pe.sustenta, true);
});

test('a receita é a das VENDAS, não a das parcelas que vencem no mês', () => {
    // Este era o erro: uma venda de 10.000 em 3x aparecia como 3.333 de
    // receita, e o tecido dela podia vencer em outro mês. Aqui a venda inteira
    // entra no mês em que aconteceu, casada com o próprio custo.
    const pe = calcularPontoDeEquilibrio(base({
        receita: 10000,
        custoVariavelDasVendas: 4000,
        despesasFixas: [{ valor: 3000, natureza: 'fixo' }],
    }));
    assert.strictEqual(pe.receita, 10000, 'a venda inteira, não a parcela');
    assert.strictEqual(pe.margemContribuicao, 6000);
    assert.strictEqual(pe.pontoDeEquilibrio, 5000);   // 3.000 / 0,6
});

test('despesa classificada como VARIÁVEL não vira custo fixo', () => {
    // Ela já está no custo unitário das peças. Somar contaria o tecido 2x.
    const pe = calcularPontoDeEquilibrio(base({
        receita: 100000,
        custoVariavelDasVendas: 30000,
        despesasFixas: [
            { valor: 20000, natureza: 'fixo', categoria: 'Folha' },
            { valor: 30000, natureza: 'variavel', categoria: 'Tecidos' },
        ],
    }));
    assert.strictEqual(pe.custoFixo, 20000, 'os 30k variáveis não podem virar fixo');
    assert.strictEqual(pe.custoVariavel, 30000, 'e vêm do custo das peças, não da conta');
});

test('margem de segurança diz quanto o faturamento pode cair', () => {
    const pe = calcularPontoDeEquilibrio(base({
        receita: 100000, custoVariavelDasVendas: 30000,
        despesasFixas: [{ valor: 20000, natureza: 'fixo' }],
    }));
    assert.strictEqual(pe.margemDeSeguranca, 71.4);
    assert.strictEqual(pe.sobra, 71428.57);
});

test('faturar abaixo do ponto de equilíbrio dá sobra e margem negativas', () => {
    const pe = calcularPontoDeEquilibrio(base({
        receita: 25000, custoVariavelDasVendas: 7500,
        despesasFixas: [{ valor: 20000, natureza: 'fixo' }],
    }));
    // MC = 17.500 (70%); PE = 20.000 / 0,7 = 28.571,43 > 25.000
    assert.strictEqual(pe.sustenta, false);
    assert.ok((pe.sobra as number) < 0);
    assert.ok((pe.margemDeSeguranca as number) < 0);
});

test('margem de contribuição negativa NÃO devolve ponto de equilíbrio', () => {
    // Cada peça vendida piora o resultado: não existe volume que empate.
    // Devolver um número sugeriria que vender mais resolve, quando o que
    // resolve é preço ou custo.
    const pe = calcularPontoDeEquilibrio(base({
        receita: 50000, custoVariavelDasVendas: 60000,
        despesasFixas: [{ valor: 10000, natureza: 'fixo' }],
    }));
    assert.strictEqual(pe.margemContribuicao, -10000);
    assert.strictEqual(pe.pontoDeEquilibrio, null);
    assert.strictEqual(pe.sobra, null);
    assert.strictEqual(pe.margemDeSeguranca, null);
    assert.strictEqual(pe.sustenta, false);
});

test('margem de contribuição exatamente zero também não tem solução', () => {
    const pe = calcularPontoDeEquilibrio(base({ receita: 40000, custoVariavelDasVendas: 40000 }));
    assert.strictEqual(pe.margemContribuicao, 0);
    assert.strictEqual(pe.pontoDeEquilibrio, null);
});

test('despesa fixa sem natureza fica FORA da conta e à vista', () => {
    // Distribuir por palpite daria um ponto de equilíbrio errado com cara de
    // certo — pior que um número faltando.
    const pe = calcularPontoDeEquilibrio(base({
        receita: 100000, custoVariavelDasVendas: 30000,
        despesasFixas: [
            { valor: 20000, natureza: 'fixo', categoria: 'Folha' },
            { valor: 8000, categoria: 'Serviços' },
            { valor: 200, categoria: 'Diversos' },
        ],
    }));
    assert.strictEqual(pe.custoFixo, 20000, 'não pode ter absorvido os 8.200');
    assert.strictEqual(pe.naoClassificado, 8200);
    assert.deepStrictEqual(pe.categoriasNaoClassificadas, ['Diversos', 'Serviços']);
});

test('sem custo fixo, empata assim que há qualquer margem', () => {
    const pe = calcularPontoDeEquilibrio(base({ receita: 1000, custoVariavelDasVendas: 400 }));
    assert.strictEqual(pe.pontoDeEquilibrio, 0);
    assert.strictEqual(pe.sustenta, true);
});

test('sem receita não divide por zero', () => {
    const pe = calcularPontoDeEquilibrio(base({
        receita: 0, despesasFixas: [{ valor: 5000, natureza: 'fixo' }],
    }));
    assert.strictEqual(pe.margemContribuicaoPct, 0);
    assert.strictEqual(pe.pontoDeEquilibrio, null);
    assert.strictEqual(pe.margemDeSeguranca, null);
    assert.strictEqual(pe.sustenta, false);
});

test('confronta as despesas variáveis lançadas com o custo das peças', () => {
    // Se sai mais dinheiro em variáveis do que o custo da ficha, existe custo
    // variável fora dela (frete, comissão) e a margem está otimista.
    const pe = calcularPontoDeEquilibrio(base({
        receita: 100000, custoVariavelDasVendas: 30000, variaveisLancadas: 38000,
    }));
    assert.strictEqual(pe.variavelForaDaFicha, 8000);
    // Mas NÃO entra na conta — somar contaria o tecido duas vezes.
    assert.strictEqual(pe.custoVariavel, 30000);
    assert.strictEqual(pe.margemContribuicao, 70000);
});

test('gastar menos em variáveis do que o custo da ficha não vira alerta', () => {
    const pe = calcularPontoDeEquilibrio(base({
        receita: 100000, custoVariavelDasVendas: 30000, variaveisLancadas: 12000,
    }));
    assert.strictEqual(pe.variavelForaDaFicha, 0, 'estoque comprado antes não é custo faltando');
});

test('receita sem custo unitário conhecido é declarada', () => {
    // A margem daquela parte está superestimada — quem lê precisa saber.
    const pe = calcularPontoDeEquilibrio(base({
        receita: 50000, custoVariavelDasVendas: 12000, receitaSemCustoConhecido: 9000,
    }));
    assert.strictEqual(pe.receitaSemCustoConhecido, 9000);
});

// ── O cruzamento ────────────────────────────────────────────────────────────

const fechamento = (fecha: boolean, fura = false, queima = false) => ({
    saldoInicial: 0, entradas: queima ? 100 : 500, saidas: queima ? 500 : 100,
    saldoFinal: fecha ? 100 : -100,
    menorSaldo: fura ? -50 : 0, diaDoMenorSaldo: '2026-03-18',
    primeiroDiaNegativo: fura || !fecha ? '2026-03-18' : null,
    fecha, fechaMasFuraNoMeio: fecha && fura,
    resultadoDoPeriodo: queima ? -400 : 400,
    consomeReserva: queima,
    mesesDeReserva: queima ? 0 : null,
});

const SADIA = base({
    receita: 100000, custoVariavelDasVendas: 30000,
    despesasFixas: [{ valor: 20000, natureza: 'fixo' as const }],
});
const DOENTE = base({
    receita: 50000, custoVariavelDasVendas: 20000,
    despesasFixas: [{ valor: 40000, natureza: 'fixo' as const }],
});

test('caixa salvo pelo momento do recebimento é apontado como problema de preço', () => {
    const l = lerSaude(fechamento(true), calcularPontoDeEquilibrio(DOENTE));
    assert.strictEqual(l.veredito, 'fecha_mas_nao_para_de_pe');
    assert.match(l.explicacao, /preço ou de custo/);
});

test('operação sadia com caixa apertado é apontada como problema de prazo', () => {
    const l = lerSaude(fechamento(false), calcularPontoDeEquilibrio(SADIA));
    assert.strictEqual(l.veredito, 'nao_fecha_mas_e_saudavel');
    assert.match(l.explicacao, /cobrança e prazo/);
});

test('tudo bem, mas com furo no meio, avisa do furo', () => {
    const l = lerSaude(fechamento(true, true), calcularPontoDeEquilibrio(SADIA));
    assert.strictEqual(l.veredito, 'tudo_bem');
    assert.match(l.explicacao, /2026-03-18/);
});

test('ruim dos dois lados', () => {
    assert.strictEqual(
        lerSaude(fechamento(false), calcularPontoDeEquilibrio(DOENTE)).veredito,
        'ruim_dos_dois_lados',
    );
});

test('sem faturamento não emite veredito sobre a operação', () => {
    assert.strictEqual(
        lerSaude(fechamento(true), calcularPontoDeEquilibrio(base({}))).veredito,
        'sem_dados',
    );
});

// ── Queima de reserva e margem de lucro ─────────────────────────────────────

test('mês que termina positivo mas gastou mais do que entrou É queima de reserva', () => {
    // O caso que o saldo final esconde: começa com 100.000, termina com 10.000.
    // Saldo positivo, mas o caixa encolheu 90.000 — não é saúde.
    const pontos = projetarSaldo(100000, [
        entra('2026-03-10', 20000),
        sai('2026-03-20', 110000),
    ], '2026-03-01', '2026-03-31');
    const f = resumirFechamento(pontos, 100000);

    assert.strictEqual(f.saldoFinal, 10000);
    assert.strictEqual(f.fecha, true, 'o saldo termina positivo');
    assert.strictEqual(f.resultadoDoPeriodo, -90000, 'mas o período foi negativo');
    assert.strictEqual(f.consomeReserva, true);
});

test('meses de reserva arredondam para BAIXO', () => {
    // Dizer "5 meses" quando são 4,1 atrasa o alarme. Errar cedo é barato.
    const pontos = projetarSaldo(45000, [sai('2026-03-10', 10000)], '2026-03-01', '2026-03-31');
    const f = resumirFechamento(pontos, 45000);
    assert.strictEqual(f.saldoFinal, 35000);
    assert.strictEqual(f.resultadoDoPeriodo, -10000);
    assert.strictEqual(f.mesesDeReserva, 3, '35.000 / 10.000 = 3,5 → 3');
});

test('mês que entra mais do que sai não tem prazo de reserva', () => {
    const pontos = projetarSaldo(1000, [entra('2026-03-10', 500)], '2026-03-01', '2026-03-31');
    const f = resumirFechamento(pontos, 1000);
    assert.strictEqual(f.consomeReserva, false);
    assert.strictEqual(f.mesesDeReserva, null);
    assert.strictEqual(f.resultadoDoPeriodo, 500);
});

test('queimar reserva NÃO é "tudo bem", mesmo com a operação sadia', () => {
    // Era o defeito: saldo final positivo bastava para o veredito verde.
    const l = lerSaude(fechamento(true, false, true), calcularPontoDeEquilibrio(SADIA));
    assert.strictEqual(l.veredito, 'queima_reserva');
    assert.match(l.titulo, /caixa está encolhendo/);
    assert.match(l.explicacao, /descompasso é de prazo/);
});

test('queimar reserva com a operação doente aponta as duas frentes', () => {
    const l = lerSaude(fechamento(true, false, true), calcularPontoDeEquilibrio(DOENTE));
    assert.strictEqual(l.veredito, 'queima_reserva');
    assert.match(l.explicacao, /também não se paga/);
});

test('sem queima, o veredito verde continua valendo', () => {
    const l = lerSaude(fechamento(true), calcularPontoDeEquilibrio(SADIA));
    assert.strictEqual(l.veredito, 'tudo_bem');
});

test('margem de lucro é o que sobra de cada real vendido', () => {
    const pe = calcularPontoDeEquilibrio(base({
        receita: 100000,
        custoVariavelDasVendas: 30000,
        despesasFixas: [{ valor: 20000, natureza: 'fixo' }],
    }));
    assert.strictEqual(pe.lucro, 50000);          // 100k − 30k − 20k
    assert.strictEqual(pe.margemDeLucroPct, 50);
});

test('prejuízo dá lucro e margem negativos', () => {
    const pe = calcularPontoDeEquilibrio(base({
        receita: 50000, custoVariavelDasVendas: 20000,
        despesasFixas: [{ valor: 40000, natureza: 'fixo' }],
    }));
    assert.strictEqual(pe.lucro, -10000);
    assert.strictEqual(pe.margemDeLucroPct, -20);
});

test('sem receita a margem de lucro é zero, não NaN', () => {
    const pe = calcularPontoDeEquilibrio(base({ receita: 0, despesasFixas: [{ valor: 5000, natureza: 'fixo' }] }));
    assert.strictEqual(pe.margemDeLucroPct, 0);
    assert.strictEqual(pe.lucro, -5000);
});

import { baseDoEquilibrio } from './saudeDoCaixa.ts';

test('base do equilíbrio: vendas do período casadas com o custo; contas a pagar do período com a natureza', () => {
    const b = baseDoEquilibrio({
        vendas: [
            { data: '2026-09-10', precoConhecido: true, valorTotal: 1000, produto: 'Polo', quantidade: 10 },
            { data: '2026-09-11', precoConhecido: true, valorTotal: 500, produto: 'Sem custo', quantidade: 5 },
            { data: '2026-09-12', precoConhecido: false, valorTotal: 0, produto: 'Polo', quantidade: 3 },
            { data: '2026-08-30', precoConhecido: true, valorTotal: 999, produto: 'Polo', quantidade: 9 },
        ],
        custos: new Map([['Polo', 40]]),
        obrigacoes: [
            { type: 'payable', due_date: '2026-09-05', original_amount: 3000, global_category_id: 'aluguel' },
            { type: 'payable', due_date: '2026-09-06', original_amount: 200, global_category_id: 'frete' },
            { type: 'payable', due_date: '2026-09-07', original_amount: 100, global_category_id: 'frete', natureza_override: 'fixo' },
            { type: 'payable', due_date: '2026-09-08', original_amount: 700, cancelled_at: '2026-09-09' },
            { type: 'receivable', due_date: '2026-09-09', original_amount: 5000 },
        ],
        naturezaPorCategoriaId: new Map([['aluguel', 'fixo']]),
        nomePorCategoriaId: new Map([['aluguel', 'Aluguel'], ['frete', 'Frete']]),
        de: '2026-09-01', ate: '2026-09-30',
    });
    assert.equal(b.receita, 1500);
    assert.equal(b.custoVariavelDasVendas, 400);
    assert.equal(b.receitaSemCustoConhecido, 500);
    assert.deepEqual(b.despesasFixas.map(s => [s.valor, s.natureza, s.categoria]),
        [[3000, 'fixo', 'Aluguel'], [200, 'variavel', 'Frete'], [100, 'fixo', 'Frete']]);
    assert.equal(b.variaveisLancadas, 200);
});
