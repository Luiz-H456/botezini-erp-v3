import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    SECOES, ROTULO_DA_VIEW, secaoDaView, viewsDaSecao, viewInicialDaSecao, temPassos,
    todasAsViewsDoMenu, viewReal, FORA_DO_MENU, secaoPorId, CARTOES_DO_FICHARIO,
} from './navegacao.ts';
import type { View } from './navegacao.ts';

// Record<View, …> obriga o ROTULO_DA_VIEW a ter toda view: a lista nunca fica para trás.
const TODAS = Object.keys(ROTULO_DA_VIEW) as View[];

test('toda view tem dono: menu, fichário ou saída declarada', () => {
    const noMenu = new Set([...todasAsViewsDoMenu(), ...CARTOES_DO_FICHARIO]);
    for (const v of TODAS) assert.ok(noMenu.has(v) || FORA_DO_MENU.includes(v), `${v} sem lugar`);
});

test('nenhuma view aparece em duas seções', () => {
    const vistas = todasAsViewsDoMenu();
    assert.equal(new Set(vistas).size, vistas.length);
});

test('toda view tem rótulo', () => {
    for (const v of TODAS) assert.ok(ROTULO_DA_VIEW[v], v);
});

test('a ordem do menu: Início, os cinco objetivos, depois os apoios', () => {
    assert.deepEqual(SECOES.map(s => s.id),
        ['inicio', 'vender', 'producao', 'planejar', 'dinheiro', 'resultados', 'cadastros', 'notas']);
    assert.deepEqual(SECOES.filter(s => s.tipo === 'objetivo').map(s => s.id),
        ['vender', 'producao', 'planejar', 'dinheiro', 'resultados']);
    assert.deepEqual(SECOES.filter(s => s.tipo === 'apoio').map(s => s.id), ['cadastros', 'notas']);
});

test('cada objetivo traz os passos na ordem do desenho', () => {
    assert.deepEqual(viewsDaSecao('vender'), ['budgets', 'orders']);
    assert.deepEqual(viewsDaSecao('producao'), ['quadro', 'controle-parcial']);
    assert.deepEqual(viewsDaSecao('planejar'), ['cronograma', 'compras', 'inventory']);
    assert.deepEqual(viewsDaSecao('dinheiro'), ['finance', 'receivables', 'envelopes', 'saude-caixa']);
    assert.deepEqual(viewsDaSecao('resultados'), ['resultado', 'itens-vendidos', 'indicadores']);
    assert.deepEqual(viewsDaSecao('cadastros'), ['cadastros']);
});

test('o fichário tem os 8 cartões na ordem do desenho, todos em Cadastros', () => {
    assert.deepEqual(CARTOES_DO_FICHARIO,
        ['clientes', 'produtos', 'fornecedores', 'bancos', 'setores', 'empresa', 'categorias', 'mensagens']);
    for (const v of CARTOES_DO_FICHARIO) assert.equal(secaoDaView(v), 'cadastros', v);
    assert.equal(temPassos('cadastros'), false);
});

test('links antigos de Cadastros continuam abrindo', () => {
    assert.equal(viewReal('masterdata'), 'cadastros');
    assert.equal(viewReal('capacidade'), 'setores');
    assert.equal(secaoDaView('masterdata'), 'cadastros');
    assert.equal(secaoDaView('capacidade'), 'cadastros');
});

test('nenhuma seção passa de 3 passos (Dinheiro tem 4 abas, consultas irmãs sem ordem)', () => {
    for (const s of SECOES) assert.ok(s.views.length <= (s.id === 'dinheiro' ? 4 : 3), `${s.id} tem ${s.views.length}`);
});

test('só os objetivos com ordem natural são numerados', () => {
    const numerados = SECOES.filter(s => s.numerado).map(s => s.id);
    assert.deepEqual(numerados, ['vender', 'producao', 'planejar']);
});

test('links antigos do PCP abrem o Quadro', () => {
    assert.equal(viewReal('pcp'), 'quadro');
    assert.equal(viewReal('production'), 'quadro');
    assert.equal(viewReal('finance'), 'finance');
    assert.equal(secaoDaView('pcp'), 'producao');
});

test('Prospecção sai do menu, mas a view continua existindo', () => {
    assert.ok(!todasAsViewsDoMenu().includes('leads'));
    assert.ok(FORA_DO_MENU.includes('leads'));
    assert.equal(secaoDaView('leads'), null);
});

test('clicar num objetivo abre o primeiro passo dele', () => {
    assert.equal(viewInicialDaSecao('dinheiro'), 'finance');
    assert.equal(viewInicialDaSecao('producao'), 'quadro');
    assert.equal(viewInicialDaSecao('inicio'), 'dashboard');
});

test('barra de passos só aparece com mais de um passo', () => {
    assert.equal(temPassos('vender'), true);
    assert.equal(temPassos('inicio'), false);
    assert.equal(temPassos('notas'), false);
    assert.equal(temPassos(null), false);
});

test('seção inexistente não quebra', () => {
    assert.deepEqual(viewsDaSecao(undefined), []);
    assert.equal(secaoPorId(null), null);
    assert.equal(secaoDaView('login'), null);
});

test('endereço por tela: toda tela do menu tem endereço próprio e volta para ela mesma', async () => {
    const { enderecoDaView, viewDoEndereco, todasAsViewsDoMenu: menu } = await import('./navegacao.ts');
    for (const v of [...menu(), 'clientes', 'fornecedores', 'produtos', 'bancos', 'setores', 'empresa', 'categorias', 'mensagens', 'leads'] as const) {
        const end = enderecoDaView(v);
        assert.match(end, /^#\/[a-z0-9-]+$/, v);
        assert.equal(viewDoEndereco(end), v, end);
    }
});

test('endereço: apelidos levam à tela real; desconhecido, vazio e login não abrem nada', async () => {
    const { enderecoDaView, viewDoEndereco } = await import('./navegacao.ts');
    assert.equal(enderecoDaView('pcp'), enderecoDaView('quadro'));
    assert.equal(viewDoEndereco('#/nao-existe'), null);
    assert.equal(viewDoEndereco(''), null);
    assert.equal(viewDoEndereco('#/entrar'), null);
    assert.equal(viewDoEndereco('#/contas?x=1'), 'finance');
});
