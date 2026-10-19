import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    agrupar, agruparPorCategoria, agruparPorTipo, opcoesDeCategoria,
    SEM_GRUPO, TIPO_DE_CONTA,
} from './opcoesAgrupadas.ts';

const rotulos = (opcoes: any[]) =>
    opcoes.map(o => (o.isHeader ? `# ${o.label}` : o.label));

test('grupo único não vira divisória — cabeçalho sozinho não separa nada', () => {
    const r = agrupar([
        { value: '1', label: 'Beta', grupo: 'Ramo' },
        { value: '2', label: 'Alfa', grupo: 'Ramo' },
    ]);
    assert.deepEqual(rotulos(r), ['Alfa', 'Beta']);
    assert.equal(r.some(o => o.isHeader), false);
});

test('com mais de um grupo, cada bloco ganha cabeçalho e ordem alfabética', () => {
    const r = agrupar([
        { value: '1', label: 'Zeta', grupo: 'Indústria' },
        { value: '2', label: 'Alfa', grupo: 'Hospitalar' },
        { value: '3', label: 'Beta', grupo: 'Indústria' },
    ]);
    assert.deepEqual(rotulos(r), ['# HOSPITALAR', 'Alfa', '# INDÚSTRIA', 'Beta', 'Zeta']);
});

test('o que não tem grupo vai para o fim, nunca para o meio', () => {
    const r = agrupar([
        { value: '1', label: 'Sem dono' },
        { value: '2', label: 'Alfa', grupo: 'Zzz' },
        { value: '3', label: 'Beta', grupo: 'Aaa' },
    ]);
    assert.deepEqual(rotulos(r), ['# AAA', 'Beta', '# ZZZ', 'Alfa', `# ${SEM_GRUPO.toUpperCase()}`, 'Sem dono']);
});

test('cada opção carrega o grupo, para o campo fechado mostrar de onde veio', () => {
    const r = agrupar([
        { value: '1', label: 'Alfa', grupo: 'Um' },
        { value: '2', label: 'Beta', grupo: 'Dois' },
    ]);
    assert.equal(r.find(o => o.value === '1')?.group, 'Um');
    assert.equal(r.find(o => o.value === '2')?.group, 'Dois');
});

test('o id da categoria vence o nome copiado — o vínculo é a verdade', () => {
    const cats = [{ id: 'c1', name: 'Hospitalar' }] as any;
    const r = agruparPorCategoria(
        [
            { id: 's1', company_name: 'Alfa', global_category_id: 'c1', category: 'nome velho' },
            { id: 's2', company_name: 'Beta', category: 'Frigorífico' },
        ] as any,
        (s: any) => s.company_name,
        cats,
    );
    assert.deepEqual(rotulos(r), ['# FRIGORÍFICO', 'Beta', '# HOSPITALAR', 'Alfa']);
});

test('sem catálogo de categorias, o nome copiado ainda agrupa', () => {
    const r = agruparPorCategoria(
        [
            { id: '1', company_name: 'Alfa', category: 'Bbb' },
            { id: '2', company_name: 'Beta', category: 'Aaa' },
        ] as any,
        (s: any) => s.company_name,
    );
    assert.deepEqual(rotulos(r), ['# AAA', 'Beta', '# BBB', 'Alfa']);
});

test('tipo vira o rótulo da tela, não o enum do banco', () => {
    const r = agruparPorTipo(
        [
            { id: '1', name: 'Itaú', type: 'checking' },
            { id: '2', name: 'Cofre', type: 'cash' },
        ] as any,
        (a: any) => a.name,
        (a: any) => a.type,
        TIPO_DE_CONTA,
    );
    assert.deepEqual(rotulos(r), ['# CAIXA', 'Cofre', '# CONTA CORRENTE', 'Itaú']);
});

// ─── categorias em dois níveis ───────────────────────────────────────────────

const catalogo = [
    { id: 'g1', name: 'Despesas mensais', domain: 'finance', is_active: true },
    { id: 'f1', name: 'Energia', domain: 'finance', is_active: true, parent_id: 'g1' },
    { id: 'f2', name: 'Água', domain: 'finance', is_active: true, parent_id: 'g1' },
    { id: 'g2', name: 'Vazio', domain: 'finance', is_active: true },
    { id: 'x1', name: 'De outro setor', domain: 'crm', is_active: true },
] as any;

test('só a categoria de dentro é escolhível; o grupo é cabeçalho', () => {
    const r = opcoesDeCategoria(catalogo, 'finance');
    assert.deepEqual(rotulos(r), ['# DESPESAS MENSAIS', 'ÁGUA', 'ENERGIA']);
    assert.equal(r.filter(o => !o.isHeader).length, 2);
});

test('grupo vazio não vira cabeçalho — seria um título sem nada embaixo', () => {
    const r = opcoesDeCategoria(catalogo, 'finance');
    assert.equal(r.some(o => o.label === 'VAZIO'), false);
});

test('o setor filtra: categoria de outro domínio não aparece', () => {
    const r = opcoesDeCategoria(catalogo, 'finance');
    assert.equal(r.some(o => o.label.includes('OUTRO SETOR')), false);
});

test('valor já gravado fora da regra continua visível, marcado à parte', () => {
    // Aponta para o GRUPO, que a regra nova não deixa escolher. Sem isto o campo
    // ficaria em branco num registro que tem categoria.
    const r = opcoesDeCategoria(catalogo, 'finance', 'g1');
    assert.equal(r.some(o => o.isHeader && o.label === 'FORA DE GRUPO'), true);
    assert.equal(r.some(o => o.value === 'g1' && !o.isHeader), true);
});

test('valor dentro da regra não duplica em "fora de grupo"', () => {
    const r = opcoesDeCategoria(catalogo, 'finance', 'f1');
    assert.equal(r.some(o => o.label === 'FORA DE GRUPO'), false);
    assert.equal(r.filter(o => o.value === 'f1').length, 1);
});

test('categoria desativada some da lista', () => {
    const comInativa = [...catalogo,
    { id: 'f3', name: 'Antiga', domain: 'finance', is_active: false, parent_id: 'g1' }] as any;
    const r = opcoesDeCategoria(comInativa, 'finance');
    assert.equal(r.some(o => o.label === 'ANTIGA'), false);
});

test('filha cujo pai sumiu não vira opção fantasma sem cabeçalho', () => {
    const orfa = [...catalogo,
    { id: 'f9', name: 'Perdida', domain: 'finance', is_active: true, parent_id: 'nao-existe' }] as any;
    const r = opcoesDeCategoria(orfa, 'finance');
    assert.equal(r.some(o => o.label === 'PERDIDA'), false);
});

test('lista vazia não quebra', () => {
    assert.deepEqual(agrupar([]), []);
    assert.deepEqual(opcoesDeCategoria([], 'crm'), []);
});

// ── outros setores, em ordem de utilidade ────────────────────────────────────

const multiSetor = [
    { id: 'gc', name: 'Ramo', domain: 'crm', is_active: true },
    { id: 'c1', name: 'Frigorífico', domain: 'crm', is_active: true, parent_id: 'gc' },
    { id: 'gf', name: 'Despesas', domain: 'finance', is_active: true },
    { id: 'f1', name: 'Aluguel', domain: 'finance', is_active: true, parent_id: 'gf' },
    { id: 'gi', name: 'Peças', domain: 'inventory', is_active: true },
    { id: 'i1', name: 'Jaleco', domain: 'inventory', is_active: true, parent_id: 'gi' },
] as any;

test('sem incluirOutrosSetores, só o setor da tela aparece', () => {
    const r = opcoesDeCategoria(multiSetor, 'crm');
    assert.deepEqual(rotulos(r), ['# RAMO', 'FRIGORÍFICO']);
});

test('com outros setores, o da tela vem primeiro e os demais depois, rotulados', () => {
    const r = opcoesDeCategoria(multiSetor, 'crm', undefined, true);
    assert.deepEqual(rotulos(r), [
        '# RAMO', 'FRIGORÍFICO',
        '# ▸ CATEGORIAS DE PRODUTOS', '# PEÇAS', 'JALECO',
        '# ▸ CATEGORIAS DE FINANCEIRO', '# DESPESAS', 'ALUGUEL',
    ]);
});

test('na tela financeira, o financeiro é que vem primeiro', () => {
    const r = opcoesDeCategoria(multiSetor, 'finance', undefined, true);
    assert.deepEqual(rotulos(r).slice(0, 2), ['# DESPESAS', 'ALUGUEL']);
});

test('categoria de outro setor continua escolhível, não é só enfeite', () => {
    const r = opcoesDeCategoria(multiSetor, 'crm', undefined, true);
    const jaleco = r.find(o => o.label === 'JALECO');
    assert.equal(jaleco?.isHeader, undefined);
    assert.equal(jaleco?.value, 'i1');
});

test('setor sem nenhuma categoria não gera cabeçalho vazio', () => {
    const soCrm = multiSetor.filter((c: any) => c.domain === 'crm');
    const r = opcoesDeCategoria(soCrm, 'crm', undefined, true);
    assert.equal(r.some(o => String(o.label).includes('▸')), false);
});

test('o id do grupo não colide entre setores', () => {
    const r = opcoesDeCategoria(multiSetor, 'crm', undefined, true);
    const valores = r.map(o => o.value);
    assert.equal(new Set(valores).size, valores.length, 'valores duplicados na lista');
});
