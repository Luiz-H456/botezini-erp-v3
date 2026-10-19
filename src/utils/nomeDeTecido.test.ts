import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    montarNomeDeTecido, separarNomeDeTecido, nomeDoInsumoDaFaixa, limparCartela,
    CARTELA_PADRAO, interpretarListaDeCores, FAIXAS_DE_COR,
} from './nomeDeTecido.ts';

test('monta o nome no padrão da cartela do fornecedor', () => {
    assert.equal(
        montarNomeDeTecido({ tipo: 'Malha', composicao: 'PV Anti Pilling', marca: 'Guimatex', referencia: '167' }),
        'MALHA PV ANTI PILLING (GUIMATEX 167)');
});

test('sem marca não sobra parêntese vazio', () => {
    assert.equal(montarNomeDeTecido({ tipo: 'Brim', composicao: 'Sarja 2/1' }), 'BRIM SARJA 2/1');
    assert.equal(montarNomeDeTecido({ tipo: 'Brim' }), 'BRIM');
});

test('só marca, sem referência, ainda usa parêntese', () => {
    assert.equal(montarNomeDeTecido({ tipo: 'Oxford', marca: 'Santanense' }), 'OXFORD (SANTANENSE)');
});

test('nome vazio não vira parêntese solto', () => {
    assert.equal(montarNomeDeTecido({}), '');
    assert.equal(montarNomeDeTecido({ tipo: '   ' }), '');
});

test('espaço repetido é colapsado', () => {
    assert.equal(
        montarNomeDeTecido({ tipo: '  Malha   PV  ', marca: ' Guimatex ' }),
        'MALHA PV (GUIMATEX)');
});

test('separar desfaz o que montar fez', () => {
    for (const p of [
        { tipo: 'MALHA PV ANTI PILLING', marca: 'GUIMATEX', referencia: '167' },
        { tipo: 'OXFORD', marca: 'SANTANENSE' },
        { tipo: 'BRIM SARJA 2/1' },
    ]) {
        const nome = montarNomeDeTecido(p);
        const voltou = separarNomeDeTecido(nome);
        assert.equal(montarNomeDeTecido(voltou), nome, `não fechou o ciclo em ${nome}`);
    }
});

test('nome fora do padrão cai inteiro no campo livre, sem perder texto', () => {
    const r = separarNomeDeTecido('tecido qualquer sem padrao');
    assert.equal(r.tipo, 'TECIDO QUALQUER SEM PADRAO');
    assert.equal(r.marca, undefined);
    assert.deepEqual(separarNomeDeTecido(''), {});
});

test('marca de duas palavras sem número não vira referência', () => {
    const r = separarNomeDeTecido('MALHA PV (SAO PAULO TEXTIL)');
    assert.equal(r.marca, 'SAO PAULO TEXTIL');
    assert.equal(r.referencia, undefined);
});

test('insumo da faixa carrega a família no nome', () => {
    assert.equal(
        nomeDoInsumoDaFaixa('MALHA PV (GUIMATEX 167)', 'Especial'),
        'MALHA PV (GUIMATEX 167) ESPECIAL');
});

test('cartela descarta vazio e repetido, guardando o primeiro', () => {
    const r = limparCartela([
        { nome: 'AZUL MARINHO', hex: '#123456', faixa: 'Padrão' },
        { nome: '  ', hex: '#000', faixa: 'Padrão' },
        { nome: 'azul marinho', hex: '#999999', faixa: 'Especial' },
        { nome: 'BRANCO', hex: '#FFFFFF', faixa: 'Branco' },
    ]);
    assert.deepEqual(r.map(c => c.nome), ['AZUL MARINHO', 'BRANCO']);
    assert.equal(r[0].hex, '#123456', 'a primeira ocorrência é a que vale');
    assert.equal(r[0].faixa, 'Padrão');
});

test('cartela sem cor nenhuma devolve lista vazia, não quebra', () => {
    assert.deepEqual(limparCartela([]), []);
    assert.deepEqual(limparCartela(undefined as any), []);
});

test('cor sem hex ganha um cinza em vez de undefined', () => {
    const r = limparCartela([{ nome: 'VERDE', hex: '', faixa: 'Padrão' }]);
    assert.equal(r[0].hex, '#CCCCCC');
});

// ── atalhos da cartela ───────────────────────────────────────────────────────

test('cartela padrão está limpa e coerente', () => {
    assert.ok(CARTELA_PADRAO.length >= 10, 'precisa valer a pena como ponto de partida');
    assert.deepEqual(limparCartela(CARTELA_PADRAO), CARTELA_PADRAO, 'sem repetida nem vazia');
    for (const c of CARTELA_PADRAO) {
        assert.match(c.hex, /^#[0-9A-F]{6}$/, `hex inválido em ${c.nome}`);
        assert.equal(c.nome, c.nome.toUpperCase());
        assert.ok(FAIXAS_DE_COR.includes(c.faixa), `faixa inválida em ${c.nome}`);
    }
    assert.equal(CARTELA_PADRAO.find(c => c.nome === 'BRANCO')?.faixa, 'Branco');
});

test('lista colada: uma cor por linha', () => {
    const r = interpretarListaDeCores('AZUL MARINHO\nBEGE\n\n  PRETO  ');
    assert.deepEqual(r.map(c => c.nome), ['AZUL MARINHO', 'BEGE', 'PRETO']);
    assert.ok(r.every(c => c.faixa === 'Padrão'), 'sem faixa dita, cai na padrão');
    assert.ok(r.every(c => c.hex === '#CCCCCC'));
});

test('lista colada aceita hex e faixa em qualquer combinação', () => {
    const r = interpretarListaDeCores([
        'VERDE BANDEIRA #006B3F ; ESPECIAL',
        'CINZA #808080',
        'AMARELO ; especial',
        'ROSA #F0A | Especial',
    ].join('\n'));
    assert.deepEqual(r.map(c => [c.nome, c.hex, c.faixa]), [
        ['VERDE BANDEIRA', '#006B3F', 'Especial'],
        ['CINZA', '#808080', 'Padrão'],
        ['AMARELO', '#CCCCCC', 'Especial'],
        ['ROSA', '#F0A', 'Especial'],
    ]);
});

test('cor chamada BRANCO não é confundida com a faixa Branco', () => {
    // Sem separador, a palavra é NOME. Era o risco de adivinhar pela última
    // palavra: a linha viraria uma cor sem nome.
    const r = interpretarListaDeCores('BRANCO');
    assert.deepEqual(r, [{ nome: 'BRANCO', hex: '#CCCCCC', faixa: 'Padrão' }]);

    const comFaixa = interpretarListaDeCores('BRANCO ; BRANCO');
    assert.deepEqual(comFaixa, [{ nome: 'BRANCO', hex: '#CCCCCC', faixa: 'Branco' }]);
});

test('lista colada respeita a faixa que o usuário escolheu como padrão', () => {
    const r = interpretarListaDeCores('ROXO\nTURQUESA', 'Especial');
    assert.ok(r.every(c => c.faixa === 'Especial'));
});

test('lista colada descarta repetida e linha sem nome', () => {
    const r = interpretarListaDeCores('AZUL\nazul\n#123456\n   \n;\nVERDE');
    assert.deepEqual(r.map(c => c.nome), ['AZUL', 'VERDE']);
});

test('lista vazia não quebra', () => {
    assert.deepEqual(interpretarListaDeCores(''), []);
    assert.deepEqual(interpretarListaDeCores(undefined as any), []);
});
