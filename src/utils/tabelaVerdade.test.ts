import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    precoVigente, condicaoPadrao, freteNaUnidade, custoDeReferencia, mapaDeReferencia,
    comparacaoComComprado, menosDias, type Catalogo, type TVFrete,
} from './tabelaVerdade.ts';

const linha = { id: 'L', fornecedor_id: 'F', nome: 'Brim', ordem: 0, usa_frete_do_fornecedor: true, usa_condicoes_do_fornecedor: true };
const avista = { id: 'C1', fornecedor_id: 'F', linha_id: 'L', nome: 'À vista', ordem: 1, padrao: false, ativa: true };
const trinta = { id: 'C2', fornecedor_id: 'F', linha_id: 'L', nome: '30 dias', ordem: 2, padrao: true, ativa: true };
const modelo = { id: 'C0', fornecedor_id: 'F', linha_id: null, nome: 'À vista', ordem: 1, padrao: true, ativa: true };
const tipoKg = { id: 'T', linha_id: 'L', nome: 'Brim Leve', unidade: 'kg' as const, rendimento_m_por_kg: 3.2, composicao: null, ordem: 0 };
const medias = { id: 'FX', tipo_id: 'T', nome: 'Médias', ordem: 3, insumo_id: 'I1' };
const frete = (f: Partial<TVFrete>): TVFrete => ({ fornecedor_id: 'F', linha_id: 'L', modo: 'por_kg', valor: 0.15, remessa_tipica_kg: null, ...f });

const cat = (extra: Partial<Catalogo> = {}): Catalogo => ({
    linhas: [linha], condicoes: [modelo, avista, trinta], fretes: [frete({})], tipos: [tipoKg], faixas: [medias],
    precos: [
        { faixa_id: 'FX', condicao_id: 'C2', vale_desde: '2026-09-01', valor: 29, origem: 'tabela' },
        { faixa_id: 'FX', condicao_id: 'C2', vale_desde: '2026-11-01', valor: 31, origem: 'tabela' },
        { faixa_id: 'FX', condicao_id: 'C1', vale_desde: '2026-09-01', valor: 28.4, origem: 'tabela' },
    ],
    ...extra,
});

test('preço vigente: o de vale_desde mais recente até a data; reajuste futuro não vale antes', () => {
    const { precos } = cat();
    assert.equal(precoVigente(precos, 'FX', 'C2', '2026-08-31'), null);
    assert.equal(precoVigente(precos, 'FX', 'C2', '2026-09-01')?.valor, 29);
    assert.equal(precoVigente(precos, 'FX', 'C2', '2026-10-29')?.valor, 29);
    assert.equal(precoVigente(precos, 'FX', 'C2', '2026-11-01')?.valor, 31);
});

test('condição padrão é a da linha, nunca a do modelo do fornecedor', () => {
    assert.equal(condicaoPadrao('L', cat().condicoes)?.id, 'C2');
    assert.equal(condicaoPadrao('L', [modelo, { ...trinta, ativa: false }]), null);
});

test('frete: cif zero; por kg em kg; por kg em metro divide pelo rendimento', () => {
    assert.deepEqual(freteNaUnidade(frete({ modo: 'cif', valor: null }), tipoKg), { valor: 0 });
    assert.deepEqual(freteNaUnidade(frete({}), tipoKg), { valor: 0.15 });
    const r = freteNaUnidade(frete({ valor: 0.32 }), { unidade: 'm', rendimento_m_por_kg: 3.2 });
    assert.equal(r.valor.toFixed(4), '0.1000');
});

test('frete em metro sem rendimento vira pendência, nunca Infinity', () => {
    assert.deepEqual(freteNaUnidade(frete({}), { unidade: 'm', rendimento_m_por_kg: null }), { valor: 0, pendencia: 'tecido sem rendimento' });
});

test('frete fixo divide pela remessa típica; sem remessa é pendência; a cotar é pendência; sem cadastro é pendência', () => {
    assert.deepEqual(freteNaUnidade(frete({ modo: 'fixo', valor: 150, remessa_tipica_kg: 300 }), tipoKg), { valor: 0.5 });
    assert.deepEqual(freteNaUnidade(frete({ modo: 'fixo', valor: 150 }), tipoKg), { valor: 0, pendencia: 'frete fixo sem remessa típica' });
    assert.deepEqual(freteNaUnidade(frete({ modo: 'cotacao', valor: null }), tipoKg), { valor: 0, pendencia: 'frete a cotar' });
    assert.deepEqual(freteNaUnidade(null, tipoKg), { valor: 0, pendencia: 'frete não cadastrado' });
});

test('custo de referência = preço na condição padrão + frete', () => {
    const r = custoDeReferencia(medias, cat(), '2026-10-29');
    assert.equal(r.valor, 29.15);
    assert.equal(r.condicao?.id, 'C2');
    assert.deepEqual(r.pendencias, []);
});

test('faixa sem preço: valor null (o consumidor cai para a próxima origem) e pendência', () => {
    const r = custoDeReferencia(medias, cat({ precos: [] }), '2026-10-29');
    assert.equal(r.valor, null);
    assert.ok(r.pendencias.includes('faixa sem preço'));
});

test('mapa de referência cobre o insumo da faixa e os apelidos dele', () => {
    const m = mapaDeReferencia(cat(), [{ id: 'I1', faixa_id: 'FX' }, { id: 'I1-apelido', faixa_id: 'FX' }], '2026-10-29');
    assert.equal(m.get('I1'), 29.15);
    assert.equal(m.get('I1-apelido'), 29.15);
});

test('comparação usa o previsto DA DATA de cada compra, ponderado pela quantidade', () => {
    const previsto = (d: string) => (d < '2026-10-01' ? 29 : 30);
    const r = comparacaoComComprado([
        { data: '2026-09-10', quantidade: 100, custo_unitario: 29.4 },
        { data: '2026-10-03', quantidade: 100, custo_unitario: 31.2 },
    ], previsto, '2026-10-29');
    assert.equal(r?.menor.data, '2026-09-10');
    assert.equal(r?.maior.valor, 31.2);
    assert.equal(r?.media, 30.3);
    assert.equal(r?.previstoMedio, 29.5);
    assert.equal(r?.diferencaPct, 2.71);
    assert.equal(r?.acima, true);
});

test('limite de 2%: exatamente 2% não avisa; acima avisa', () => {
    const p = () => 100;
    assert.equal(comparacaoComComprado([{ data: '2026-10-01', quantidade: 1, custo_unitario: 102 }], p, '2026-10-29')?.acima, false);
    assert.equal(comparacaoComComprado([{ data: '2026-10-01', quantidade: 1, custo_unitario: 102.5 }], p, '2026-10-29')?.acima, true);
});

test('compra antes de qualquer preço entra em menor/média/maior, mas não na comparação', () => {
    const r = comparacaoComComprado([{ data: '2026-08-01', quantidade: 10, custo_unitario: 40 }], () => null, '2026-10-29');
    assert.equal(r?.media, 40);
    assert.equal(r?.previstoMedio, null);
    assert.equal(r?.acima, false);
});

test('sem compra na janela de 90 dias: null', () => {
    assert.equal(comparacaoComComprado([{ data: '2026-07-01', quantidade: 1, custo_unitario: 1 }], () => 1, '2026-10-29'), null);
    assert.equal(menosDias('2026-10-29', 90), '2026-07-31');
});

test('preço no campo da grade: vírgula e duas casas; vazio sem preço', async () => {
    const { paraCampo } = await import('./tabelaVerdade.ts');
    assert.equal(paraCampo(19.1), '19,10');
    assert.equal(paraCampo(null), '');
});
