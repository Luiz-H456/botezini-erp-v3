import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarEmTudo, nota, POR_TIPO, type DadosDaBusca } from './buscaGeral.ts';

const dados: DadosDaBusca = {
    clientes: [
        { id: 'c1', company_name: 'Laticínio Dona Rosa', contact_person: 'Denilson' },
        { id: 'c2', company_name: 'Hospital N.S. Mercês', contact_person: 'Elisângela', phone: '(37) 99123-4567' },
    ],
    pedidos: [{ id: 'p1', order_number: 'PED-BZ-2026-047', client_id: 'c1', status: 'Em Produção' }],
    orcamentos: [{ id: 'o1', serial_number: 'ORC-BZ-2026-064', client_id: 'c2', status: 'Sent' }],
    fornecedores: [{ id: 'f1', company_name: 'Cedro Têxtil', category: 'Tecidos' }],
    produtos: [{ id: 'x1', name: 'Calça Operacional', code: 'CAL-01' }],
};

test('acha sem acento e sem diferenciar maiúsculas', () => {
    assert.deepEqual(buscarEmTudo('laticinio', dados).map(r => r.tipo), ['cliente', 'pedido']);
    assert.equal(buscarEmTudo('MERCES', dados)[0].id, 'c2');
});

test('número do pedido pelos dígitos do fim: "47" acha PED-BZ-2026-047', () => {
    const r = buscarEmTudo('47', dados);
    assert.equal(r[0].tipo, 'pedido');
    assert.equal(r[0].chave, 'PED-BZ-2026-047');
});

test('o pedido e o orçamento também aparecem pelo nome do cliente', () => {
    assert.ok(buscarEmTudo('dona rosa', dados).some(r => r.tipo === 'pedido'));
    assert.ok(buscarEmTudo('hospital', dados).some(r => r.tipo === 'orcamento'));
});

test('todas as palavras precisam aparecer, em qualquer ordem', () => {
    assert.ok(nota('rosa dona', 'Laticínio Dona Rosa') > 0);
    assert.equal(nota('rosa azul', 'Laticínio Dona Rosa'), 0);
});

test('começar com o termo vale mais que conter', () => {
    assert.ok(nota('cedro', 'Cedro Têxtil') > nota('xtil', 'Cedro Têxtil'));
});

test('termo curto (menos de 2 letras) não busca; no máximo 5 por tipo', () => {
    assert.deepEqual(buscarEmTudo('a', dados), []);
    const muitos: DadosDaBusca = { ...dados, clientes: Array.from({ length: 9 }, (_, i) => ({ id: `k${i}`, company_name: `Cliente Teste ${i}` })) };
    assert.equal(buscarEmTudo('cliente teste', muitos).filter(r => r.tipo === 'cliente').length, POR_TIPO);
});

test('número curto vale para pedido/orçamento, não para o telefone de um cliente', () => {
    const comTelefone: DadosDaBusca = { ...dados, clientes: [...dados.clientes, { id: 'c9', company_name: 'São Joanense', phone: '(32) 3371-2247' }] };
    const r = buscarEmTudo('47', comTelefone);
    assert.equal(r[0].tipo, 'pedido');
    assert.ok(!r.slice(0, 2).some(x => x.id === 'c9'));
    // Telefone ainda acha com 4 dígitos ou mais
    assert.equal(buscarEmTudo('2247', comTelefone)[0].id, 'c9');
});
