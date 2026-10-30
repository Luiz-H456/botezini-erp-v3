import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarFila, contadoresDoMenu, pedidosEmProducao, semanaDe } from './fila.ts';
import type { EntradaDaFila } from './fila.ts';

const HOJE = '2026-10-08';
const vazia: EntradaDaFila = {
    hoje: HOJE, orcamentos: [], pedidos: [], ultimoSetor: 'Expedição', faltaComprarNaSemana: null,
    clientesComVencido: 0, pagarVencido: { quantidade: 0, total: 0 }, bancosAConferir: [],
    saldosDivergentes: 0, saldosSemLinhaDeBase: 0, clientesSumidos: 0, produtosSemFicha: 0,
    caixaNegativoEm: null, dinheiro: v => `R$ ${v.toFixed(2)}`,
};

test('sem nada pendente, a fila vem vazia e o menu sem contador', () => {
    const blocos = montarFila(vazia);
    assert.deepEqual(blocos, []);
    assert.deepEqual(contadoresDoMenu(blocos), {
        vender: { n: 0, urgente: false }, producao: { n: 0, urgente: false },
        planejar: { n: 0, urgente: false }, dinheiro: { n: 0, urgente: false },
        cadastros: { n: 0, urgente: false },
    });
});

test('linha com zero some e bloco vazio some', () => {
    const blocos = montarFila({ ...vazia, clientesSumidos: 2 });
    assert.deepEqual(blocos.map(b => b.objetivo), ['vender']);
    assert.equal(blocos[0].linhas.length, 1);
    assert.match(blocos[0].linhas[0].texto, /2 clientes/);
});

test('blocos na ordem do menu; urgente primeiro dentro do bloco', () => {
    const blocos = montarFila({
        ...vazia,
        pedidos: [
            { id: 'p1', order_number: '1', deadline: '2026-10-01', status: 'Em Produção', production_stage: 'Costura' },
            { id: 'p2', order_number: '2', deadline: '2026-12-01', status: 'Em Produção', production_stage: 'Expedição' },
        ],
        faltaComprarNaSemana: 2,
        orcamentos: [{ id: 'o1', serial_number: 'ORC-1', date: '2026-09-20', status: 'Sent' }],
        clientesComVencido: 3,
    });
    assert.deepEqual(blocos.map(b => b.objetivo), ['vender', 'producao', 'planejar', 'dinheiro']);
    const producao = blocos.find(b => b.objetivo === 'producao')!;
    assert.equal(producao.linhas[0].acao, 'Destravar');
    assert.equal(producao.linhas[0].urgente, true);
    assert.equal(producao.linhas[1].acao, 'Confirmar entrega');
});

test('confirmar entrega conta só pedidos ativos no último setor', () => {
    const blocos = montarFila({
        ...vazia,
        pedidos: [
            { id: 'a', deadline: '2026-12-01', status: 'Em Produção', production_stage: 'Expedição' },
            { id: 'b', deadline: '2026-12-01', status: 'Entregue', production_stage: 'Expedição' },
            { id: 'c', deadline: '2026-12-01', status: 'Pendente', production_stage: 'Corte' },
        ],
    });
    const linha = blocos[0].linhas.find(l => l.acao === 'Confirmar entrega')!;
    assert.equal(linha.quantidade, 1);
    assert.deepEqual(linha.destino, { view: 'quadro', destaque: 'ultimo-setor' });
});

test('o bloco do dinheiro só tem linhas de fontes reais (sem a antiga "fecha em"/"Atenção")', () => {
    const blocos = montarFila({
        ...vazia,
        clientesComVencido: 1, pagarVencido: { quantidade: 2, total: 150 },
        bancosAConferir: [{ id: 'b1', nome: 'Botezini', quantidade: 3 }],
        saldosDivergentes: 1, saldosSemLinhaDeBase: 1,
        caixaNegativoEm: { data: '2026-10-20', saldo: -50 },
    });
    const linhas = blocos.find(b => b.objetivo === 'dinheiro')!.linhas;
    assert.deepEqual(linhas.map(l => l.acao).sort(), ['Ajustar', 'Cobrar', 'Conferir', 'Conferir', 'Pagar', 'Ver projeção']);
    assert.ok(linhas.every(l => l.quantidade > 0 && !/fecha em/.test(l.texto)));
});

test('uma linha de conferência por banco com pendência', () => {
    const blocos = montarFila({ ...vazia, bancosAConferir: [
        { id: 'b1', nome: 'Botezini', quantidade: 3 }, { id: 'b2', nome: 'Sueli', quantidade: 0 },
    ] });
    const conferir = blocos[0].linhas.filter(l => l.acao === 'Conferir');
    assert.equal(conferir.length, 1);
    assert.deepEqual(conferir[0].destino, { view: 'finance', conferirBanco: 'b1' });
});

test('Retomar conta a fila de follow-up sem os recentes (a mesma lista do destino)', () => {
    const blocos = montarFila({ ...vazia, orcamentos: [
        { id: 'a', date: '2026-09-01', sent_at: '2026-10-01', status: 'Sent' },  // parado há 7 dias
        { id: 'b', date: '2026-09-01', sent_at: '2026-10-07', status: 'Sent' },  // enviado ontem: recente
        { id: 'c', date: '2026-09-01', status: 'Draft' },
    ] });
    const linha = blocos[0].linhas.find(l => l.acao === 'Retomar')!;
    assert.equal(linha.quantidade, 1);
    assert.equal(linha.texto, 'Retomar 1 orçamento parado');
    assert.deepEqual(linha.destino, { view: 'budgets', status: 'Sent' });
});

test('pede compra pelo que falta para os pedidos da semana, não pelo mínimo do estoque', () => {
    const linhas = montarFila({
        ...vazia, faltaComprarNaSemana: 3,
    }).flatMap(b => b.linhas);
    const l = linhas.find(x => x.acao === 'Comprar');
    assert.equal(l?.texto, 'Comprar 3 insumos para os pedidos desta semana');
    assert.deepEqual(l?.destino, { view: 'compras', filtro: 'this_week' }); // a lista abre na mesma semana que a linha contou
    assert.equal(linhas.some(x => /abaixo do mínimo|consumo não apurado/i.test(x.texto)), false);
});

test('falta de compra não calculada (null) ou zero: nenhuma linha de compra', () => {
    for (const falta of [null, 0]) {
        const linhas = montarFila({ ...vazia, faltaComprarNaSemana: falta }).flatMap(b => b.linhas);
        assert.equal(linhas.some(x => x.acao === 'Comprar'), false);
    }
    assert.equal(montarFila({ ...vazia, faltaComprarNaSemana: 1 })[0].linhas[0].texto,
        'Comprar 1 insumo para os pedidos desta semana');
});

test('saldo bancário: as duas linhas no Dinheiro → bancos; nenhuma com zero; nunca "sincronizar"', () => {
    assert.deepEqual(montarFila({ ...vazia, saldosDivergentes: 0, saldosSemLinhaDeBase: 0 }), []);

    const um = montarFila({ ...vazia, saldosDivergentes: 1, saldosSemLinhaDeBase: 1 })[0];
    assert.equal(um.objetivo, 'dinheiro');
    assert.deepEqual(um.linhas.map(l => [l.acao, l.texto, l.urgente]), [
        ['Conferir', 'Conferir saldo: 1 conta não bate', true],
        ['Ajustar', '1 conta sem saldo de partida', false],
    ]);
    assert.ok(um.linhas.every(l => l.destino.view === 'bancos' && Object.keys(l.destino).length === 1));

    const varias = montarFila({ ...vazia, saldosDivergentes: 2, saldosSemLinhaDeBase: 3 })[0];
    assert.deepEqual(varias.linhas.map(l => l.texto), ['Conferir saldo: 2 contas não batem', '3 contas sem saldo de partida']);
    assert.ok(varias.linhas.every(l => !/sincroniz/i.test(l.texto)));
});

test('contador do menu: soma das linhas e urgente se alguma for', () => {
    const blocos = montarFila({ ...vazia, clientesComVencido: 2, pagarVencido: { quantidade: 4, total: 900 },
        bancosAConferir: [{ id: 'b1', nome: 'Botezini', quantidade: 1 }] });
    assert.deepEqual(contadoresDoMenu(blocos).dinheiro, { n: 3, urgente: true });
});

test('pedidos em produção: Pendente ou Em Produção', () => {
    assert.equal(pedidosEmProducao([
        { id: '1', status: 'Pendente' }, { id: '2', status: 'Em Produção' }, { id: '3', status: 'Entregue' },
    ]), 2);
});

test('Retomar clientes sumidos em Vender, abre Clientes com os dormentes', () => {
    const [b] = montarFila({ ...vazia, clientesSumidos: 2 });
    assert.equal(b.objetivo, 'vender');
    assert.deepEqual(b.linhas.map(l => [l.texto, l.urgente]), [['Retomar 2 clientes sumidos', false]]);
    assert.deepEqual(b.linhas[0].destino, { view: 'clientes', dormentes: true });
    assert.equal(montarFila({ ...vazia, clientesSumidos: 1 })[0].linhas[0].texto, 'Retomar 1 cliente sumido');
});

test('ficha técnica em Cadastros, último bloco, e conta no menu', () => {
    const blocos = montarFila({ ...vazia, produtosSemFicha: 3, faltaComprarNaSemana: 1 });
    assert.deepEqual(blocos.map(b => b.objetivo), ['planejar', 'cadastros']);
    assert.equal(blocos[1].rotulo, 'Cadastros');
    const l = blocos[1].linhas[0];
    assert.equal(l.texto, 'Cadastrar ficha técnica: 3 produtos');
    assert.equal(l.urgente, false);
    assert.deepEqual(l.destino, { view: 'produtos', completude: true });
    assert.deepEqual(contadoresDoMenu(blocos).cadastros, { n: 1, urgente: false });
    assert.equal(montarFila({ ...vazia, produtosSemFicha: 1 })[0].linhas[0].texto, 'Cadastrar ficha técnica: 1 produto');
});

test('caixa que fica negativo vira linha urgente de Dinheiro, com data e valor', () => {
    const blocos = montarFila({ ...vazia, caixaNegativoEm: { data: '2026-10-20', saldo: -1234.5 } });
    const linha = blocos.flatMap(b => b.linhas).find(l => l.destino.view === 'saude-caixa');
    assert.ok(linha);
    assert.equal(linha.urgente, true);
    assert.match(linha.texto, /Caixa fica negativo em 20\/10/);
    assert.deepEqual(linha.destino, { view: 'saude-caixa', mes: '2026-10' });
});

test('sem negativo previsto, não há linha de caixa', () => {
    const blocos = montarFila({ ...vazia, caixaNegativoEm: null });
    assert.equal(blocos.flatMap(b => b.linhas).some(l => l.destino.view === 'saude-caixa'), false);
});

test('fila vazia não gera nenhum contador', () => {
    const c = contadoresDoMenu(montarFila(vazia));
    assert.ok(Object.values(c).every(v => v.n === 0 && !v.urgente));
});

test('"1 pedido" no singular', () => {
    const [b] = montarFila({ ...vazia, pedidos: [{ id: 'a', deadline: '2026-10-01', status: 'Em Produção', production_stage: 'Corte' }] });
    assert.equal(b.linhas[0].texto, 'Destravar 1 pedido com prazo estourado');
});

test('setor com espaço sobrando casa com o último setor', () => {
    const blocos = montarFila({ ...vazia, ultimoSetor: ' Expedição ', pedidos: [
        { id: 'a', deadline: '2026-12-01', status: 'Em Produção', production_stage: 'Expedição  ' },
    ] });
    assert.equal(blocos[0].linhas.find(l => l.acao === 'Confirmar entrega')?.quantidade, 1);
});

test('id da linha é estável (não depende da ordem) e desempata pelo destino', () => {
    const bancos = (ids: string[]) => montarFila({ ...vazia, bancosAConferir: ids.map(id => ({ id, nome: `Banco ${id}`, quantidade: 1 })) })[0].linhas;
    const [x, y] = bancos(['1', '2']);
    assert.equal(x.id, 'dinheiro-Conferir-finance');
    assert.notEqual(x.id, y.id);
    assert.equal(montarFila({ ...vazia, faltaComprarNaSemana: 1 })[0].linhas[0].id, 'planejar-Comprar-compras');
});

test('semana de segunda a domingo, em data local', () => {
    assert.deepEqual(semanaDe('2026-10-14'), { inicio: '2026-10-12', fim: '2026-10-18' }); // quarta
    assert.deepEqual(semanaDe('2026-10-12'), { inicio: '2026-10-12', fim: '2026-10-18' }); // segunda
    assert.deepEqual(semanaDe('2026-10-18'), { inicio: '2026-10-12', fim: '2026-10-18' }); // domingo
    assert.deepEqual(semanaDe('2026-11-01'), { inicio: '2026-10-26', fim: '2026-11-01' }); // vira o mês
});

test('tecidos usados em pedidos sem preco: linha em Cadastros, nao urgente, leva aos insumos de tecido nas Tabelas de custo', () => {
    const blocos = montarFila({ ...vazia, tecidosSemPreco: 3 });
    assert.deepEqual(blocos.map(b => b.objetivo), ['cadastros']);
    const l = blocos[0].linhas[0];
    assert.equal(l.texto, 'Definir preço: 3 tecidos usados em pedidos');
    assert.equal(l.urgente, false);
    assert.deepEqual(l.destino, { view: 'tabelas', busca: 'tecido', semPreco: true });
    assert.equal(montarFila({ ...vazia, tecidosSemPreco: 1 })[0].linhas[0].texto, 'Definir preço: 1 tecido usado em pedidos');
});

test('sem a conta dos tecidos (null ou ausente) nao ha linha: o Inicio nunca afirma o que nao calculou', () => {
    assert.deepEqual(montarFila({ ...vazia, tecidosSemPreco: null }), []);
    assert.deepEqual(montarFila({ ...vazia, tecidosSemPreco: 0 }), []);
});

test('rascunho de orçamento parado há mais de 7 dias vira linha "Enviar" em Vender (auditoria R8)', () => {
    const orcamentos = [
        { id: 'r1', status: 'Draft', date: '2026-09-28' },
        { id: 'r2', status: 'Draft', date: '2026-09-30' },
        { id: 'r3', status: 'Draft', date: '2026-10-05' },   // 3 dias: ainda é trabalho em andamento
        { id: 's1', status: 'Sent', date: '2026-09-01' },
    ];
    const linha = montarFila({ ...vazia, orcamentos }).flatMap(b => b.linhas).find(l => l.acao === 'Enviar');
    assert.equal(linha?.quantidade, 2);
    assert.match(linha!.texto, /2 rascunhos parados/);
    assert.deepEqual(linha?.destino, { view: 'budgets', status: 'Draft' });
});

test('rascunho com mais de 60 dias é abandonado, não parado: não entra no aviso', () => {
    const orcamentos = [{ id: 'v', status: 'Draft', date: '2026-07-01' }, { id: 'p', status: 'Draft', date: '2026-09-20' }];
    const linha = montarFila({ ...vazia, orcamentos }).flatMap(b => b.linhas).find(l => l.acao === 'Enviar');
    assert.equal(linha?.quantidade, 1);
});
