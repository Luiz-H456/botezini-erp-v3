import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaDoOrcamento, acaoDoPedido } from './etiquetas.ts';
import { filaDeFollowUp } from '../acompanhamentoComercial.ts';

const HOJE = '2026-10-09';
const orc = (p: Record<string, unknown>) => ({ id: 'o1', status: 'Sent', date: '2026-10-08', validity_days: 15, sent_at: '2026-10-08', ...p });
const resumo = (e: { texto: string; tom: string; acao: string }) => [e.texto, e.tom, e.acao];

test('rascunho, aprovado e convertido', () => {
    assert.deepEqual(resumo(etiquetaDoOrcamento(orc({ status: 'Draft' }), HOJE)), ['Rascunho', 'neutro', 'enviar']);
    assert.deepEqual(resumo(etiquetaDoOrcamento(orc({ status: 'Approved' }), HOJE)), ['Aprovado', 'verde', 'virar-pedido']);
    assert.deepEqual(resumo(etiquetaDoOrcamento(orc({ status: 'Converted', generated_order_number: '1042' }), HOJE)),
        ['Pedido #1042', 'neutro', 'ver-pedido']);
    assert.equal(etiquetaDoOrcamento(orc({ status: 'Converted' }), HOJE).texto, 'Pedido');
});

test('enviado hoje não diz "há 0 dias"', () => {
    assert.equal(etiquetaDoOrcamento(orc({ sent_at: HOJE }), HOJE).texto, 'Enviado hoje');
});

test('enviado: recente, parado, vence hoje, vence em dd/mm, vencido', () => {
    assert.deepEqual(resumo(etiquetaDoOrcamento(orc({}), HOJE)), ['Enviado há 1 dia', 'ambar', 'retomar']);
    assert.deepEqual(resumo(etiquetaDoOrcamento(orc({ sent_at: '2026-09-30', date: '2026-09-30', validity_days: 30 }), HOJE)),
        ['Parado há 9 dias', 'ambar', 'retomar']);
    assert.deepEqual(resumo(etiquetaDoOrcamento(orc({ date: '2026-10-01', validity_days: 8 }), HOJE)),
        ['Vence hoje', 'ambar', 'retomar']);
    assert.deepEqual(resumo(etiquetaDoOrcamento(orc({ date: '2026-10-01', validity_days: 10 }), HOJE)),
        ['Vence em 11/10', 'ambar', 'retomar']);
    assert.deepEqual(resumo(etiquetaDoOrcamento(orc({ date: '2026-09-17', validity_days: 15 }), HOJE)),
        ['Vencido em 02/10', 'rosa', 'revalidar']);
});

test('enviado sem sent_at e sem validade: "Enviado", sem número inventado', () => {
    assert.deepEqual(resumo(etiquetaDoOrcamento(orc({ sent_at: null, validity_days: 0 }), HOJE)), ['Enviado', 'ambar', 'retomar']);
});

test('a etiqueta e a fila de retomada classificam igual', () => {
    const lista = [
        orc({ id: 'a' }), orc({ id: 'b', sent_at: '2026-09-30', date: '2026-09-30', validity_days: 30 }),
        orc({ id: 'c', date: '2026-09-17', validity_days: 15 }),
    ];
    for (const item of filaDeFollowUp(lista, HOJE)) {
        const e = etiquetaDoOrcamento(item.orcamento, HOJE);
        assert.equal(e.acao === 'revalidar', item.urgencia === 'vencido', item.orcamento.id);
    }
});

test('ação do pedido pela fase', () => {
    assert.deepEqual(acaoDoPedido({ status: 'Pendente' }, 'Expedição'), { acao: 'confirmar', rotulo: 'Confirmar ao cliente' });
    assert.deepEqual(acaoDoPedido({ status: 'Em Produção', production_stage: 'Costura' }, 'Expedição'), { acao: 'andamento', rotulo: 'Avisar andamento' });
    assert.deepEqual(acaoDoPedido({ status: 'Em Produção', production_stage: 'Expedição' }, 'Expedição'), { acao: 'ficha-de-entrega', rotulo: 'Ficha de entrega' });
    assert.deepEqual(acaoDoPedido({ status: 'Entregue' }, 'Expedição'), { acao: 'ficha-de-entrega', rotulo: 'Ficha de entrega' });
});
