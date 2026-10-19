import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirConversao, contarPecas } from './resumoDaConversao.ts';
import type { DadosDaConversao } from './resumoDaConversao.ts';

const HOJE = '2026-08-25';

const dados = (over: Partial<DadosDaConversao> = {}): DadosDaConversao => ({
    orcamento: {
        serial_number: 'ORC-9',
        total_amount: 1400,
        status: 'Aprovado',
        items: [
            { product_name: 'Camisa Polo', size: 'M', quantity: 20 },
            { product_name: 'Camisa Polo', size: 'G', quantity: 10 },
        ],
        reference_photos: ['a.jpg'],
        ...(over.orcamento || {}),
    },
    cliente: 'Granha Alimentos',
    plano: [
        { label: 'Entrada (50%)', amount: 700, due: '2026-08-25', method: 'PIX' },
        { label: 'Saldo na entrega', amount: 700, due: '2026-09-22', method: 'PIX' },
    ],
    entrega: '2026-09-22',
    numeroDoPedido: '31',
    hoje: HOJE,
    ...over,
});

const textos = (r: ReturnType<typeof resumirConversao>) => r.avisos.map(a => a.texto).join(' | ');

// ─── contagem ────────────────────────────────────────────────────────────────

test('peças somam a quantidade, não a contagem de linhas', () => {
    assert.equal(contarPecas([{ quantity: 20 }, { quantity: 10 }]), 30);
});

test('item sem quantidade não quebra a soma', () => {
    assert.equal(contarPecas([{ quantity: 5 }, {}]), 5);
    assert.equal(contarPecas(undefined), 0);
});

// ─── o que nasce ─────────────────────────────────────────────────────────────

test('o pedido a criar traz cliente, itens, peças e entrega', () => {
    const r = resumirConversao(dados());
    assert.equal(r.criar[0].o_que, 'Pedido #31');
    assert.equal(r.criar[0].detalhe, 'Granha Alimentos');
    assert.match(r.criar[0].nota!, /2 itens/);
    assert.match(r.criar[0].nota!, /30 peças/);
    assert.match(r.criar[0].nota!, /22\/09\/2026/);
});

test('as contas a receber aparecem com a soma', () => {
    const r = resumirConversao(dados());
    assert.equal(r.criar[1].o_que, '2 contas a receber');
    assert.match(r.criar[1].detalhe, /1\.400,00/);
});

test('parcela única fala no singular', () => {
    const r = resumirConversao(dados({
        plano: [{ label: 'À vista', amount: 1400, due: '2026-09-22' }],
    }));
    assert.equal(r.criar[1].o_que, '1 conta a receber');
});

test('item único e peça única também', () => {
    const r = resumirConversao(dados({
        orcamento: { serial_number: 'ORC-1', total_amount: 50, items: [{ quantity: 1 }] },
    }));
    assert.match(r.criar[0].nota!, /1 item /);
    assert.match(r.criar[0].nota!, /1 peça/);
});

// ─── o que muda ──────────────────────────────────────────────────────────────

test('o orçamento muda de estado e isso é dito', () => {
    const r = resumirConversao(dados());
    assert.equal(r.alterar[0].o_que, 'Orçamento ORC-9');
    assert.equal(r.alterar[0].detalhe, 'Aprovado → Convertido');
});

test('as fotos entram na lista do que é copiado', () => {
    const r = resumirConversao(dados());
    assert.ok(r.alterar.some(l => /foto de referência/.test(l.o_que)));
});

test('sem fotos, nada de foto na lista de alterações', () => {
    const r = resumirConversao(dados({
        orcamento: { serial_number: 'X', total_amount: 100, items: [{ quantity: 1 }], reference_photos: [] },
    }));
    assert.equal(r.alterar.some(l => /foto/.test(l.o_que)), false);
});

test('a observação de fábrica é listada quando existe', () => {
    const r = resumirConversao(dados({
        orcamento: {
            serial_number: 'X', total_amount: 1400, items: [{ quantity: 1 }],
            factory_notes: 'CONFERIR TONALIDADE',
        },
    }));
    const linha = r.alterar.find(l => /Observação de fábrica/.test(l.o_que));
    assert.ok(linha);
    assert.match(linha!.nota!, /nunca no PDF do cliente/);
});

test('observação só com espaço não conta como preenchida', () => {
    const r = resumirConversao(dados({
        orcamento: { serial_number: 'X', total_amount: 1400, items: [{ quantity: 1 }], factory_notes: '   ' },
    }));
    assert.equal(r.alterar.some(l => /Observação de fábrica/.test(l.o_que)), false);
});

// ─── os avisos que faltavam ──────────────────────────────────────────────────

test('o caso real: plano de 400 num pedido de 1400 é acusado como erro', () => {
    const r = resumirConversao(dados({
        plano: [
            { label: 'Entrada', amount: 200, due: '2026-08-11' },
            { label: 'Saldo', amount: 200, due: '2026-09-08' },
        ],
    }));
    const erro = r.avisos.find(a => a.gravidade === 'erro' && /somam R\$\s*400,00/.test(a.texto));
    assert.ok(erro);
    assert.match(erro!.texto, /1\.000,00 a menos/);
});

test('parcela vencida é acusada e marcada na linha', () => {
    const r = resumirConversao(dados({
        plano: [
            { label: 'Entrada', amount: 700, due: '2026-08-11' },
            { label: 'Saldo', amount: 700, due: '2026-09-22' },
        ],
    }));
    assert.equal(r.parcelas[0].vencida, true);
    assert.equal(r.parcelas[1].vencida, false);
    assert.match(textos(r), /já nasce vencida/);
});

test('plano em dia e batendo não gera erro nenhum', () => {
    const r = resumirConversao(dados());
    assert.equal(r.avisos.some(a => a.gravidade === 'erro'), false);
    assert.equal(r.impedido, false);
});

test('parcela vencendo hoje não é parcela vencida', () => {
    const r = resumirConversao(dados());
    assert.equal(r.parcelas[0].vencida, false);
});

// ─── travas ──────────────────────────────────────────────────────────────────

test('sem plano, a conversão é impedida', () => {
    const r = resumirConversao(dados({ plano: [] }));
    assert.equal(r.impedido, true);
    assert.match(textos(r), /sem nenhuma conta a receber/);
});

test('valor zero impede', () => {
    const r = resumirConversao(dados({
        orcamento: { serial_number: 'X', total_amount: 0, items: [{ quantity: 1 }] },
        plano: [{ label: 'x', amount: 0, due: '2026-09-01' }],
    }));
    assert.equal(r.impedido, true);
    assert.match(textos(r), /valor zero/);
});

test('divergência de valor avisa mas NÃO impede — pode ser acerto combinado', () => {
    const r = resumirConversao(dados({
        plano: [{ label: 'Entrada', amount: 700, due: '2026-09-01' }],
    }));
    assert.equal(r.impedido, false);
    assert.equal(r.avisos.some(a => a.gravidade === 'erro'), true);
});

test('pedido sem peça avisa sem impedir', () => {
    const r = resumirConversao(dados({
        orcamento: { serial_number: 'X', total_amount: 1400, items: [] },
    }));
    assert.equal(r.pecas, 0);
    assert.equal(r.impedido, false);
    assert.match(textos(r), /ficha de produção sairia vazia/);
});

test('reconversão avisa que já houve um pedido antes', () => {
    const r = resumirConversao(dados({
        orcamento: {
            serial_number: 'ORC-9', total_amount: 1400, items: [{ quantity: 1 }],
            generated_order_number: '27',
        },
    }));
    assert.match(textos(r), /já gerou o pedido #27/);
});

test('o número do pedido é sempre dito, sem prometer reserva', () => {
    const t = textos(resumirConversao(dados()));
    assert.match(t, /nasce como #31/);
    assert.equal(/reservado/.test(t), false);
});

test('a falta de foto é informação, não erro', () => {
    const r = resumirConversao(dados({
        orcamento: { serial_number: 'X', total_amount: 1400, items: [{ quantity: 1 }], reference_photos: [] },
    }));
    const a = r.avisos.find(x => /Sem fotos/.test(x.texto));
    assert.equal(a?.gravidade, 'informacao');
});

test('avisos vêm classificados por gravidade', () => {
    const r = resumirConversao(dados({ plano: [] }));
    assert.ok(r.avisos.every(a => ['erro', 'atencao', 'informacao'].includes(a.gravidade)));
});
