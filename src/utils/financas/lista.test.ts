import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarContas, agruparParaLista, tituloDoDia, FILTROS_VAZIOS, FILTROS_A_VISTA, FILTROS_NO_PAINEL, contarFiltrosExtras, filtrosDaBusca, FILTROS_RAPIDOS, valorDaLinha } from './lista.ts';
import type { ContextoDaLista } from './lista.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
const conta = (id: string, c: Partial<ContaResumo>): ContaResumo => ({
    id, type: 'receivable', description: id, due_date: HOJE,
    original_amount: 100, remaining_amount: 100, derived_status: 'open', ...c,
});
const contas = [
    conta('venc', { due_date: '2026-09-24', client_id: 'sc' }),
    conta('ontem', { due_date: '2026-10-05', client_id: 'cv' }),
    conta('prod', { due_date: '2026-09-01', awaiting_delivery: true, client_id: 'sc' }),
    conta('hoje', { type: 'payable', supplier_id: 'fio', global_category_id: 'tec' }),
    conta('paga', { derived_status: 'paid', remaining_amount: 0, is_reconciled: false }),
    conta('cancel', { derived_status: 'cancelled' }),
];
const ctx: ContextoDaLista = {
    hoje: HOJE,
    contasPorObrigacao: { paga: ['itau'] },
    nomeDaParte: c => ({ sc: 'Escola Santa Clara', cv: 'Clínica Vida', fio: 'Malharia Fio Bom' } as Record<string, string>)[c.client_id ?? c.supplier_id ?? ''] ?? '',
    nomeDaCategoria: c => (c.global_category_id === 'tec' ? 'Tecido' : 'Sem categoria'),
};
const ids = (cs: ContaResumo[]) => cs.map(c => c.id);

test('padrão: abertas, sem as que aguardam entrega, por vencimento', () => {
    assert.deepEqual(ids(filtrarContas(contas, FILTROS_VAZIOS, ctx)), ['venc', 'ontem', 'hoje']);
});

test('recorte manda sobre o filtro rápido', () => {
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, recorte: 'receber_vencido', rapido: 'pagas' }, ctx)), ['venc', 'ontem']);
});

test('busca sem acento acha pelo cliente e mostra a que aguarda entrega', () => {
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, busca: 'santa clara' }, ctx)), ['prod', 'venc']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, busca: 'clinica' }, ctx)), ['ontem']);
});

test('filtro por cliente também mostra a que aguarda entrega', () => {
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, clienteId: 'sc' }, ctx)), ['prod', 'venc']);
});

test('pagas, não conferidas, canceladas, banco, categoria e tipo', () => {
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'pagas' }, ctx)), ['paga']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'nao_conferidas' }, ctx)), ['paga']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'canceladas' }, ctx)), ['cancel']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'todas', bancoId: 'itau' }, ctx)), ['paga']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, categoriaId: 'tec' }, ctx)), ['hoje']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, tipo: 'payable' }, ctx)), ['hoje']);
});

test('grupos por atraso e por dia', () => {
    const vencidas = filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'vencidas' }, ctx);
    // A data original vai junto: "há 12 dias" sozinho obrigava a contar no calendário (pedido do Luiz, 29/10).
    assert.deepEqual(agruparParaLista(vencidas, HOJE, true).map(g => g.titulo), ['venceu há 12 dias · qui 24/09', 'venceu ontem · seg 05/10']);
    assert.equal(tituloDoDia(HOJE, HOJE), 'Hoje · ter 06/10');
    assert.equal(tituloDoDia('2026-10-07', HOJE), 'Amanhã · qua 07/10');
    assert.equal(tituloDoDia('2026-10-08', HOJE), 'qui 08/10');
});

test('padrão "agora": vencidas e os próximos 7 dias; "abertas" inclui as de mais longe', () => {
    const comLonge = [...contas, conta('longe', { due_date: '2026-11-05' }), conta('em7', { due_date: '2026-10-12' }), conta('em8', { due_date: '2026-10-13' })];
    assert.equal(FILTROS_VAZIOS.rapido, 'agora');
    assert.deepEqual(ids(filtrarContas(comLonge, FILTROS_VAZIOS, ctx)), ['venc', 'ontem', 'hoje', 'em7']);
    assert.deepEqual(ids(filtrarContas(comLonge, { ...FILTROS_VAZIOS, rapido: 'abertas' }, ctx)), ['venc', 'ontem', 'hoje', 'em7', 'em8', 'longe']);
});

test('"não conferidas" só traz conta quitada: a parcial ainda vai receber mais', () => {
    const lista = [
        conta('quitada', { derived_status: 'paid', remaining_amount: 0, is_reconciled: false }),
        conta('parcial', { derived_status: 'partial', remaining_amount: 40, is_reconciled: false }),
    ];
    assert.deepEqual(ids(filtrarContas(lista, { ...FILTROS_VAZIOS, rapido: 'nao_conferidas' }, ctx)), ['quitada']);
});

test('à vista e no painel cobrem todos os filtros rápidos, sem repetir', () => {
    const todos = [...FILTROS_A_VISTA, ...FILTROS_NO_PAINEL];
    assert.equal(new Set(todos).size, todos.length);
    assert.deepEqual([...todos].sort(), [...FILTROS_RAPIDOS].sort());
    assert.deepEqual(FILTROS_A_VISTA, ['agora', 'abertas', 'vencidas', 'pagas']);
});

test('filtros vazios: nada a contar no painel', () => {
    assert.equal(contarFiltrosExtras(FILTROS_VAZIOS, false), 0);
});

test('conta cada filtro do painel que está ligado', () => {
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, tipo: 'payable', mes: '2026-10', clienteId: 'x' }, false), 3);
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, categoriaId: 'c', bancoId: 'b' }, true), 3);
});

test('filtro rápido do painel conta; o à vista não', () => {
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, rapido: 'canceladas' }, false), 1);
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, rapido: 'pagas' }, false), 0);
});

test('recorte e busca ficam fora do contador: têm o seu próprio lugar na tela', () => {
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, recorte: 'pagar_vencido', busca: 'abc' }, false), 0);
});

test('busca vinda de outra tela abre em Todas, para achar até conta paga ou futura', () => {
    assert.deepEqual(filtrosDaBusca('Pedido #123'), { busca: 'Pedido #123', rapido: 'todas', recorte: null });
    assert.deepEqual(filtrosDaBusca('   '), {});
});

test('banco: vale a conta prevista (em aberto, sem pagamento) e a conta onde o dinheiro passou', () => {
    const cs = [
        conta('prevista', { default_account_id: 'b1' }),
        conta('pagaNoB2', { derived_status: 'paid', remaining_amount: 0 }),
    ];
    const c2: ContextoDaLista = { ...ctx, contasPorObrigacao: { pagaNoB2: ['b2'] } };
    assert.deepEqual(ids(filtrarContas(cs, { ...FILTROS_VAZIOS, rapido: 'todas', bancoId: 'b1' }, c2)), ['prevista']);
    assert.deepEqual(ids(filtrarContas(cs, { ...FILTROS_VAZIOS, rapido: 'todas', bancoId: 'b2' }, c2)), ['pagaNoB2']);
});

test('clienteId também acha o fornecedor da conta a pagar', () => {
    const cs = [conta('pagar', { type: 'payable', supplier_id: 'f1' }), conta('outra', { client_id: 'c1' })];
    assert.deepEqual(ids(filtrarContas(cs, { ...FILTROS_VAZIOS, clienteId: 'f1' }, ctx)), ['pagar']);
});

test('tituloDoDia põe o ano quando o dia não é do ano de hoje', () => {
    assert.equal(tituloDoDia('2025-09-15', HOJE), 'seg 15/09/2025');
    assert.equal(tituloDoDia('2027-01-04', HOJE), 'seg 04/01/2027');
    assert.equal(tituloDoDia('2026-12-31', HOJE), 'qui 31/12');
});

test('valorDaLinha: o que falta; paga mostra o valor original', () => {
    assert.equal(valorDaLinha(conta('paga', { derived_status: 'paid', remaining_amount: 0, original_amount: 250 })), 250);
    assert.equal(valorDaLinha(conta('parcial', { original_amount: 250, remaining_amount: 90 })), 90);
    assert.equal(valorDaLinha(conta('aberta', { original_amount: 100, remaining_amount: 100 })), 100);
});
