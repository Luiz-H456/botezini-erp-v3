import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiarEspecificacao, resumoDaEspecificacao } from './especificacao.ts';

const linha = (p: Record<string, unknown> = {}) => ({
    fabric: '', color: '', quantity: 10, unit_price: 50, total: 500, ...p,
}) as any;

const origem = linha({
    sleeve_type: 'manga_curta', gender: 'masculino', fit: 'regular', has_band: true, prod_notes: 'bolso no peito',
    fabric_insumo_id: 'ins-oxford-branco', fabric_name: 'Oxford', fabric: 'Oxford', color: 'BRANCO', unit_price: 89.9,
});

test('copia só os grupos marcados', () => {
    const d = copiarEspecificacao(origem, linha({ gender: 'feminino', quantity: 20 }), ['opcionais']);
    assert.deepEqual([d.sleeve_type, d.gender, d.fit, d.has_band], ['manga_curta', 'masculino', 'regular', true]);
    assert.equal(d.prod_notes, undefined);
    assert.equal(d.unit_price, 50);
    assert.equal(d.fabric_insumo_id, undefined);
});

test('tecido e cor andam juntos; preço recalcula o total pela quantidade do destino', () => {
    const d = copiarEspecificacao(origem, linha({ quantity: 20 }), ['tecido', 'preco', 'detalhes']);
    assert.deepEqual([d.fabric_insumo_id, d.fabric_name, d.fabric, d.color], ['ins-oxford-branco', 'Oxford', 'Oxford', 'BRANCO']);
    assert.equal(d.unit_price, 89.9);
    assert.equal(d.total, 1798);
    assert.equal(d.prod_notes, 'bolso no peito');
});

test('"não definido" na origem limpa o destino; nada mais é tocado', () => {
    const d = copiarEspecificacao(linha({}), linha({ sleeve_type: 'manga_longa', has_band: true, size: 'G' }), ['opcionais']);
    assert.equal(d.sleeve_type, undefined);
    assert.equal(d.has_band, undefined);
    assert.equal(d.size, 'G');
});

test('resumo curto da especificação', () => {
    assert.equal(resumoDaEspecificacao(origem), 'Manga curta · Masc · Regular · Faixa · Detalhes');
    assert.equal(resumoDaEspecificacao(linha({ fit: 'plus_size', gender: 'infantil' })), 'Infantil · Plus size');
    assert.equal(resumoDaEspecificacao(linha({})), 'sem especificação');
});

test('linha só com detalhes de produção também tem especificação', () => {
    assert.equal(resumoDaEspecificacao(linha({ prod_notes: 'bolso no peito' })), 'Detalhes');
    assert.equal(resumoDaEspecificacao(linha({ prod_notes: '   ' })), 'sem especificação');
});

test('legado has_band:false não conta como especificação', () => {
    assert.equal(resumoDaEspecificacao(linha({ has_band: false })), 'sem especificação');
    assert.equal(resumoDaEspecificacao(linha({ has_band: true })), 'Faixa');
});
