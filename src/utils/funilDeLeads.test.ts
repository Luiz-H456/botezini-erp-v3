import test from 'node:test';
import assert from 'node:assert';
import {
    ETAPAS, etapaPorId, proximaEtapa, estaVivo, filaDeHoje, colunasDoFunil,
    conversaoPorEtapa, conversaoPor, motivosDePerda, cicloDeVenda, cicloTipico,
    nomeDoLead, diasEntre, alcance, MINIMO_PARA_COMPARAR,
} from './funilDeLeads.ts';
import type { Lead, EtapaDoLead } from './funilDeLeads.ts';

const HOJE = '2026-08-27';

let seq = 0;
const lead = (over: Partial<Lead> = {}): Lead => ({
    id: `l${++seq}`,
    razao_social: 'EMPRESA LTDA',
    status: 'novo' as EtapaDoLead,
    ...over,
});

// ── o modelo ────────────────────────────────────────────────────────────────

test('as seis etapas existem e cada uma diz quem tem a bola', () => {
    assert.strictEqual(ETAPAS.length, 6);
    for (const e of ETAPAS) {
        assert.ok(e.rotulo.length > 0, `${e.id} sem rótulo`);
        assert.ok(e.descricao.length > 0, `${e.id} sem descrição`);
        assert.ok(['nossa', 'deles', 'ninguem'].includes(e.bola));
    }
});

test('etapa desconhecida devolve null em vez de quebrar', () => {
    assert.strictEqual(etapaPorId('inventada'), null);
    assert.strictEqual(etapaPorId(null), null);
});

test('o caminho avança até cliente e para lá', () => {
    assert.strictEqual(proximaEtapa('novo'), 'contatado');
    assert.strictEqual(proximaEtapa('orcando'), 'cliente');
    assert.strictEqual(proximaEtapa('cliente'), null);
});

test('descartado não tem próxima etapa — avançar dali não significa nada', () => {
    assert.strictEqual(proximaEtapa('descartado'), null);
});

test('vivo é quem ainda pode virar cliente', () => {
    assert.ok(estaVivo('novo'));
    assert.ok(estaVivo('orcando'));
    assert.ok(!estaVivo('cliente'));
    assert.ok(!estaVivo('descartado'));
});

test('o nome de exibição prefere a fantasia', () => {
    assert.strictEqual(nomeDoLead(lead({ razao_social: 'X LTDA', nome_fantasia: 'Padaria X' })), 'Padaria X');
    assert.strictEqual(nomeDoLead(lead({ razao_social: 'X LTDA', nome_fantasia: '  ' })), 'X LTDA');
    assert.strictEqual(nomeDoLead(lead({ razao_social: '' })), '(sem nome)');
});

test('dias entre datas, com hora junto ou sem', () => {
    assert.strictEqual(diasEntre(HOJE, '2026-08-30'), 3);
    assert.strictEqual(diasEntre(HOJE, '2026-08-20'), -7);
    assert.strictEqual(diasEntre('2026-08-27T13:00:00Z', '2026-08-28'), 1);
    assert.strictEqual(diasEntre('', 'x'), 0);
});

// ── a fila de hoje ──────────────────────────────────────────────────────────

test('ação marcada para depois não entra na fila de hoje', () => {
    const f = filaDeHoje([lead({ proxima_acao_em: '2026-09-10' })], HOJE);
    assert.deepStrictEqual(f, []);
});

test('ação de hoje e ação vencida entram, com o motivo certo', () => {
    const f = filaDeHoje([
        lead({ id: 'hoje', proxima_acao_em: HOJE }),
        lead({ id: 'atrasado', proxima_acao_em: '2026-08-20' }),
    ], HOJE);
    const porId = new Map(f.map(i => [i.lead.id, i]));
    assert.strictEqual(porId.get('hoje')!.motivo, 'acao-de-hoje');
    assert.strictEqual(porId.get('atrasado')!.motivo, 'acao-vencida');
    assert.strictEqual(porId.get('atrasado')!.diasDeAtraso, 7);
});

test('novo nunca tocado entra como fila de entrada', () => {
    const f = filaDeHoje([lead({ status: 'novo' })], HOJE);
    assert.strictEqual(f[0].motivo, 'nunca-tocado');
});

test('vivo sem próxima ação é lead esquecido, não fila de entrada', () => {
    const f = filaDeHoje([lead({ status: 'qualificado' })], HOJE);
    assert.strictEqual(f[0].motivo, 'esquecido');
});

test('novo já contatado alguma vez não é mais "nunca tocado"', () => {
    const f = filaDeHoje([lead({ status: 'novo', ultimo_contato_em: '2026-08-01' })], HOJE);
    assert.strictEqual(f[0].motivo, 'esquecido');
});

test('cliente e descartado nunca entram na fila', () => {
    const f = filaDeHoje([
        lead({ status: 'cliente', client_id: 'c1', proxima_acao_em: '2026-01-01' }),
        lead({ status: 'descartado', motivo_perda: 'preço', proxima_acao_em: '2026-01-01' }),
    ], HOJE);
    assert.deepStrictEqual(f, []);
});

test('a dívida vem primeiro: atrasado antes de hoje, antes de novo', () => {
    const f = filaDeHoje([
        lead({ id: 'novo' }),
        lead({ id: 'hoje', status: 'contatado', proxima_acao_em: HOJE }),
        lead({ id: 'atrasado', status: 'contatado', proxima_acao_em: '2026-08-01' }),
    ], HOJE);
    assert.deepStrictEqual(f.map(i => i.lead.id), ['atrasado', 'hoje', 'novo']);
});

test('dentro do mesmo motivo, o maior porte vem antes', () => {
    const f = filaDeHoje([
        lead({ id: 'pequena', porte_funcionarios: 8 }),
        lead({ id: 'grande', porte_funcionarios: 400 }),
        lead({ id: 'sem-porte' }),
    ], HOJE);
    assert.deepStrictEqual(f.map(i => i.lead.id), ['grande', 'pequena', 'sem-porte']);
});

test('o mais atrasado vem antes do menos atrasado', () => {
    const f = filaDeHoje([
        lead({ id: 'pouco', status: 'contatado', proxima_acao_em: '2026-08-25', porte_funcionarios: 900 }),
        lead({ id: 'muito', status: 'contatado', proxima_acao_em: '2026-07-01', porte_funcionarios: 2 }),
    ], HOJE);
    assert.deepStrictEqual(f.map(i => i.lead.id), ['muito', 'pouco'],
        'atraso pesa mais que porte — foi você que marcou e não cumpriu');
});

test('fila de lista vazia não quebra', () => {
    assert.deepStrictEqual(filaDeHoje([], HOJE), []);
    assert.deepStrictEqual(filaDeHoje(null, HOJE), []);
});

// ── o quadro ────────────────────────────────────────────────────────────────

test('o quadro tem sempre as seis colunas, mesmo vazias', () => {
    const c = colunasDoFunil([]);
    assert.strictEqual(c.length, 6);
    assert.deepStrictEqual(c.map(x => x.etapa.id),
        ['novo', 'contatado', 'qualificado', 'orcando', 'cliente', 'descartado']);
});

test('cada lead cai na sua coluna, ordenado por porte', () => {
    const c = colunasDoFunil([
        lead({ id: 'a', status: 'contatado', porte_funcionarios: 10 }),
        lead({ id: 'b', status: 'contatado', porte_funcionarios: 500 }),
        lead({ id: 'c', status: 'novo' }),
    ]);
    const contatado = c.find(x => x.etapa.id === 'contatado')!;
    assert.deepStrictEqual(contatado.leads.map(l => l.id), ['b', 'a']);
    assert.strictEqual(c.find(x => x.etapa.id === 'novo')!.leads.length, 1);
});

// ── conversão ───────────────────────────────────────────────────────────────

test('alcance: descartado não afirma até onde chegou', () => {
    assert.strictEqual(alcance('novo'), 0);
    assert.strictEqual(alcance('cliente'), 4);
    assert.strictEqual(alcance('descartado'), -1);
});

test('conversão acumulada: quem está em orçando já passou por contatado', () => {
    const c = conversaoPorEtapa([
        lead({ status: 'novo' }),
        lead({ status: 'orcando' }),
        lead({ status: 'cliente', client_id: 'x' }),
    ]);
    const novoParaContatado = c.passos[0];
    assert.strictEqual(novoParaContatado.entraram, 3);
    assert.strictEqual(novoParaContatado.seguiram, 2, 'orçando e cliente já passaram por contatado');
});

test('o descartado só pesa no denominador do primeiro passo', () => {
    const c = conversaoPorEtapa([
        lead({ status: 'descartado', motivo_perda: 'preço' }),
        lead({ status: 'contatado' }),
    ]);
    assert.strictEqual(c.passos[0].entraram, 2);
    assert.strictEqual(c.passos[0].seguiram, 1);
    assert.strictEqual(c.passos[1].entraram, 1, 'o descartado não infla os passos seguintes');
});

test('a taxa final é quantos de todos viraram cliente', () => {
    const c = conversaoPorEtapa([
        lead({ status: 'cliente', client_id: 'x' }),
        lead({ status: 'descartado', motivo_perda: 'preço' }),
        lead({ status: 'novo' }),
        lead({ status: 'novo' }),
    ]);
    assert.strictEqual(c.taxaFinal, 0.25);
    assert.strictEqual(c.clientes, 1);
    assert.strictEqual(c.descartados, 1);
    assert.strictEqual(c.total, 4);
});

test('sem leads, taxa null e não NaN', () => {
    const c = conversaoPorEtapa([]);
    assert.strictEqual(c.taxaFinal, null);
    assert.ok(c.passos.every(p => p.taxa === null));
});

test('há um passo a menos que etapas do caminho', () => {
    assert.strictEqual(conversaoPorEtapa([]).passos.length, 4);
});

// ── recortes ────────────────────────────────────────────────────────────────

test('agrupa por origem e calcula a taxa de cada uma', () => {
    const r = conversaoPor([
        ...Array(5).fill(0).map(() => lead({ origem: 'indicacao', status: 'cliente', client_id: 'x' })),
        ...Array(5).fill(0).map(() => lead({ origem: 'csv', status: 'novo' })),
    ], 'origem');
    assert.strictEqual(r.find(x => x.chave === 'indicacao')!.taxa, 1);
    assert.strictEqual(r.find(x => x.chave === 'csv')!.taxa, 0);
});

test('amostra pequena vai para o fim — 100% com um lead não significa nada', () => {
    const r = conversaoPor([
        lead({ origem: 'sorte', status: 'cliente', client_id: 'x' }),
        ...Array(MINIMO_PARA_COMPARAR).fill(0).map(() => lead({ origem: 'csv', status: 'novo' })),
    ], 'origem');
    assert.strictEqual(r[0].chave, 'csv', 'a origem com amostra vem antes, mesmo convertendo pior');
    assert.strictEqual(r[1].chave, 'sorte');
});

test('campo vazio vira "(não informado)" em vez de sumir', () => {
    const r = conversaoPor([lead({ segmento: '' }), lead({ segmento: null })], 'segmento');
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].chave, '(não informado)');
    assert.strictEqual(r[0].total, 2);
});

// ── motivos de perda ────────────────────────────────────────────────────────

test('agrupa motivos e dá a fatia de cada um', () => {
    const m = motivosDePerda([
        lead({ status: 'descartado', motivo_perda: 'Preço' }),
        lead({ status: 'descartado', motivo_perda: 'preço' }),
        lead({ status: 'descartado', motivo_perda: 'prazo' }),
        lead({ status: 'novo' }),
    ]);
    assert.strictEqual(m.length, 2);
    assert.strictEqual(m[0].motivo, 'preço');
    assert.strictEqual(m[0].quantidade, 2);
    assert.ok(Math.abs(m[0].fatia - 2 / 3) < 0.001);
});

test('sem descarte, lista vazia', () => {
    assert.deepStrictEqual(motivosDePerda([lead()]), []);
});

// ── ciclo de venda ──────────────────────────────────────────────────────────

test('o ciclo só existe porque o lead sobrevive a virar cliente', () => {
    const l = lead({
        status: 'cliente', client_id: 'x',
        created_at: '2026-01-01', updated_at: '2026-03-02',
    });
    assert.strictEqual(cicloDeVenda(l), 60);
});

test('quem não fechou não tem ciclo', () => {
    assert.strictEqual(cicloDeVenda(lead({ status: 'orcando', created_at: '2026-01-01', updated_at: '2026-02-01' })), null);
});

test('o ciclo típico é a mediana — um lead de dois anos não manda no número', () => {
    const fecha = (dias: number) => lead({
        status: 'cliente', client_id: 'x',
        created_at: '2026-01-01',
        updated_at: new Date(Date.parse('2026-01-01T00:00:00Z') + dias * 86400000).toISOString().slice(0, 10),
    });
    assert.strictEqual(cicloTipico([fecha(10), fecha(20), fecha(700)]), 20);
});

test('sem fechamento nenhum, o ciclo típico é null', () => {
    assert.strictEqual(cicloTipico([lead()]), null);
    assert.strictEqual(cicloTipico([]), null);
});
