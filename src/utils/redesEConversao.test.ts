import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    agruparEmRedes, abordagensEconomizadas, type LeadDaRede,
} from './redesEConversao.ts';

const lead = (p: Partial<LeadDaRede> & { id: string }): LeadDaRede => ({
    razao_social: 'Empresa', segmento: 'saude', status: 'contatado', ...p,
});

// ── redes ───────────────────────────────────────────────────────────────────

test('agrupa matriz e filiais pela raiz do CNPJ', () => {
    const redes = agruparEmRedes([
        lead({ id: 'a', cnpj_raiz: '12345678', razao_social: 'Rede Matriz', porte_funcionarios: 300 }),
        lead({ id: 'b', cnpj_raiz: '12345678', razao_social: 'Rede Filial 1', porte_funcionarios: 40 }),
        lead({ id: 'c', cnpj_raiz: '12345678', razao_social: 'Rede Filial 2', porte_funcionarios: 30 }),
    ]);
    assert.equal(redes.length, 1);
    assert.equal(redes[0].total, 3);
    assert.equal(redes[0].principal.id, 'a', 'a maior vira a principal');
    assert.deepEqual(redes[0].filiais.map(f => f.id), ['b', 'c']);
});

test('empresa sozinha NAO vira rede de um', () => {
    // Listar uma empresa como "rede" seria ruido em cima de ruido.
    assert.deepEqual(agruparEmRedes([lead({ id: 'a', cnpj_raiz: '11111111' })]), []);
});

test('lead sem raiz de CNPJ e ignorado, e nao agrupado num balde vazio', () => {
    const redes = agruparEmRedes([
        lead({ id: 'a', cnpj_raiz: null }),
        lead({ id: 'b', cnpj_raiz: '' }),
        lead({ id: 'c', cnpj_raiz: '   ' }),
    ]);
    assert.deepEqual(redes, []);
});

test('a principal e a de MAIOR porte, nao a primeira da lista', () => {
    // O cadastro nao marca matriz. Entre unidades da mesma rede, a maior e a
    // que costuma decidir compra.
    const redes = agruparEmRedes([
        lead({ id: 'pequena', cnpj_raiz: '99', porte_funcionarios: 10 }),
        lead({ id: 'grande', cnpj_raiz: '99', porte_funcionarios: 900 }),
    ]);
    assert.equal(redes[0].principal.id, 'grande');
});

test('sem porte em nenhuma, desempata pelo nome e nao pela ordem do banco', () => {
    const entrada = [
        lead({ id: 'z', cnpj_raiz: '99', razao_social: 'Zebra' }),
        lead({ id: 'a', cnpj_raiz: '99', razao_social: 'Abelha' }),
    ];
    assert.equal(agruparEmRedes(entrada)[0].principal.id, 'a');
    assert.equal(agruparEmRedes([...entrada].reverse())[0].principal.id, 'a');
});

test('avisa quando alguma unidade da rede JA e cliente', () => {
    // Muda a abordagem por inteiro: nao e prospeccao fria, e expansao de conta.
    const redes = agruparEmRedes([
        lead({ id: 'a', cnpj_raiz: '77', client_id: 'cliente-1' }),
        lead({ id: 'b', cnpj_raiz: '77' }),
    ]);
    assert.equal(redes[0].temCliente, true);
});

test('redes maiores aparecem primeiro', () => {
    const redes = agruparEmRedes([
        lead({ id: '1', cnpj_raiz: 'pequena' }), lead({ id: '2', cnpj_raiz: 'pequena' }),
        lead({ id: '3', cnpj_raiz: 'grande' }), lead({ id: '4', cnpj_raiz: 'grande' }),
        lead({ id: '5', cnpj_raiz: 'grande' }),
    ]);
    assert.deepEqual(redes.map(r => r.total), [3, 2]);
});

test('conta quantas abordagens repetidas se evita', () => {
    const redes = agruparEmRedes([
        lead({ id: '1', cnpj_raiz: 'a' }), lead({ id: '2', cnpj_raiz: 'a' }), lead({ id: '3', cnpj_raiz: 'a' }),
        lead({ id: '4', cnpj_raiz: 'b' }), lead({ id: '5', cnpj_raiz: 'b' }),
    ]);
    assert.equal(abordagensEconomizadas(redes), 3, '2 filiais + 1 filial');
});
