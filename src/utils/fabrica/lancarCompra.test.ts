import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    partesSugeridas, erroDoItem, itensParaLancar, totalDaCompra, agruparItensDaCompra, semanaDe, diaLocal, deveResugerir, custoSugerido,
} from './lancarCompra.ts';
import type { ItemForm } from './lancarCompra.ts';

test('partesSugeridas: pedidos na ordem, resto para o estoque, quantidade em texto pt-BR', () => {
    const partes = partesSugeridas(10, [{ order_id: 'a', falta: 6 }, { order_id: 'b', falta: 2.5 }]);
    assert.deepEqual(partes, [
        { destino: 'a', quantidade: '6' },
        { destino: 'b', quantidade: '2,5' },
        { destino: '', quantidade: '1,5' },
    ]);
    assert.deepEqual(partesSugeridas(4, []), [{ destino: '', quantidade: '4' }]);
    assert.deepEqual(partesSugeridas(1000, [{ order_id: 'a', falta: 1000 }]), [{ destino: 'a', quantidade: '1.000' }]);
});

const item = (parte: Partial<ItemForm>): ItemForm => ({
    insumoId: 'malha', quantidade: '10', custo: '50', partes: [{ destino: 'a', quantidade: '6' }, { destino: '', quantidade: '4' }], ...parte,
});

test('erroDoItem: fecha só quando a soma das partes bate e há insumo, quantidade e custo', () => {
    assert.equal(erroDoItem(item({})), null);
    assert.match(erroDoItem(item({ insumoId: '' }))!, /insumo/);
    assert.match(erroDoItem(item({ quantidade: '' }))!, /quantidade/);
    assert.match(erroDoItem(item({ custo: '0' }))!, /custo/);
    assert.match(erroDoItem(item({ partes: [{ destino: 'a', quantidade: '6' }] }))!, /somam 6, a compra tem 10/);
    assert.match(erroDoItem(item({ partes: [{ destino: 'a', quantidade: '10' }, { destino: '', quantidade: '0' }] }))!, /parte/);
    // 0,1 + 0,2 não pode falhar por ponto flutuante
    assert.equal(erroDoItem(item({ quantidade: '0,3', partes: [{ destino: 'a', quantidade: '0,1' }, { destino: '', quantidade: '0,2' }] })), null);
    // "1.000" é mil
    assert.equal(erroDoItem(item({ quantidade: '1.000', partes: [{ destino: '', quantidade: '1.000' }] })), null);
});

test('itensParaLancar: uma linha por parte, estoque vira pedido_id null, custo com vírgula', () => {
    assert.deepEqual(itensParaLancar([item({ custo: '12,5' })]), [
        { insumo_id: 'malha', quantidade: 6, custo_unitario: 12.5, pedido_id: 'a' },
        { insumo_id: 'malha', quantidade: 4, custo_unitario: 12.5, pedido_id: null },
    ]);
});

test('totalDaCompra: quantidade × custo, em centavos exatos', () => {
    assert.equal(totalDaCompra([{ quantidade: 6, custo_unitario: 50 }, { quantidade: 4, custo_unitario: 50 }]), 500);
    assert.equal(totalDaCompra([{ quantidade: '0.357', custo_unitario: '12.35' }]), 4.41);
    assert.equal(totalDaCompra([]), 0);
});

test('agruparItensDaCompra: por insumo, destinos somados, estoque separado', () => {
    const g = agruparItensDaCompra([
        { insumo_id: 'malha', quantidade: 6, pedido_id: 'a' },
        { insumo_id: 'linha', quantidade: 3, pedido_id: null },
        { insumo_id: 'malha', quantidade: '2', pedido_id: null },
        { insumo_id: 'malha', quantidade: 1, pedido_id: 'a' },
    ]);
    assert.deepEqual(g, [
        { insumo_id: 'malha', total: 9, destinos: [{ pedido_id: 'a', quantidade: 7 }, { pedido_id: null, quantidade: 2 }] },
        { insumo_id: 'linha', total: 3, destinos: [{ pedido_id: null, quantidade: 3 }] },
    ]);
});

test('semanaDe: segunda a domingo, domingo pertence à semana que termina nele', () => {
    assert.deepEqual(semanaDe(new Date(2026, 9, 14)), { de: '2026-10-12', ate: '2026-10-18' }); // quarta
    assert.deepEqual(semanaDe(new Date(2026, 9, 18)), { de: '2026-10-12', ate: '2026-10-18' }); // domingo
    assert.deepEqual(semanaDe(new Date(2026, 9, 12)), { de: '2026-10-12', ate: '2026-10-18' }); // segunda
    assert.deepEqual(semanaDe(new Date(2026, 10, 1)), { de: '2026-10-26', ate: '2026-11-01' }); // vira o mês
    assert.equal(diaLocal(new Date(2026, 0, 5)), '2026-01-05');
});

test('deveResugerir: quantidade respeita partes editadas, insumo sempre refaz', () => {
    assert.equal(deveResugerir('quantidade', false), true);
    assert.equal(deveResugerir('quantidade', true), false);
    assert.equal(deveResugerir('insumo', true), true);
    assert.equal(deveResugerir('insumo', false), true);
});

test('custoSugerido: custo médio do insumo ou vazio, sem herdar o anterior', () => {
    assert.equal(custoSugerido(12.5), '12,5');
    assert.equal(custoSugerido(0), '');
    assert.equal(custoSugerido(undefined), '');
});

test('custo sugerido: o primeiro candidato positivo (tabela antes do custo médio)', () => {
    assert.equal(custoSugerido(29.15, 27), custoSugerido(29.15));
    assert.equal(custoSugerido(undefined, 27), custoSugerido(27));
    assert.equal(custoSugerido(null, 0), '');
});
