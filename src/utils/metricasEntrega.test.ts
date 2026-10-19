import test from 'node:test';
import assert from 'node:assert';
import {
    diasEntre, entregasApuradas, resumirPontualidade, ritmoDeProducao,
    tempoPorTipoDePeca, pontualidadePorMes,
} from './metricasEntrega.ts';
import type { PedidoParaMetrica, LogDeProducao } from './metricasEntrega.ts';

const pedido = (o: Partial<PedidoParaMetrica> & { id: string }): PedidoParaMetrica => ({
    order_number: o.id, items: [{ quantity: 10 }], ...o,
});

test('diasEntre conta dias corridos e aceita falta de data', () => {
    assert.strictEqual(diasEntre('2026-03-01', '2026-03-11'), 10);
    assert.strictEqual(diasEntre('2026-03-11', '2026-03-01'), -10);
    assert.strictEqual(diasEntre(undefined, '2026-03-01'), null);
    assert.strictEqual(diasEntre('2026-03-01', undefined), null);
    assert.strictEqual(diasEntre('nao é data', '2026-03-01'), null);
});

// ── Entrega ─────────────────────────────────────────────────────────────────

test('a entrega é a ÚLTIMA expedição, não a primeira', () => {
    // Entrega parcial não é entrega: o cliente só recebeu tudo no último dia.
    const logs: LogDeProducao[] = [
        { order_id: 'o1', qty_expedited: 5, logged_at: '2026-03-05T10:00:00Z' },
        { order_id: 'o1', qty_expedited: 5, logged_at: '2026-03-12T10:00:00Z' },
    ];
    const [e] = entregasApuradas([pedido({ id: 'o1', created_at: '2026-03-01T00:00:00Z', deadline: '2026-03-10' })], logs);
    assert.strictEqual(e.entregueEm.slice(0, 10), '2026-03-12');
    assert.strictEqual(e.diasDeAtraso, 2);
    assert.strictEqual(e.diasNaFabrica, 11);
});

test('baixa de produção sem expedição NÃO conta como entrega', () => {
    // Peça pronta na prateleira não é peça entregue.
    const logs: LogDeProducao[] = [{ order_id: 'o1', qty_done: 10, logged_at: '2026-03-05T10:00:00Z' }];
    assert.deepStrictEqual(entregasApuradas([pedido({ id: 'o1', deadline: '2026-03-10' })], logs), []);
});

test('saída no próprio dia do prazo é no prazo, não 1 dia de atraso', () => {
    // O prazo é data sem hora; comparar com o instante do log arredondaria
    // para cima quem saiu às 14h do dia prometido.
    const logs: LogDeProducao[] = [{ order_id: 'o1', qty_expedited: 10, logged_at: '2026-03-10T14:30:00Z' }];
    const [e] = entregasApuradas([pedido({ id: 'o1', deadline: '2026-03-10' })], logs);
    assert.strictEqual(e.diasDeAtraso, 0);
});

test('entrega adiantada dá atraso negativo', () => {
    const logs: LogDeProducao[] = [{ order_id: 'o1', qty_expedited: 10, logged_at: '2026-03-07T09:00:00Z' }];
    const [e] = entregasApuradas([pedido({ id: 'o1', deadline: '2026-03-10' })], logs);
    assert.strictEqual(e.diasDeAtraso, -3);
});

// ── Pontualidade ────────────────────────────────────────────────────────────

const PEDIDOS: PedidoParaMetrica[] = [
    pedido({ id: 'o1', created_at: '2026-03-01T00:00:00Z', deadline: '2026-03-10' }),  // no prazo
    pedido({ id: 'o2', created_at: '2026-03-01T00:00:00Z', deadline: '2026-03-10' }),  // 4 dias
    pedido({ id: 'o3', created_at: '2026-03-01T00:00:00Z', deadline: '2026-03-10' }),  // 10 dias
    pedido({ id: 'o4', created_at: '2026-03-01T00:00:00Z', deadline: '2026-03-10' }),  // sem expedição
];
const LOGS: LogDeProducao[] = [
    { order_id: 'o1', qty_expedited: 10, logged_at: '2026-03-09T10:00:00Z' },
    { order_id: 'o2', qty_expedited: 10, logged_at: '2026-03-14T10:00:00Z' },
    { order_id: 'o3', qty_expedited: 10, logged_at: '2026-03-20T10:00:00Z' },
];

test('pontualidade sai sobre os APURADOS, e o resto é declarado', () => {
    const r = resumirPontualidade(PEDIDOS, LOGS);
    assert.strictEqual(r.apurados, 3);
    assert.strictEqual(r.semDadoDeEntrega, 1, 'o pedido sem expedição precisa aparecer');
    assert.strictEqual(r.noPrazo, 1);
    assert.strictEqual(r.atrasados, 2);
    assert.strictEqual(r.pctNoPrazo, 33.3);
});

test('pedido sem expedição NÃO é contado como no prazo', () => {
    // Supor que saiu no prazo daria uma pontualidade melhor que a real — um
    // indicador que mente para cima é pior que indicador nenhum.
    const so_sem_dado = resumirPontualidade([pedido({ id: 'x', deadline: '2026-01-01' })], []);
    assert.strictEqual(so_sem_dado.apurados, 0);
    assert.strictEqual(so_sem_dado.noPrazo, 0);
    assert.strictEqual(so_sem_dado.pctNoPrazo, 0);
    assert.strictEqual(so_sem_dado.semDadoDeEntrega, 1);
});

test('atraso médio conta só quem atrasou, e guarda o pior', () => {
    const r = resumirPontualidade(PEDIDOS, LOGS);
    assert.strictEqual(r.atrasoMedioDias, 7);   // (4 + 10) / 2
    assert.strictEqual(r.piorAtrasoDias, 10);
});

test('tempo médio na fábrica usa abertura → última saída', () => {
    const r = resumirPontualidade(PEDIDOS, LOGS);
    assert.strictEqual(r.tempoMedioNaFabricaDias, 13.3);   // (8 + 13 + 19) / 3
});

test('sem nenhum dado, nada quebra e nada é inventado', () => {
    const r = resumirPontualidade([], []);
    assert.deepStrictEqual(
        [r.apurados, r.noPrazo, r.atrasados, r.pctNoPrazo, r.atrasoMedioDias, r.tempoMedioNaFabricaDias],
        [0, 0, 0, 0, 0, 0],
    );
});

// ── Ritmo ───────────────────────────────────────────────────────────────────

test('ritmo usa dias corridos, não só os dias com registro', () => {
    // Contar só os dias trabalhados daria ritmo inflado, inútil para prometer
    // prazo — o cliente espera em dias de calendário.
    const logs: LogDeProducao[] = [
        { order_id: 'o1', qty_done: 30, logged_at: '2026-03-01T10:00:00Z' },
        { order_id: 'o1', qty_done: 30, logged_at: '2026-03-10T10:00:00Z' },
    ];
    const r = ritmoDeProducao(logs);
    assert.strictEqual(r.pecas, 60);
    assert.strictEqual(r.dias, 10);          // 1 a 10, inclusive
    assert.strictEqual(r.pecasPorDia, 6);
    assert.strictEqual(r.diasPorPeca, 0.17);
});

test('um único dia de produção conta como 1 dia, não zero', () => {
    const r = ritmoDeProducao([{ order_id: 'o', qty_done: 20, logged_at: '2026-03-01T10:00:00Z' }]);
    assert.strictEqual(r.dias, 1);
    assert.strictEqual(r.pecasPorDia, 20);
});

test('ritmo sem logs não divide por zero', () => {
    assert.deepStrictEqual(ritmoDeProducao([]), { pecas: 0, dias: 0, pecasPorDia: 0, diasPorPeca: 0 });
    assert.deepStrictEqual(ritmoDeProducao([{ order_id: 'o', qty_expedited: 5, logged_at: '2026-03-01' }]),
        { pecas: 0, dias: 0, pecasPorDia: 0, diasPorPeca: 0 });
});

// ── Tempo por tipo de peça ──────────────────────────────────────────────────

test('tempo por peça só enxerga baixas com item identificado', () => {
    // As anteriores à Fase 3 não dizem de qual peça eram — ficar vazio é o
    // certo; preencher seria estimativa disfarçada de medição.
    const logs: LogDeProducao[] = [
        { order_id: 'o1', qty_done: 20, logged_at: '2026-03-01T00:00:00Z' },   // sem item_key
        { order_id: 'o1', qty_done: 10, logged_at: '2026-03-01T00:00:00Z', item_key: 'p1|AZUL|M' },
        { order_id: 'o1', qty_done: 10, logged_at: '2026-03-06T00:00:00Z', item_key: 'p1|AZUL|M' },
    ];
    const t = tempoPorTipoDePeca(logs);
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].pecas, 20);
    assert.strictEqual(t[0].diasMedios, 6);
    assert.strictEqual(t[0].pedidos, 1);
});

test('a mesma peça em dois pedidos vira média entre eles', () => {
    const logs: LogDeProducao[] = [
        { order_id: 'o1', qty_done: 5, logged_at: '2026-03-01T00:00:00Z', item_key: 'p1|AZUL|M' },
        { order_id: 'o1', qty_done: 5, logged_at: '2026-03-03T00:00:00Z', item_key: 'p1|AZUL|M' },   // 3 dias
        { order_id: 'o2', qty_done: 5, logged_at: '2026-04-01T00:00:00Z', item_key: 'p1|AZUL|M' },
        { order_id: 'o2', qty_done: 5, logged_at: '2026-04-07T00:00:00Z', item_key: 'p1|AZUL|M' },   // 7 dias
    ];
    const [t] = tempoPorTipoDePeca(logs);
    assert.strictEqual(t.diasMedios, 5);
    assert.strictEqual(t.pedidos, 2);
    assert.strictEqual(t.rotulo, 'p1 · AZUL · M');
});

// ── Série mensal ────────────────────────────────────────────────────────────

test('pontualidade por mês usa o mês da ENTREGA', () => {
    const s = pontualidadePorMes(PEDIDOS, LOGS);
    assert.deepStrictEqual(s.map(m => m.chave), ['2026-03']);
    assert.strictEqual(s[0].noPrazo, 1);
    assert.strictEqual(s[0].atrasados, 2);
    assert.strictEqual(s[0].pctNoPrazo, 33.3);
    assert.strictEqual(s[0].rotulo, 'mar/26');
});

test('meses saem em ordem cronológica', () => {
    const logs: LogDeProducao[] = [
        { order_id: 'a', qty_expedited: 1, logged_at: '2026-05-02T00:00:00Z' },
        { order_id: 'b', qty_expedited: 1, logged_at: '2026-01-02T00:00:00Z' },
    ];
    const pedidos = [pedido({ id: 'a', deadline: '2026-05-01' }), pedido({ id: 'b', deadline: '2026-01-05' })];
    assert.deepStrictEqual(pontualidadePorMes(pedidos, logs).map(m => m.chave), ['2026-01', '2026-05']);
});

test('a série mensal conta PEDIDOS e PEÇAS — os dois números contam histórias diferentes', () => {
    // Um pedido de 500 peças e um de 3 pesam igual em "pedidos" e muito
    // diferente em "peças": sem os dois, o mês parece bom pelo motivo errado.
    const pedidos: PedidoParaMetrica[] = [
        pedido({ id: 'grande', deadline: '2026-03-10', items: [{ quantity: 500 }] }),
        pedido({ id: 'pequeno', deadline: '2026-03-10', items: [{ quantity: 3 }] }),
    ];
    const logs: LogDeProducao[] = [
        { order_id: 'grande', qty_expedited: 500, logged_at: '2026-03-20T00:00:00Z' },  // atrasado
        { order_id: 'pequeno', qty_expedited: 3, logged_at: '2026-03-08T00:00:00Z' },   // no prazo
    ];
    const [m] = pontualidadePorMes(pedidos, logs);
    assert.strictEqual(m.noPrazo, 1);
    assert.strictEqual(m.atrasados, 1);
    assert.strictEqual(m.pctNoPrazo, 50, 'metade dos PEDIDOS saiu no prazo');
    assert.strictEqual(m.pecasNoPrazo, 3);
    assert.strictEqual(m.pecasAtrasadas, 500, 'mas quase toda a PRODUÇÃO atrasou');
});
