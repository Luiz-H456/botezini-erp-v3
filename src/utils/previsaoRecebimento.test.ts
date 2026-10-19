import test from 'node:test';
import assert from 'node:assert';
import {
    mediana, somarDias, comportamentoPorCliente, preverRecebimentos,
    compararVencimentoComPrevisao, AMOSTRAS_MINIMAS,
} from './previsaoRecebimento.ts';
import type { ObrigacaoParaPrevisao, PagamentoRealizado } from './previsaoRecebimento.ts';

test('mediana com amostra ímpar é o valor central', () => {
    assert.strictEqual(mediana([1, 10, 3]), 3);
});

test('mediana com amostra par pega a menor das centrais', () => {
    // Meio dia de atraso não existe; arredondar para baixo erra prevendo o
    // dinheiro mais cedo, o que aparece como saldo faltando e não como surpresa.
    assert.strictEqual(mediana([2, 4]), 2);
    assert.strictEqual(mediana([0, 5, 10, 20]), 5);
});

test('mediana de lista vazia é zero, não NaN', () => {
    assert.strictEqual(mediana([]), 0);
});

test('somarDias atravessa a virada do mês e do ano', () => {
    assert.strictEqual(somarDias('2026-01-30', 5), '2026-02-04');
    assert.strictEqual(somarDias('2026-12-28', 10), '2027-01-07');
    assert.strictEqual(somarDias('2026-03-10', -4), '2026-03-06');
});

// ── Comportamento do cliente ────────────────────────────────────────────────

const OBRIGACOES: ObrigacaoParaPrevisao[] = [
    { id: 'a1', client_id: 'c1', due_date: '2026-01-10' },
    { id: 'a2', client_id: 'c1', due_date: '2026-02-10' },
    { id: 'a3', client_id: 'c1', due_date: '2026-03-10' },
    { id: 'b1', client_id: 'c2', due_date: '2026-01-15' },
];

test('o desvio típico sai do que o cliente fez de fato', () => {
    const pagos: PagamentoRealizado[] = [
        { obligation_id: 'a1', payment_date: '2026-01-20', method: 'PIX' },   // +10
        { obligation_id: 'a2', payment_date: '2026-02-22', method: 'PIX' },   // +12
        { obligation_id: 'a3', payment_date: '2026-03-21', method: 'PIX' },   // +11
    ];
    const c = comportamentoPorCliente(OBRIGACOES, pagos).get('c1')!;
    assert.strictEqual(c.amostras, 3);
    assert.strictEqual(c.desvioTipicoDias, 11);
    assert.strictEqual(c.pctNoPrazo, 0);
    assert.strictEqual(c.meioHabitual, 'PIX');
});

test('um atraso extremo não contamina a previsão — é o motivo da mediana', () => {
    // Feriado, troca de responsável, nota perdida: um caso de 90 dias puxaria a
    // média para 32 e faria o cliente parecer muito pior do que é.
    const pagos: PagamentoRealizado[] = [
        { obligation_id: 'a1', payment_date: '2026-01-12' },   // +2
        { obligation_id: 'a2', payment_date: '2026-02-13' },   // +3
        { obligation_id: 'a3', payment_date: '2026-06-08' },   // +90
    ];
    const c = comportamentoPorCliente(OBRIGACOES, pagos).get('c1')!;
    assert.strictEqual(c.desvioTipicoDias, 3, 'a mediana descreve o hábito');
    assert.strictEqual(c.piorAtrasoDias, 90, 'mas o caso extremo continua visível');
});

test('quem paga adiantado tem desvio negativo', () => {
    const pagos: PagamentoRealizado[] = [
        { obligation_id: 'a1', payment_date: '2026-01-05' },
        { obligation_id: 'a2', payment_date: '2026-02-04' },
        { obligation_id: 'a3', payment_date: '2026-03-05' },
    ];
    const c = comportamentoPorCliente(OBRIGACOES, pagos).get('c1')!;
    assert.strictEqual(c.desvioTipicoDias, -5);   // mediana de [-6, -5, -5]
    assert.strictEqual(c.pctNoPrazo, 100, 'pagar antes é estar no prazo');
});

test('pagamento no dia do vencimento conta como no prazo', () => {
    const c = comportamentoPorCliente(OBRIGACOES, [
        { obligation_id: 'a1', payment_date: '2026-01-10' },
    ]).get('c1')!;
    assert.strictEqual(c.desvioTipicoDias, 0);
    assert.strictEqual(c.pctNoPrazo, 100);
});

test('meio habitual é o mais frequente, não o último usado', () => {
    const c = comportamentoPorCliente(OBRIGACOES, [
        { obligation_id: 'a1', payment_date: '2026-01-10', method: 'Boleto' },
        { obligation_id: 'a2', payment_date: '2026-02-10', method: 'Boleto' },
        { obligation_id: 'a3', payment_date: '2026-03-10', method: 'PIX' },
    ]).get('c1')!;
    assert.strictEqual(c.meioHabitual, 'Boleto');
    assert.strictEqual(c.meioHabitualVezes, 2);
});

test('pagamento de obrigação sem vencimento ou sem cliente é ignorado', () => {
    const m = comportamentoPorCliente(
        [{ id: 'x', client_id: 'c9' }, { id: 'y', due_date: '2026-01-01' }],
        [{ obligation_id: 'x', payment_date: '2026-01-05' }, { obligation_id: 'y', payment_date: '2026-01-05' }],
    );
    assert.strictEqual(m.size, 0);
});

// ── Previsão ────────────────────────────────────────────────────────────────

const EM_ABERTO: ObrigacaoParaPrevisao[] = [
    { id: 'novo1', client_id: 'c1', due_date: '2026-05-10', planned_method: 'PIX' },
];

test('o vencimento é corrigido pelo desvio típico do cliente', () => {
    const comp = comportamentoPorCliente(OBRIGACOES, [
        { obligation_id: 'a1', payment_date: '2026-01-20', method: 'PIX' },
        { obligation_id: 'a2', payment_date: '2026-02-20', method: 'PIX' },
        { obligation_id: 'a3', payment_date: '2026-03-20', method: 'PIX' },
    ]);
    const [p] = preverRecebimentos(EM_ABERTO, comp);
    assert.strictEqual(p.desvioAplicadoDias, 10);
    assert.strictEqual(p.dataProvavel, '2026-05-20');
    assert.strictEqual(p.confianca, 'historico');
});

test('histórico curto NÃO desloca a data — ruído com ares de precisão', () => {
    const comp = comportamentoPorCliente(OBRIGACOES, [
        { obligation_id: 'a1', payment_date: '2026-02-09' },   // um único atraso de 30 dias
    ]);
    const [p] = preverRecebimentos(EM_ABERTO, comp);
    assert.strictEqual(p.amostras, 1);
    assert.ok(p.amostras < AMOSTRAS_MINIMAS);
    assert.strictEqual(p.desvioAplicadoDias, 0, 'uma amostra não vira padrão');
    assert.strictEqual(p.dataProvavel, '2026-05-10', 'fica no próprio vencimento');
    assert.strictEqual(p.confianca, 'poucos_dados');
});

test('cliente sem nenhum pagamento fica no vencimento e declara a ausência', () => {
    const [p] = preverRecebimentos(EM_ABERTO, new Map());
    assert.strictEqual(p.confianca, 'sem_historico');
    assert.strictEqual(p.dataProvavel, '2026-05-10');
    assert.strictEqual(p.desvioAplicadoDias, 0);
});

test('divergência de meio só acusa quando os dois lados existem e discordam', () => {
    const comBoleto = comportamentoPorCliente(OBRIGACOES, [
        { obligation_id: 'a1', payment_date: '2026-01-10', method: 'Boleto' },
        { obligation_id: 'a2', payment_date: '2026-02-10', method: 'Boleto' },
        { obligation_id: 'a3', payment_date: '2026-03-10', method: 'Boleto' },
    ]);
    // Previsto PIX, mas o cliente sempre paga em boleto.
    assert.strictEqual(preverRecebimentos(EM_ABERTO, comBoleto)[0].meioDivergente, true);

    // Sem meio previsto não há o que contradizer.
    const semPrevisto = [{ id: 'x', client_id: 'c1', due_date: '2026-05-10' }];
    assert.strictEqual(preverRecebimentos(semPrevisto, comBoleto)[0].meioDivergente, false);

    // Concordando, não acusa.
    const comPix = [{ id: 'x', client_id: 'c1', due_date: '2026-05-10', planned_method: 'Boleto' }];
    assert.strictEqual(preverRecebimentos(comPix, comBoleto)[0].meioDivergente, false);
});

// ── Vencimento × previsão ───────────────────────────────────────────────────

test('mostra o dinheiro que escorrega de um mês para o outro', () => {
    // É a leitura que importa: o fluxo conta em maio o que entra em junho.
    const previsoes = preverRecebimentos(
        [{ id: 'o1', client_id: 'c1', due_date: '2026-05-28' }],
        new Map([['c1', {
            client_id: 'c1', amostras: 5, desvioTipicoDias: 10,
            piorAtrasoDias: 12, pctNoPrazo: 0, meioHabitualVezes: 0,
        }]]),
    );
    const meses = compararVencimentoComPrevisao(previsoes, new Map([['o1', 5000]]));

    assert.deepStrictEqual(meses, [
        { chave: '2026-05', peloVencimento: 5000, pelaPrevisao: 0 },
        { chave: '2026-06', peloVencimento: 0, pelaPrevisao: 5000 },
    ]);
});

test('sem obrigações, a comparação sai vazia', () => {
    assert.deepStrictEqual(compararVencimentoComPrevisao([], new Map()), []);
});
