import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    diasEntre, pesoDoPorte, pesoDoCapital, pontuar, leadsQueEsfriaram,
    PESO_PORTE_DESCONHECIDO, PESO_MAXIMO_DE_FRIEZA,
    DIAS_PARA_ESFRIAR, type LeadDaFila,
} from './filaDoDia.ts';

// Os testes da fila propria sairam junto com ela: `filaDeHoje`, em
// funilDeLeads, ja monta a fila, e tentar competir quebrou um teste que
// defendia uma decisao anterior — porte desconhecido por ultimo. O que sobrou
// aqui e a regua de esfriamento, que nao existia em lugar nenhum.

const HOJE = '2026-09-09';

const lead = (p: Partial<LeadDaFila> & { id: string }): LeadDaFila => ({
    razao_social: 'Empresa', porte_funcionarios: 50, status: 'contatado', ...p,
});

const vivo = (s: string | null | undefined) =>
    ['novo', 'contatado', 'qualificado', 'orcando'].includes(s || '');

// ── dias ────────────────────────────────────────────────────────────────────

test('conta dias entre datas ISO', () => {
    assert.equal(diasEntre('2026-09-01', HOJE), 8);
    assert.equal(diasEntre(HOJE, HOJE), 0);
});

test('sem data devolve null, e nao zero', () => {
    // Zero diria "contatado hoje", que e o oposto de "nunca contatado".
    assert.equal(diasEntre(null, HOJE), null);
    assert.equal(diasEntre(undefined, HOJE), null);
});

test('data invalida nao vira NaN silencioso', () => {
    assert.equal(diasEntre('nao e data', HOJE), null);
});

// ── porte ───────────────────────────────────────────────────────────────────

test('porte maior pesa mais, em degraus', () => {
    assert.ok(pesoDoPorte(600).peso > pesoDoPorte(250).peso);
    assert.ok(pesoDoPorte(250).peso > pesoDoPorte(150).peso);
    assert.ok(pesoDoPorte(150).peso > pesoDoPorte(60).peso);
    assert.ok(pesoDoPorte(10).peso > 0);
});

test('porte desconhecido vale o MEIO, nao zero', () => {
    // Zero empurraria para o fim da fila justamente os leads que ninguem abriu
    // ainda — e nunca aberto e diferente de ruim.
    const d = pesoDoPorte(null);
    assert.equal(d.peso, PESO_PORTE_DESCONHECIDO);
    assert.equal(d.falta, true);
    assert.ok(d.peso > pesoDoPorte(10).peso, 'acima do micro');
    assert.ok(d.peso < pesoDoPorte(150).peso, 'abaixo do grande');
});

test('porte zero e negativo contam como desconhecido', () => {
    assert.equal(pesoDoPorte(0).falta, true);
    assert.equal(pesoDoPorte(-5).falta, true);
});

// ── pontuação ───────────────────────────────────────────────────────────────

test('a bola sua vale mais que a bola deles', () => {
    const meu = pontuar(lead({ id: '1' }), 'nossa', HOJE);
    const dele = pontuar(lead({ id: '2' }), 'deles', HOJE);
    assert.ok(meu.total > dele.total);
});

test('frieza so comeca a contar DEPOIS do prazo', () => {
    const dentro = pontuar(lead({ id: '1', ultimo_contato_em: '2026-09-01' }), 'deles', HOJE);
    assert.equal(dentro.frieza, 0, '8 dias ainda nao esfriou');
    assert.equal(dentro.esfriou, false);

    const fora = pontuar(lead({ id: '2', ultimo_contato_em: '2026-08-01' }), 'deles', HOJE);
    assert.ok(fora.frieza > 0);
    assert.equal(fora.esfriou, true);
});

test('o prazo de esfriamento e inclusivo na borda', () => {
    const d = new Date(Date.parse(HOJE + 'T12:00:00') - DIAS_PARA_ESFRIAR * 86400000);
    const naBorda = d.toISOString().slice(0, 10);
    assert.equal(pontuar(lead({ id: '1', ultimo_contato_em: naBorda }), 'deles', HOJE).esfriou, true);
});

test('a frieza TEM TETO — a fila nao vira museu do abandono', () => {
    // Sem teto, um lead esquecido ha dois anos venceria para sempre qualquer
    // lead bom de hoje.
    const antigo = pontuar(lead({ id: '1', ultimo_contato_em: '2020-01-01' }), 'deles', HOJE);
    assert.equal(antigo.frieza, PESO_MAXIMO_DE_FRIEZA);
});

test('nunca contatado nao conta como frio ha mil dias', () => {
    const p = pontuar(lead({ id: '1', ultimo_contato_em: null }), 'nossa', HOJE);
    assert.equal(p.frieza, 0);
    assert.equal(p.diasSemContato, null);
    assert.equal(p.esfriou, false);
});

// ── cadência ────────────────────────────────────────────────────────────────

test('lista quem esfriou, do mais frio para o menos', () => {
    const frios = leadsQueEsfriaram([
        lead({ id: 'muito-frio', ultimo_contato_em: '2026-05-01' }),
        lead({ id: 'frio', ultimo_contato_em: '2026-08-01' }),
        lead({ id: 'morno', ultimo_contato_em: '2026-09-05' }),
        lead({ id: 'nunca', ultimo_contato_em: null }),
    ], vivo, HOJE);
    assert.deepEqual(frios.map(f => f.lead.id), ['muito-frio', 'frio']);
});

test('nunca contatado NAO aparece como esfriado', () => {
    // Ele nao esfriou: nunca foi aquecido. Aparece na fila pela bola, e nao
    // aqui, senao a lista de "cobre estes" viraria a base inteira no dia um.
    assert.deepEqual(leadsQueEsfriaram([lead({ id: '1', ultimo_contato_em: null })], vivo, HOJE), []);
});


// ── capital social na pontuação (fase 4) ────────────────────────────────────

test('capital maior pesa mais', () => {
    assert.ok(pesoDoCapital(2_000_000) > pesoDoCapital(600_000));
    assert.ok(pesoDoCapital(600_000) > pesoDoCapital(80_000));
    assert.ok(pesoDoCapital(80_000) > pesoDoCapital(5_000));
});

test('capital desconhecido vale ZERO — e nao o meio, como o porte', () => {
    // A diferenca tem razao: porte desconhecido nao diz nada, mas o porte e o
    // unico sinal de tamanho. Capital desconhecido tambem nao diz nada, so que
    // ali o porte JA esta cumprindo esse papel — dar peso do meio aos dois
    // somaria duas vezes a mesma ignorancia.
    assert.equal(pesoDoCapital(null), 0);
    assert.equal(pesoDoCapital(0), 0);
    assert.equal(pesoDoCapital(undefined), 0);
});

test('o capital entra no total, e aparece separado', () => {
    const rico = pontuar(lead({ id: '1', capital_social: 5_000_000 }), 'deles', HOJE);
    const pobre = pontuar(lead({ id: '2', capital_social: null }), 'deles', HOJE);
    assert.ok(rico.total > pobre.total);
    assert.ok(rico.capital > 0);
    assert.equal(pobre.capital, 0);
    assert.equal(rico.total, rico.porte + rico.capital + rico.bola + rico.frieza);
});

test('o capital pesa MENOS que o porte — tamanho vem antes de risco', () => {
    // O numero de funcionarios diz quantos uniformes o pedido tem; o capital
    // diz se a empresa aguenta pagar. Quem prospecta vai atras do tamanho.
    const soCapital = pontuar(lead({ id: '1', porte_funcionarios: null, capital_social: 9_000_000 }), 'ninguem', HOJE);
    const soPorte = pontuar(lead({ id: '2', porte_funcionarios: 900, capital_social: null }), 'ninguem', HOJE);
    assert.ok(soPorte.total > soCapital.total);
});
