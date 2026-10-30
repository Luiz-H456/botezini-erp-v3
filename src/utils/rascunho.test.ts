import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assinatura, chaveDoRascunho, rascunhoParaOferecer, IDADE_MAXIMA_MS } from './rascunho.ts';

test('assinatura não depende da ordem das chaves e ignora undefined', () => {
    assert.equal(assinatura({ a: 1, b: [{ y: 2, x: 1 }] }), assinatura({ b: [{ x: 1, y: 2 }], a: 1, c: undefined }));
    assert.notEqual(assinatura({ a: 1 }), assinatura({ a: 2 }));
});

test('chave do rascunho: por tipo e id; sem id é "novo"', () => {
    assert.equal(chaveDoRascunho('orcamento', 'abc'), 'botezini.rascunho.orcamento.abc');
    assert.equal(chaveDoRascunho('orcamento', ''), 'botezini.rascunho.orcamento.novo');
});

test('oferece rascunho recente e diferente do salvo', () => {
    const agora = 1_000_000_000_000;
    const g = JSON.stringify({ quando: agora - 60_000, dados: { notes: 'novo texto' } });
    assert.deepEqual(rascunhoParaOferecer(g, { notes: 'antigo' }, agora)?.dados, { notes: 'novo texto' });
    assert.ok(rascunhoParaOferecer(g, null, agora));
});

test('não oferece: igual ao salvo, velho demais, ilegível ou vazio', () => {
    const agora = 1_000_000_000_000;
    assert.equal(rascunhoParaOferecer(JSON.stringify({ quando: agora, dados: { a: 1 } }), { a: 1 }, agora), null);
    assert.equal(rascunhoParaOferecer(JSON.stringify({ quando: agora - IDADE_MAXIMA_MS - 1, dados: { a: 2 } }), { a: 1 }, agora), null);
    assert.equal(rascunhoParaOferecer('{quebrado', null, agora), null);
    assert.equal(rascunhoParaOferecer(null, null, agora), null);
});
