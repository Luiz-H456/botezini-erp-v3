import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolverCanonico, mapaDeCanonicos, canonico, normalizarNome, soDigitos,
    semelhanca, candidatosDeCliente, duplicatasDe,
    gruposDeClientes, membrosDoGrupo, nomesDeGrupo,
} from './apelidosDeCliente.ts';
import type { ClienteComApelido } from './apelidosDeCliente.ts';

const mapaDe = (cs: ClienteComApelido[]) => new Map(cs.map(c => [c.id, c]));

// ─── resolução da cadeia ─────────────────────────────────────────────────────

test('segue a cadeia de duplicatas até o cadastro oficial', () => {
    const cs = [
        { id: 'a', canonical_client_id: 'b' },
        { id: 'b', canonical_client_id: 'c' },
        { id: 'c' },
    ];
    assert.equal(resolverCanonico('a', mapaDe(cs)), 'c');
});

test('ciclo não trava a tela — para no primeiro repetido', () => {
    const cs = [
        { id: 'a', canonical_client_id: 'b' },
        { id: 'b', canonical_client_id: 'a' },
    ];
    assert.equal(resolverCanonico('a', mapaDe(cs)), 'b');
});

test('apontar para cadastro sumido para onde estava, sem quebrar', () => {
    const cs = [{ id: 'a', canonical_client_id: 'fantasma' }];
    assert.equal(resolverCanonico('a', mapaDe(cs)), 'a');
});

test('o mapa resolve todos de uma vez', () => {
    const m = mapaDeCanonicos([
        { id: 'a', canonical_client_id: 'c' },
        { id: 'b', canonical_client_id: 'c' },
        { id: 'c' },
    ]);
    assert.equal(canonico('a', m), 'c');
    assert.equal(canonico('b', m), 'c');
    assert.equal(canonico('c', m), 'c');
});

test('cliente desconhecido continua sendo ele mesmo', () => {
    assert.equal(canonico('x', mapaDeCanonicos([])), 'x');
});

// ─── normalização ────────────────────────────────────────────────────────────

test('tira acento, caixa e as palavras que toda empresa tem', () => {
    assert.equal(normalizarNome('FRIGORÍFICO AURORA LTDA'), 'frigorifico aurora');
    assert.equal(normalizarNome('Aurora Comércio e Indústria ME'), 'aurora');
});

test('CNPJ compara só pelos dígitos', () => {
    assert.equal(soDigitos('12.345.678/0001-90'), '12345678000190');
    assert.equal(soDigitos(null), '');
});

test('nomes iguais depois de normalizados têm semelhança 1', () => {
    assert.equal(semelhanca('AURORA LTDA', 'Aurora'), 1);
});

// ─── candidatos ──────────────────────────────────────────────────────────────

const base: ClienteComApelido[] = [
    { id: '1', company_name: 'Frigorífico Aurora Ltda', cnpj: '12.345.678/0001-90' },
    { id: '2', company_name: 'AURORA FRIGORIFICO', cnpj: '12345678000190' },
    { id: '3', company_name: 'Granja Sol Matriz', cnpj: '99.999.999/0001-11' },
    { id: '4', company_name: 'Granja Sol Filial BH', cnpj: '99.999.999/0002-00' },
    { id: '5', company_name: 'Padaria do Zé', cnpj: '11.111.111/0001-11' },
];

test('CNPJ igual é a evidência mais forte e vem primeiro', () => {
    const r = candidatosDeCliente(base[0], base);
    assert.equal(r[0].cliente.id, '2');
    assert.equal(r[0].mesmoCnpj, true);
});

test('filial NÃO é duplicata: CNPJ diferente, mesmo com nome parecido', () => {
    // Este é o caso que separa mesclar de agrupar. Se o app tratasse nome
    // parecido como prova, mesclaria matriz e filial e a nota sairia errada.
    const r = candidatosDeCliente(base[2], base);
    const filial = r.find(c => c.cliente.id === '4');
    assert.equal(filial?.mesmoCnpj, false, 'CNPJ diferente');
    assert.ok(filial, 'ainda aparece como sugestão para a pessoa julgar');
});

test('empresa sem relação nenhuma não é sugerida', () => {
    const r = candidatosDeCliente(base[0], base);
    assert.equal(r.some(c => c.cliente.id === '5'), false);
});

test('quem já é duplicata de alguém não é sugerido de novo', () => {
    const comDup = [...base, { id: '6', company_name: 'Frigorífico Aurora', canonical_client_id: '1' }];
    const r = candidatosDeCliente(base[0], comDup);
    assert.equal(r.some(c => c.cliente.id === '6'), false);
});

test('o próprio cliente nunca aparece na lista', () => {
    const r = candidatosDeCliente(base[0], base);
    assert.equal(r.some(c => c.cliente.id === '1'), false);
});

test('cliente sem nome nem CNPJ não gera sugestão', () => {
    assert.deepEqual(candidatosDeCliente({ id: 'x' }, base), []);
});

test('as duplicatas de um cliente são listadas para o cadastro mostrar', () => {
    const comDup = [...base, { id: '9', company_name: 'Aurora Velha', canonical_client_id: '1' }];
    assert.deepEqual(duplicatasDe('1', comDup).map(c => c.id), ['9']);
});

// ─── grupos ──────────────────────────────────────────────────────────────────

const comGrupo: ClienteComApelido[] = [
    { id: '1', company_name: 'Granja Sol Matriz', grupo_economico: 'Grupo Sol' },
    { id: '2', company_name: 'Granja Sol Filial BH', grupo_economico: 'Grupo Sol' },
    { id: '3', company_name: 'Sol Alimentos', grupo_economico: 'Grupo Sol' },
    { id: '4', company_name: 'Padaria do Zé' },
    { id: '5', company_name: 'Outra Coisa', grupo_economico: 'Grupo Beta' },
];

test('agrupa as empresas pelo nome do grupo', () => {
    const g = gruposDeClientes(comGrupo);
    assert.deepEqual(g.map(x => x.nome), ['Grupo Beta', 'Grupo Sol']);
    assert.equal(g.find(x => x.nome === 'Grupo Sol')!.membros.length, 3);
});

test('cliente sem grupo não vira grupo de um', () => {
    const g = gruposDeClientes(comGrupo);
    assert.equal(g.some(x => x.membros.some(m => m.id === '4')), false);
});

test('duplicata fica FORA do grupo — somaria o faturamento duas vezes', () => {
    // O total do grupo é a razão de ele existir; contar o mesmo cliente duas
    // vezes destruiria justamente o número que se quer.
    const comDup = [...comGrupo,
    { id: '6', company_name: 'Granja Sol', grupo_economico: 'Grupo Sol', canonical_client_id: '1' }];
    assert.equal(gruposDeClientes(comDup).find(x => x.nome === 'Grupo Sol')!.membros.length, 3);
    assert.equal(membrosDoGrupo('Grupo Sol', comDup).length, 3);
});

test('espaço em branco não cria grupo fantasma', () => {
    const g = gruposDeClientes([{ id: '1', company_name: 'X', grupo_economico: '   ' }]);
    assert.deepEqual(g, []);
});

test('os membros vêm em ordem alfabética', () => {
    assert.deepEqual(
        membrosDoGrupo('Grupo Sol', comGrupo).map(c => c.company_name),
        ['Granja Sol Filial BH', 'Granja Sol Matriz', 'Sol Alimentos']);
});

test('buscar membros ignora caixa do nome do grupo', () => {
    assert.equal(membrosDoGrupo('grupo sol', comGrupo).length, 3);
});

test('a lista de nomes alimenta o seletor sem repetir', () => {
    assert.deepEqual(nomesDeGrupo(comGrupo), ['Grupo Beta', 'Grupo Sol']);
});

test('listas ausentes não quebram', () => {
    assert.deepEqual(gruposDeClientes(undefined), []);
    assert.deepEqual(membrosDoGrupo('X', undefined), []);
    assert.deepEqual(nomesDeGrupo(undefined), []);
});

// ─── papel no grupo (matriz / filial / coligada) ────────────────────────────

import { papelNoGrupo, membrosClassificados, raizDoCnpj, ordemDoEstabelecimento } from './apelidosDeCliente.ts';

const grupoSol: ClienteComApelido[] = [
    { id: 'm', company_name: 'Granja Sol Matriz', cnpj: '99.999.999/0001-11', grupo_economico: 'Grupo Sol' },
    { id: 'f1', company_name: 'Granja Sol Filial BH', cnpj: '99.999.999/0002-00', grupo_economico: 'Grupo Sol' },
    { id: 'f2', company_name: 'Granja Sol Filial SP', cnpj: '99.999.999/0003-90', grupo_economico: 'Grupo Sol' },
    { id: 'c', company_name: 'Sol Alimentos', cnpj: '11.222.333/0001-44', grupo_economico: 'Grupo Sol' },
];

test('a raiz do CNPJ são os 8 primeiros dígitos', () => {
    assert.equal(raizDoCnpj('99.999.999/0002-00'), '99999999');
    assert.equal(ordemDoEstabelecimento('99.999.999/0002-00'), '0002');
});

test('sufixo 0001 com irmãos da mesma raiz é a MATRIZ', () => {
    assert.equal(papelNoGrupo(grupoSol[0], grupoSol), 'matriz');
});

test('sufixo 0002+ da mesma raiz é FILIAL', () => {
    assert.equal(papelNoGrupo(grupoSol[1], grupoSol), 'filial');
    assert.equal(papelNoGrupo(grupoSol[2], grupoSol), 'filial');
});

test('raiz diferente é COLIGADA, não filial — chamá-la de filial seria mentira', () => {
    assert.equal(papelNoGrupo(grupoSol[3], grupoSol), 'coligada');
});

test('empresa sozinha na raiz é coligada, mesmo terminando em 0001', () => {
    // Sem irmão de mesma raiz não há hierarquia a declarar: ela não é matriz
    // DE nada dentro deste grupo.
    const so = [grupoSol[0], grupoSol[3]];
    assert.equal(papelNoGrupo(grupoSol[0], so), 'coligada');
});

test('cliente sem CNPJ não é classificado como filial de ninguém', () => {
    const semCnpj = [{ id: 'x', company_name: 'Sem CNPJ', grupo_economico: 'G' }, ...grupoSol];
    assert.equal(papelNoGrupo(semCnpj[0], semCnpj), 'coligada');
});

test('a ordem responde "qual é a base": matriz, filiais, coligadas', () => {
    const r = membrosClassificados('Grupo Sol', grupoSol);
    assert.deepEqual(r.map(x => x.papel), ['matriz', 'filial', 'filial', 'coligada']);
    assert.equal(r[0].cliente.company_name, 'Granja Sol Matriz');
});

test('duplicata não entra na classificação do grupo', () => {
    const comDup = [...grupoSol,
    { id: 'd', company_name: 'Granja Sol', cnpj: '99.999.999/0001-11', grupo_economico: 'Grupo Sol', canonical_client_id: 'm' }];
    assert.equal(membrosClassificados('Grupo Sol', comDup).length, 4);
});

test('grupo inexistente devolve lista vazia', () => {
    assert.deepEqual(membrosClassificados('Nao Existe', grupoSol), []);
});
