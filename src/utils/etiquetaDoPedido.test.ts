import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaDoPedido, avisoDePrazo, rotuloDaEtapa } from './etiquetaDoPedido.ts';

const HOJE = '2026-08-25';

// ─── a etiqueta diz o setor, não a categoria ─────────────────────────────────

test('pedido em produção mostra o SETOR, não "produção"', () => {
    const e = etiquetaDoPedido({ status: 'Em Produção', production_stage: 'Costura' });
    assert.equal(e.texto, 'COSTURA');
    assert.equal(e.tom, 'producao');
});

test('dois pedidos em etapas diferentes deixam de ter a mesma etiqueta', () => {
    const corte = etiquetaDoPedido({ status: 'Em Produção', production_stage: 'Corte' });
    const acabamento = etiquetaDoPedido({ status: 'Em Produção', production_stage: 'Finalização' });
    assert.notEqual(corte.texto, acabamento.texto);
});

test('em produção sem setor gravado ainda diz produção, sem inventar etapa', () => {
    const e = etiquetaDoPedido({ status: 'Em Produção', production_stage: null });
    assert.equal(e.texto, 'PRODUÇÃO');
    assert.match(e.detalhe, /sem setor/);
});

test('entregue continua entregue', () => {
    const e = etiquetaDoPedido({ status: 'Entregue', production_stage: 'Costura' });
    assert.equal(e.texto, 'ENTREGUE');
    assert.equal(e.tom, 'entregue');
});

test('pendente vira NA FILA — recém-convertido não é problema a resolver', () => {
    const e = etiquetaDoPedido({ status: 'Pendente' });
    assert.equal(e.texto, 'NA FILA');
    assert.equal(e.tom, 'neutro');
});

// ─── a pílula vazia ──────────────────────────────────────────────────────────

test('status desconhecido mostra o valor cru, nunca pílula vazia', () => {
    const e = etiquetaDoPedido({ status: 'Cancelado' });
    assert.equal(e.texto, 'CANCELADO');
    assert.equal(e.tom, 'desconhecido');
    assert.match(e.detalhe, /não reconhecido/);
});

test('status ausente é sinalizado, não silenciado', () => {
    assert.equal(etiquetaDoPedido({ status: '' }).texto, 'SEM STATUS');
    assert.equal(etiquetaDoPedido({}).texto, 'SEM STATUS');
    assert.equal(etiquetaDoPedido({ status: null }).tom, 'desconhecido');
});

test('nenhuma situação produz texto vazio', () => {
    const casos = [{}, { status: '' }, { status: 'xpto' }, { status: 'Pendente' },
        { status: 'Em Produção' }, { status: 'Entregue' }, { status: 'Concluído' }];
    for (const c of casos) assert.ok(etiquetaDoPedido(c).texto.length > 0, JSON.stringify(c));
});

test('acento e caixa não mudam o reconhecimento', () => {
    assert.equal(etiquetaDoPedido({ status: 'EM PRODUCAO', production_stage: 'corte' }).texto, 'CORTE');
    assert.equal(etiquetaDoPedido({ status: 'entregue' }).texto, 'ENTREGUE');
});

// ─── nomes de setor livres ───────────────────────────────────────────────────

test('setor cadastrado pela fábrica volta como está, em maiúscula', () => {
    assert.equal(rotuloDaEtapa('Serigrafia Manual'), 'SERIGRAFIA MANUAL');
});

test('sinônimos comuns caem no rótulo certo', () => {
    assert.equal(rotuloDaEtapa('Bordado'), 'PERSONALIZAÇÃO');
    assert.equal(rotuloDaEtapa('Silk'), 'PERSONALIZAÇÃO');
    assert.equal(rotuloDaEtapa('Expedição'), 'EXPEDIÇÃO');
    assert.equal(rotuloDaEtapa('Acabamento'), 'FINALIZAÇÃO');
});

test('etapa vazia não vira rótulo', () => {
    assert.equal(rotuloDaEtapa(''), null);
    assert.equal(rotuloDaEtapa(null), null);
});

// ─── o prazo, separado da etapa ──────────────────────────────────────────────

test('prazo estourado vira aviso próprio, sem apagar a etapa', () => {
    const pedido = { status: 'Em Produção', production_stage: 'Costura', deadline: '2026-08-18' };
    assert.equal(etiquetaDoPedido(pedido).texto, 'COSTURA');
    const aviso = avisoDePrazo(pedido, HOJE);
    assert.equal(aviso?.atraso, 7);
    assert.equal(aviso?.texto, '7 DIAS DE ATRASO');
});

test('um dia de atraso fala no singular', () => {
    const a = avisoDePrazo({ status: 'Pendente', deadline: '2026-08-24' }, HOJE);
    assert.equal(a?.texto, '1 DIA DE ATRASO');
});

test('vence hoje avisa sem acusar atraso', () => {
    const a = avisoDePrazo({ status: 'Pendente', deadline: HOJE }, HOJE);
    assert.equal(a?.atraso, 0);
    assert.equal(a?.apertado, true);
    assert.equal(a?.texto, 'VENCE HOJE');
});

test('vence amanhã também avisa', () => {
    assert.equal(avisoDePrazo({ status: 'Pendente', deadline: '2026-08-26' }, HOJE)?.texto, 'VENCE AMANHÃ');
});

test('prazo folgado não gera aviso nenhum', () => {
    assert.equal(avisoDePrazo({ status: 'Pendente', deadline: '2026-09-30' }, HOJE), null);
});

test('pedido entregue não recebe aviso de prazo, mesmo entregue atrasado', () => {
    assert.equal(avisoDePrazo({ status: 'Entregue', deadline: '2026-01-01' }, HOJE), null);
});

test('pedido sem prazo não gera aviso', () => {
    assert.equal(avisoDePrazo({ status: 'Pendente' }, HOJE), null);
    assert.equal(avisoDePrazo({ status: 'Pendente', deadline: '' }, HOJE), null);
});

test('atraso atravessa a virada do mês corretamente', () => {
    assert.equal(avisoDePrazo({ status: 'Pendente', deadline: '2026-07-31' }, HOJE)?.atraso, 25);
});
