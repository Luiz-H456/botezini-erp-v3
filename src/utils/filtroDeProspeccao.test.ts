import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    porteNaFaixa, capitalNaFaixa, leadCasa, filtrarLeads, filtroEstaAtivo,
    valoresDisponiveis, contarPorSegmento, FILTRO_VAZIO,
    type LeadFiltravel,
} from './filtroDeProspeccao.ts';

const lead = (p: Partial<LeadFiltravel> = {}): LeadFiltravel => ({
    id: '1', razao_social: 'Hospital São Lucas', segmento: 'saude',
    porte_funcionarios: 150, uf: 'SP', origem: 'importacao', ...p,
});

const f = (p: Partial<typeof FILTRO_VAZIO> = {}) => ({ ...FILTRO_VAZIO, ...p });

// ── porte ───────────────────────────────────────────────────────────────────

test('faixa vazia aceita qualquer porte', () => {
    assert.equal(porteNaFaixa(150, ''), true);
    assert.equal(porteNaFaixa(null, ''), true);
});

test('as faixas nao se sobrepoem nem deixam buraco', () => {
    assert.equal(porteNaFaixa(20, 'micro'), true);
    assert.equal(porteNaFaixa(21, 'micro'), false);
    assert.equal(porteNaFaixa(21, 'pequena'), true);
    assert.equal(porteNaFaixa(100, 'pequena'), true);
    assert.equal(porteNaFaixa(101, 'pequena'), false);
    assert.equal(porteNaFaixa(101, 'media'), true);
    assert.equal(porteNaFaixa(200, 'media'), true);
    assert.equal(porteNaFaixa(201, 'media'), false);
    assert.equal(porteNaFaixa(201, 'grande'), true);
    assert.equal(porteNaFaixa(99999, 'grande'), true);
});

test('sem porte informado e uma categoria, e nao um resto escondido', () => {
    // Na importacao por CNPJ esse campo vem vazio com frequencia. Se esses
    // leads sumissem no primeiro filtro, a maior parte da base sumiria junto.
    assert.equal(porteNaFaixa(null, 'sem-porte'), true);
    assert.equal(porteNaFaixa(0, 'sem-porte'), true);
    assert.equal(porteNaFaixa(undefined, 'sem-porte'), true);
    assert.equal(porteNaFaixa(50, 'sem-porte'), false);
});

test('lead sem porte NAO aparece numa faixa numerica', () => {
    assert.equal(porteNaFaixa(null, 'micro'), false);
});

// ── os filtros ──────────────────────────────────────────────────────────────

test('filtro vazio deixa tudo passar', () => {
    assert.equal(leadCasa(lead(), FILTRO_VAZIO), true);
    assert.equal(filtroEstaAtivo(FILTRO_VAZIO), false);
});

test('segmento filtra, e ignora caixa e acento', () => {
    assert.equal(leadCasa(lead(), f({ segmento: 'saude' })), true);
    assert.equal(leadCasa(lead(), f({ segmento: 'SAÚDE' })), true);
    assert.equal(leadCasa(lead(), f({ segmento: 'educacao' })), false);
});

test('os filtros se somam — e nao se substituem', () => {
    const l = lead({ segmento: 'saude', porte_funcionarios: 150, uf: 'SP' });
    assert.equal(leadCasa(l, f({ segmento: 'saude', faixaDePorte: 'media' })), true);
    assert.equal(leadCasa(l, f({ segmento: 'saude', faixaDePorte: 'micro' })), false,
        'segmento certo mas porte errado nao passa');
});

test('busca acha por razao social, fantasia e cidade, sem acento', () => {
    const l = lead({ razao_social: 'Padaria Três Irmãos', cidade: 'São Paulo' });
    assert.equal(leadCasa(l, f({ busca: 'tres irmaos' })), true);
    assert.equal(leadCasa(l, f({ busca: 'sao paulo' })), true);
    assert.equal(leadCasa(l, f({ busca: 'hospital' })), false);
});

test('filtroEstaAtivo ignora busca so de espacos', () => {
    assert.equal(filtroEstaAtivo(f({ busca: '   ' })), false);
    assert.equal(filtroEstaAtivo(f({ busca: 'x' })), true);
    assert.equal(filtroEstaAtivo(f({ faixaDePorte: 'micro' })), true);
});

test('filtra a lista inteira', () => {
    const leads = [
        lead({ id: 'a', segmento: 'saude' }),
        lead({ id: 'b', segmento: 'educacao' }),
        lead({ id: 'c', segmento: 'saude', porte_funcionarios: 10 }),
    ];
    assert.deepEqual(filtrarLeads(leads, f({ segmento: 'saude' })).map(l => l.id), ['a', 'c']);
    assert.deepEqual(
        filtrarLeads(leads, f({ segmento: 'saude', faixaDePorte: 'micro' })).map(l => l.id), ['c']);
});

// ── o que oferecer no seletor ───────────────────────────────────────────────

test('so oferece valores que existem na base', () => {
    // Listar as 27 UFs quando a carteira tem tres obriga a pessoa a procurar
    // DENTRO do filtro — o problema que o filtro deveria resolver.
    const v = valoresDisponiveis([
        lead({ uf: 'SP', segmento: 'saude', origem: 'importacao' }),
        lead({ uf: 'PR', segmento: 'saude', origem: 'indicacao' }),
    ]);
    assert.deepEqual(v.ufs, ['PR', 'SP']);
    assert.deepEqual(v.segmentos, ['saude']);
    assert.deepEqual(v.origens, ['importacao', 'indicacao']);
});

test('valores vazios nao viram opcao em branco no seletor', () => {
    const v = valoresDisponiveis([lead({ uf: null, segmento: '', origem: undefined })]);
    assert.deepEqual(v.ufs, []);
    assert.deepEqual(v.segmentos, []);
    assert.deepEqual(v.origens, []);
});

test('conta por segmento, e sem segmento tem nome', () => {
    const c = contarPorSegmento([
        lead({ segmento: 'saude' }), lead({ segmento: 'saude' }), lead({ segmento: null }),
    ]);
    assert.equal(c['saude'], 2);
    assert.equal(c['sem segmento'], 1);
});

test('base vazia nao explode', () => {
    assert.deepEqual(filtrarLeads([], f({ segmento: 'saude' })), []);
    assert.deepEqual(valoresDisponiveis([]).ufs, []);
    assert.deepEqual(contarPorSegmento([]), {});
});


// ── capital social (fase 4) ─────────────────────────────────────────────────

test('faixa de capital vazia aceita qualquer valor', () => {
    assert.equal(capitalNaFaixa(1_500_000, ''), true);
    assert.equal(capitalNaFaixa(null, ''), true);
});

test('as faixas de capital nao se sobrepoem nem deixam buraco', () => {
    assert.equal(capitalNaFaixa(50_000, 'ate-50k'), true);
    assert.equal(capitalNaFaixa(50_000.01, 'ate-50k'), false);
    assert.equal(capitalNaFaixa(50_000.01, '50k-500k'), true);
    assert.equal(capitalNaFaixa(500_000, '50k-500k'), true);
    assert.equal(capitalNaFaixa(500_000.01, '500k-1m'), true);
    assert.equal(capitalNaFaixa(1_000_000, '500k-1m'), true);
    assert.equal(capitalNaFaixa(1_000_000.01, 'acima-1m'), true);
});

test('sem capital informado e categoria, e nao resto escondido', () => {
    // Enquanto as planilhas antigas nao forem reimportadas, a maior parte da
    // base nao tem esse dado. Escondе-la faria o filtro apagar quase tudo.
    assert.equal(capitalNaFaixa(null, 'sem-capital'), true);
    assert.equal(capitalNaFaixa(0, 'sem-capital'), true);
    assert.equal(capitalNaFaixa(10_000, 'sem-capital'), false);
});

test('lead sem capital NAO aparece numa faixa numerica', () => {
    assert.equal(capitalNaFaixa(null, 'acima-1m'), false);
});

test('capital soma com os outros filtros, nao substitui', () => {
    const l = lead({ segmento: 'industria', porte_funcionarios: 80, capital_social: 2_000_000 });
    assert.equal(leadCasa(l, f({ segmento: 'industria', faixaDeCapital: 'acima-1m' })), true);
    assert.equal(leadCasa(l, f({ segmento: 'industria', faixaDeCapital: 'ate-50k' })), false);
});

test('capital separa duas empresas de MESMO porte', () => {
    // O ponto da fase 4: porte igual, negocio diferente.
    const industria = lead({ id: 'ind', porte_funcionarios: 80, capital_social: 3_000_000 });
    const prestadora = lead({ id: 'pre', porte_funcionarios: 80, capital_social: 10_000 });
    const achados = filtrarLeads([industria, prestadora], f({ faixaDeCapital: 'acima-1m' }));
    assert.deepEqual(achados.map(l => l.id), ['ind']);
});

test('filtroEstaAtivo enxerga a faixa de capital', () => {
    assert.equal(filtroEstaAtivo(f({ faixaDeCapital: 'acima-1m' })), true);
});
