import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    secaoDaLinha, ordenarPorSecao, rotuloDaSecao, SEM_CATEGORIA,
} from './listaPorSetor.ts';
import type { CategoriaConhecida } from './listaPorSetor.ts';

const catalogo: CategoriaConhecida[] = [
    { id: 'c1', name: 'Frigorífico', domain: 'crm' },
    { id: 'c2', name: 'Hospitalar', domain: 'crm' },
    { id: 'p1', name: 'Jaleco', domain: 'inventory' },
    { id: 'f1', name: 'Despesas fixas', domain: 'finance' },
];

// ─── a que seção a linha pertence ────────────────────────────────────────────

test('o vínculo pelo id manda sobre o nome copiado', () => {
    const s = secaoDaLinha({ global_category_id: 'c1', category: 'nome velho' }, catalogo, 'crm');
    assert.equal(s.categoria, 'Frigorífico');
    assert.equal(s.setor, 'crm');
    assert.equal(s.forasteira, false);
});

test('sem vínculo, o nome copiado é casado contra o catálogo', () => {
    const s = secaoDaLinha({ category: 'Hospitalar' }, catalogo, 'crm');
    assert.equal(s.setor, 'crm');
});

test('categoria de outro setor num cliente é marcada como forasteira', () => {
    const s = secaoDaLinha({ category: 'Despesas fixas' }, catalogo, 'crm');
    assert.equal(s.setor, 'finance');
    assert.equal(s.forasteira, true);
});

test('nome de produto cadastrado como categoria de cliente também é forasteiro', () => {
    const s = secaoDaLinha({ global_category_id: 'p1' }, catalogo, 'crm');
    assert.equal(s.setor, 'inventory');
    assert.equal(s.forasteira, true);
});

test('a mesma categoria não é forasteira na página do próprio setor', () => {
    const s = secaoDaLinha({ global_category_id: 'p1' }, catalogo, 'inventory');
    assert.equal(s.forasteira, false);
});

test('linha sem categoria nenhuma cai em "Sem categoria"', () => {
    const s = secaoDaLinha({}, catalogo, 'crm');
    assert.equal(s.categoria, SEM_CATEGORIA);
    assert.equal(s.setor, null);
    assert.equal(s.forasteira, false);
});

test('categoria só em texto, fora do catálogo, não é acusada de forasteira', () => {
    // É legado sem vínculo — culpar o usuário por dado que o sistema criou
    // antes de existir catálogo seria mentira.
    const s = secaoDaLinha({ category: 'Coisa antiga' }, catalogo, 'crm');
    assert.equal(s.categoria, 'Coisa antiga');
    assert.equal(s.setor, null);
    assert.equal(s.forasteira, false);
});

test('espaço em branco não vira categoria', () => {
    assert.equal(secaoDaLinha({ category: '   ' }, catalogo, 'crm').categoria, SEM_CATEGORIA);
});

test('catálogo ausente não quebra', () => {
    const s = secaoDaLinha({ category: 'Qualquer' }, undefined, 'crm');
    assert.equal(s.categoria, 'Qualquer');
    assert.equal(s.setor, null);
});

// ─── ordenação ───────────────────────────────────────────────────────────────

const nome = (x: any) => x.nome;

test('a seção do setor da página vem primeiro, sem categoria por último', () => {
    const itens = [
        { nome: 'Z', category: 'Despesas fixas' },     // finance
        { nome: 'Y' },                                  // sem categoria
        { nome: 'X', category: 'Frigorífico' },         // crm — o assunto da página
        { nome: 'W', category: 'Jaleco' },              // inventory
    ];
    const r = ordenarPorSecao(itens, catalogo, 'crm', nome);
    assert.deepEqual(r.map(l => l.item.nome), ['X', 'W', 'Z', 'Y']);
});

test('dentro da seção, ordena por categoria e depois por nome', () => {
    const itens = [
        { nome: 'Beta', category: 'Hospitalar' },
        { nome: 'Alfa', category: 'Hospitalar' },
        { nome: 'Gama', category: 'Frigorífico' },
    ];
    const r = ordenarPorSecao(itens, catalogo, 'crm', nome);
    assert.deepEqual(r.map(l => l.item.nome), ['Gama', 'Alfa', 'Beta']);
});

test('a ordenação acontece antes de paginar — a seção fica contígua', () => {
    const itens = [
        { nome: 'A', category: 'Frigorífico' },
        { nome: 'B', category: 'Despesas fixas' },
        { nome: 'C', category: 'Frigorífico' },
    ];
    const r = ordenarPorSecao(itens, catalogo, 'crm', nome);
    const setores = r.map(l => l.secao.setor);
    assert.deepEqual(setores, ['crm', 'crm', 'finance']);
});

test('lista vazia devolve vazio', () => {
    assert.deepEqual(ordenarPorSecao([], catalogo, 'crm', nome), []);
});

// ─── rótulos ─────────────────────────────────────────────────────────────────

test('o setor da página ganha nome da página, não do domínio', () => {
    assert.equal(rotuloDaSecao('crm', 'crm', 'clients'), 'Categorias de cliente');
    assert.equal(rotuloDaSecao('crm', 'crm', 'suppliers'), 'Categorias de fornecedor');
    assert.equal(rotuloDaSecao('inventory', 'inventory', 'products'), 'Categorias de produto');
});

test('setor de fora é nomeado pelo que ele é', () => {
    assert.equal(rotuloDaSecao('finance', 'crm', 'clients'), 'Categorias financeiras');
    assert.equal(rotuloDaSecao('inventory', 'crm', 'clients'), 'Categorias de produto');
});

test('sem setor é "Sem categoria"', () => {
    assert.equal(rotuloDaSecao(null, 'crm', 'clients'), SEM_CATEGORIA);
});
