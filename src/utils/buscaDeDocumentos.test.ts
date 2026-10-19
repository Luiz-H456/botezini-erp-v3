import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizar, indexarClientes, documentoCasa, filtrarDocumentos,
} from './buscaDeDocumentos.ts';

const clientes = [
    { id: 'c1', company_name: 'Hospital São Lucas LTDA', trade_name: 'Santa Casa', cnpj: '12.345.678/0001-90' },
    { id: 'c2', company_name: 'Padaria Três Irmãos', cnpj: '98765432000111' },
];
const idx = indexarClientes(clientes);

const pedido = { client_id: 'c1', order_number: 'PED-BZ-2026-041' };
const orcamento = { client_id: 'c2', serial_number: 'ORC-2026-007' };

test('termo vazio casa com tudo — quem nao digitou nao esta filtrando', () => {
    assert.equal(documentoCasa(pedido, '', idx), true);
    assert.equal(documentoCasa(pedido, '   ', idx), true);
    assert.equal(filtrarDocumentos([pedido, orcamento], '', idx).length, 2);
});

test('acha pelo numero, como sempre achou', () => {
    assert.equal(documentoCasa(pedido, 'PED-BZ-2026-041', idx), true);
    assert.equal(documentoCasa(pedido, '041', idx), true, 'pedaco do numero tambem');
});

test('acha pelo NOME DA EMPRESA — o que nao funcionava', () => {
    assert.equal(documentoCasa(pedido, 'Hospital São Lucas', idx), true);
    assert.equal(documentoCasa(pedido, 'lucas', idx), true);
});

test('acha pelo nome fantasia', () => {
    assert.equal(documentoCasa(pedido, 'Santa Casa', idx), true);
});

test('acento nao atrapalha, nos dois sentidos', () => {
    // Quem digita rapido escreve "sao"; o cadastro tem "São".
    assert.equal(documentoCasa(pedido, 'sao lucas', idx), true);
    assert.equal(documentoCasa(orcamento, 'tres irmaos', idx), true);
    // E o contrario tambem: digitar com acento acha o mesmo.
    assert.equal(documentoCasa(orcamento, 'Três Irmãos', idx), true);
});

test('caixa alta ou baixa da no mesmo', () => {
    assert.equal(documentoCasa(pedido, 'HOSPITAL', idx), true);
    assert.equal(documentoCasa(pedido, 'hospital', idx), true);
});

test('CNPJ acha pontuado ou nao — e o mesmo CNPJ', () => {
    assert.equal(documentoCasa(pedido, '12345678000190', idx), true);
    assert.equal(documentoCasa(pedido, '12.345.678/0001-90', idx), true);
    assert.equal(documentoCasa(orcamento, '98.765.432/0001-11', idx), true);
});

test('nao acha o que nao e daquele cliente', () => {
    assert.equal(documentoCasa(pedido, 'Padaria', idx), false);
    assert.equal(documentoCasa(orcamento, 'Hospital', idx), false);
});

test('documento sem cliente nao explode, so nao casa por nome', () => {
    const solto = { order_number: 'PED-999' };
    assert.equal(documentoCasa(solto, 'PED-999', idx), true);
    assert.equal(documentoCasa(solto, 'Hospital', idx), false);
});

test('cliente que nao esta no indice nao casa por nome', () => {
    const orfao = { client_id: 'sumiu', order_number: 'PED-1' };
    assert.equal(documentoCasa(orfao, 'Hospital', idx), false);
    assert.equal(documentoCasa(orfao, 'PED-1', idx), true);
});

test('termo curto sem digito nao casa CNPJ por acidente', () => {
    // "sa" nao pode virar um casamento com qualquer CNPJ.
    const so = indexarClientes([{ id: 'x', company_name: 'ACME', cnpj: '11223344000155' }]);
    assert.equal(documentoCasa({ client_id: 'x' }, 'zz', so), false);
});

test('busca no orcamento usa serial_number', () => {
    assert.equal(documentoCasa(orcamento, 'ORC-2026-007', idx), true);
});

test('filtra a lista inteira', () => {
    const achados = filtrarDocumentos([pedido, orcamento], 'santa casa', idx);
    assert.deepEqual(achados.map(d => (d as any).order_number), ['PED-BZ-2026-041']);
});

test('normalizar encolhe espaco repetido', () => {
    assert.equal(normalizar('  Hospital   São   Lucas '), 'hospital sao lucas');
});
