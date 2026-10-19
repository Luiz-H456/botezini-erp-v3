import test from 'node:test';
import assert from 'node:assert';
import {
    filaDeFollowUp, diasEntre, ritmoDeCompra, clientesDormentes, descreverAtraso,
    DIAS_PARA_COBRAR, DIAS_DE_ALERTA_DE_VALIDADE, MINIMO_DE_COMPRAS, ATRASO_MINIMO,
    ROTULO_DA_URGENCIA,
} from './acompanhamentoComercial.ts';
import type { OrcamentoEnviado, CompraDoCliente } from './acompanhamentoComercial.ts';

const HOJE = '2026-08-27';

let seq = 0;
const orc = (over: Partial<OrcamentoEnviado> = {}): OrcamentoEnviado => ({
    id: `o${++seq}`,
    serial_number: `ORC-${seq}`,
    status: 'Sent',
    date: HOJE,
    validity_days: 30,
    sent_at: HOJE,
    ...over,
});

const fila = (...os: OrcamentoEnviado[]) => filaDeFollowUp(os, HOJE);

// ── dias ────────────────────────────────────────────────────────────────────

test('conta dias, para frente e para trás', () => {
    assert.strictEqual(diasEntre(HOJE, '2026-09-01'), 5);
    assert.strictEqual(diasEntre(HOJE, '2026-08-17'), -10);
    assert.strictEqual(diasEntre('', 'x'), 0);
});

// ── C1: a fila ──────────────────────────────────────────────────────────────

test('só orçamento enviado entra na fila', () => {
    const f = fila(
        orc({ status: 'Draft' }),
        orc({ status: 'Approved' }),
        orc({ status: 'Converted' }),
        orc({ status: 'Sent' }),
    );
    assert.strictEqual(f.length, 1);
});

test('dias parados contam do envio, não da data do orçamento', () => {
    const f = fila(orc({ date: '2026-01-01', sent_at: '2026-08-20' }));
    assert.strictEqual(f[0].diasParado, 7);
});

test('enviado hoje é recente, não cobrança', () => {
    assert.strictEqual(fila(orc({ sent_at: HOJE }))[0].urgencia, 'recente');
});

test('a partir do limite de espera, vira cobrança', () => {
    const f = fila(orc({ sent_at: '2026-08-24' }));   // 3 dias
    assert.strictEqual(f[0].diasParado, DIAS_PARA_COBRAR);
    assert.strictEqual(f[0].urgencia, 'parado');
});

test('validade vence hoje é o caso mais urgente, mesmo recém-enviado', () => {
    const f = fila(orc({ date: '2026-07-28', validity_days: 30, sent_at: HOJE }));
    assert.strictEqual(f[0].diasAteVencer, 0);
    assert.strictEqual(f[0].urgencia, 'vence-hoje');
});

test('vencendo nos próximos dias passa à frente de parado', () => {
    const f = fila(
        orc({ id: 'parado', date: HOJE, validity_days: 60, sent_at: '2026-07-01' }),
        orc({ id: 'vencendo', date: '2026-07-30', validity_days: 30, sent_at: HOJE }),
    );
    assert.strictEqual(f[0].orcamento.id, 'vencendo');
    assert.ok(f[0].diasAteVencer! <= DIAS_DE_ALERTA_DE_VALIDADE);
});

test('vencido é grave, mas menos que o que ainda dá para salvar', () => {
    const f = fila(
        orc({ id: 'vencido', date: '2026-01-01', validity_days: 30, sent_at: '2026-01-01' }),
        orc({ id: 'vence-hoje', date: '2026-07-28', validity_days: 30, sent_at: HOJE }),
    );
    assert.deepStrictEqual(f.map(i => i.orcamento.id), ['vence-hoje', 'vencido']);
});

test('sem validade cadastrada, a fila usa só o tempo parado', () => {
    const f = fila(orc({ validity_days: 0, sent_at: '2026-08-01' }));
    assert.strictEqual(f[0].diasAteVencer, null);
    assert.strictEqual(f[0].urgencia, 'parado');
});

test('enviado sem sent_at entra mesmo assim — a coluna pode não existir ainda', () => {
    const f = fila(orc({ sent_at: null, validity_days: 0 }));
    assert.strictEqual(f.length, 1);
    assert.strictEqual(f[0].diasParado, null);
    assert.strictEqual(f[0].urgencia, 'parado', 'sem saber, trata como pendente');
});

test('dentro da mesma urgência, o mais antigo vem antes', () => {
    const f = fila(
        orc({ id: 'novo', validity_days: 0, sent_at: '2026-08-20' }),
        orc({ id: 'velho', validity_days: 0, sent_at: '2026-06-01' }),
    );
    assert.deepStrictEqual(f.map(i => i.orcamento.id), ['velho', 'novo']);
});

test('sem data conhecida vai para o fim do próprio grupo', () => {
    const f = fila(
        orc({ id: 'sem-data', validity_days: 0, sent_at: null }),
        orc({ id: 'com-data', validity_days: 0, sent_at: '2026-08-01' }),
    );
    assert.deepStrictEqual(f.map(i => i.orcamento.id), ['com-data', 'sem-data']);
});

test('empate de dias desempata pelo maior valor', () => {
    const f = fila(
        orc({ id: 'pequeno', validity_days: 0, sent_at: '2026-08-01', total_amount: 500 }),
        orc({ id: 'grande', validity_days: 0, sent_at: '2026-08-01', total_amount: 9000 }),
    );
    assert.deepStrictEqual(f.map(i => i.orcamento.id), ['grande', 'pequeno']);
});

test('fila vazia não quebra', () => {
    assert.deepStrictEqual(filaDeFollowUp([], HOJE), []);
    assert.deepStrictEqual(filaDeFollowUp(null, HOJE), []);
});

test('toda urgência tem rótulo', () => {
    for (const r of Object.values(ROTULO_DA_URGENCIA)) assert.ok(r.length > 0);
});

// ── C3: ritmo ───────────────────────────────────────────────────────────────

test('o ritmo é a mediana dos intervalos', () => {
    // intervalos: 30, 30, 90 → mediana 30
    assert.strictEqual(ritmoDeCompra(['2026-01-01', '2026-01-31', '2026-03-02', '2026-05-31']), 30);
});

test('uma compra atípica não vira o ritmo da casa', () => {
    // intervalos: 10, 10, 10, 400 → mediana 10, não a média de 107
    const r = ritmoDeCompra(['2026-01-01', '2026-01-11', '2026-01-21', '2026-01-31', '2027-03-07']);
    assert.strictEqual(r, 10);
});

test('menos de duas datas não tem ritmo', () => {
    assert.strictEqual(ritmoDeCompra(['2026-01-01']), null);
    assert.strictEqual(ritmoDeCompra([]), null);
});

test('datas fora de ordem são ordenadas antes de medir', () => {
    assert.strictEqual(ritmoDeCompra(['2026-03-02', '2026-01-01', '2026-01-31']), 30);
});

test('compras no mesmo dia não geram intervalo zero', () => {
    assert.strictEqual(ritmoDeCompra(['2026-01-01', '2026-01-01', '2026-01-31']), 30);
});

// ── C3: dormentes ───────────────────────────────────────────────────────────

const cliente = (id: string, nome = id) => ({ id, company_name: nome });

/** Compras a cada `passo` dias, terminando `desde` dias antes de hoje. */
const compras = (id: string, quantas: number, passo: number, desde: number, valor = 1000): CompraDoCliente[] => {
    const fim = Date.parse(`${HOJE}T00:00:00Z`) - desde * 86400000;
    return Array.from({ length: quantas }, (_, i) => ({
        client_id: id,
        data: new Date(fim - (quantas - 1 - i) * passo * 86400000).toISOString().slice(0, 10),
        valor,
    }));
};

test('quem está muito além do próprio ritmo aparece', () => {
    const d = clientesDormentes([cliente('a')], compras('a', 4, 30, 90), HOJE);
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].ritmoTipico, 30);
    assert.strictEqual(d[0].diasSemComprar, 90);
    assert.strictEqual(d[0].atraso, 3);
});

test('quem está dentro do ritmo não aparece', () => {
    assert.deepStrictEqual(clientesDormentes([cliente('a')], compras('a', 4, 30, 20), HOJE), []);
});

test('o limiar é configurável e o padrão é 1,5x', () => {
    const dentro = compras('a', 4, 30, 40);   // 1,33x
    assert.strictEqual(clientesDormentes([cliente('a')], dentro, HOJE).length, 0);
    assert.strictEqual(clientesDormentes([cliente('a')], dentro, HOJE, 1.2).length, 1);
    assert.strictEqual(ATRASO_MINIMO, 1.5);
});

test('a escola que compra uma vez por ano não é acusada de sumida em março', () => {
    // ritmo de 365 dias, parada há 120: dentro do próprio padrão.
    const d = clientesDormentes([cliente('escola')], compras('escola', 3, 365, 120), HOJE);
    assert.deepStrictEqual(d, [], 'prazo fixo acusaria; ritmo próprio não');
});

test('cliente com poucas compras não entra — não há padrão a violar', () => {
    const d = clientesDormentes([cliente('a')], compras('a', MINIMO_DE_COMPRAS - 1, 30, 900), HOJE);
    assert.deepStrictEqual(d, []);
});

test('cliente sem compra nenhuma não entra', () => {
    assert.deepStrictEqual(clientesDormentes([cliente('a')], [], HOJE), []);
});

test('ordena pelo que vale mais a ligação: atraso vezes faturamento', () => {
    const d = clientesDormentes(
        [cliente('grande'), cliente('pequeno')],
        [
            ...compras('grande', 4, 30, 70, 50000),    // atraso 2,33
            ...compras('pequeno', 4, 30, 300, 200),    // atraso 10
        ],
        HOJE);
    assert.deepStrictEqual(d.map(x => x.cliente.id), ['grande', 'pequeno']);
});

test('soma o faturamento histórico e conta as compras', () => {
    const d = clientesDormentes([cliente('a')], compras('a', 4, 30, 90, 250), HOJE);
    assert.strictEqual(d[0].compras, 4);
    assert.strictEqual(d[0].valorHistorico, 1000);
});

test('compra de hoje não conta como ausência', () => {
    assert.deepStrictEqual(clientesDormentes([cliente('a')], compras('a', 4, 30, 0), HOJE), []);
});

test('compras sem cliente ou sem data são ignoradas', () => {
    const sujas: CompraDoCliente[] = [
        ...compras('a', 4, 30, 90),
        { client_id: null, data: '2026-01-01' },
        { client_id: 'a', data: null },
    ];
    const d = clientesDormentes([cliente('a')], sujas, HOJE);
    // Linha sem data e sem cliente saem inteiras, e não só do cálculo do ritmo:
    // contá-las no total deixaria um cliente alcançar o mínimo de compras com
    // linhas que não dizem nada sobre o padrão dele.
    assert.strictEqual(d[0].compras, 4);
    assert.strictEqual(d[0].ritmoTipico, 30);
});

test('a frase do atraso dispensa fazer a divisão de cabeça', () => {
    const d = clientesDormentes([cliente('a')], compras('a', 4, 30, 90), HOJE);
    assert.strictEqual(descreverAtraso(d[0]), 'compra a cada 30 dias; está há 90 (3,0× o normal)');
});

test('lista vazia não quebra', () => {
    assert.deepStrictEqual(clientesDormentes(null, null, HOJE), []);
});
