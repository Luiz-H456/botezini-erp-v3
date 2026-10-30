import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaDeContas } from './planilhaDeContas.ts';
import type { ContaResumo } from './base.ts';

const conta = (o: Partial<ContaResumo>): ContaResumo => ({
    id: 'x', type: 'payable', description: 'Aluguel', due_date: '2026-10-05', original_amount: 1500, remaining_amount: 1500, derived_status: 'open', ...o,
});

test('planilha: cabeçalho, ponto e vírgula, vírgula decimal e data dd/mm/aaaa', () => {
    const csv = planilhaDeContas([conta({})], { nomeDaParte: () => 'Imobiliária', nomeDaCategoria: () => 'Aluguel', hoje: '2026-10-29' });
    const [cab, linha] = csv.replace(/^﻿/, '').split('\r\n');
    assert.equal(cab, 'Vencimento;Descrição;Quem;Categoria;Tipo;Valor;Falta;Situação');
    assert.equal(linha, '05/10/2026;Aluguel;Imobiliária;Aluguel;A pagar;1500,00;1500,00;Vencida');
});

test('planilha: texto com ponto e vírgula ou aspas vai entre aspas (não quebra a coluna)', () => {
    const csv = planilhaDeContas([conta({ description: 'Fatura "ABC"; parcela 2' })], { nomeDaParte: () => '', nomeDaCategoria: () => '', hoje: '2026-10-29' });
    assert.match(csv, /"Fatura ""ABC""; parcela 2"/);
});

test('planilha: começa com BOM, para o Excel ler os acentos', () => {
    assert.ok(planilhaDeContas([], { nomeDaParte: () => '', nomeDaCategoria: () => '', hoje: '2026-10-29' }).startsWith('﻿'));
});
