/**
 * Caixa do mês: o dinheiro que de fato entrou e saiu, pela data do pagamento.
 *
 * O mapeamento de categoria para linha é o mesmo do DRE antigo
 * (o painel velho, já removido): impostos pelo nome; custo das peças pela marca
 * `custo_do_produto` ou pelo nome "matéria-prima"; financeiras por "tarifas
 * bancárias", "juros" ou "financeir". O que muda é a data: o DRE antigo somava
 * contas por vencimento; aqui soma pagamentos por `payment_date`.
 *
 * Estorno é uma linha nova com `reversal_of`: conta negativa no mês em que foi
 * feito. Lançamento informativo (`affects_balance = false`) não é caixa.
 */
import { normalizeCategoryName } from '../categoryResolver.ts';
import { centavos } from './base.ts';
import type { CategoriaResumo, ContaResumo, PagamentoResumo } from './base.ts';

export type LinhaDeSaida = 'impostos' | 'custo_pecas' | 'despesas' | 'financeiras';

export function nomeDaCategoria(c: ContaResumo, categorias: Map<string, CategoriaResumo>, padrao = 'Sem categoria'): string {
    const global = c.global_category_id ? categorias.get(c.global_category_id) : undefined;
    return global?.name ?? (c.category?.trim() || padrao);
}

export function classificarSaida(c: ContaResumo, categorias: Map<string, CategoriaResumo>): LinhaDeSaida {
    const nome = normalizeCategoryName(nomeDaCategoria(c, categorias, ''));
    if (nome.includes('imposto')) return 'impostos';
    // Conta antiga só tem o nome em texto: procura a categoria global de mesmo nome para ler a marca.
    const global = c.global_category_id
        ? categorias.get(c.global_category_id)
        : [...categorias.values()].find(k => normalizeCategoryName(k.name) === nome);
    if (global?.custo_do_produto || nome.includes('materia prima')) return 'custo_pecas';
    if (nome.includes('tarifas bancarias') || nome.includes('juros') || nome.includes('financeir')) return 'financeiras';
    return 'despesas';
}

export function valorDeCaixa(p: PagamentoResumo): number {
    if (p.affects_balance === false) return 0;
    return p.reversal_of ? -p.amount : p.amount;
}

export interface FatiaDeCategoria { nome: string; valor: number }

export interface CaixaDoMes {
    entrou: number;
    impostos: number;
    custoPecas: number;
    sobrouDaProducao: number;
    percentualDaProducao: number | null;
    despesas: number;
    financeiras: number;
    lucro: number;
    porCategoria: FatiaDeCategoria[];
}

const MAX_FATIAS = 6;

export function caixaDoPeriodo(e: {
    pagamentos: PagamentoResumo[]; contas: ContaResumo[]; categorias: CategoriaResumo[]; meses: string[];
}): CaixaDoMes {
    const noPeriodo = new Set(e.meses);
    const contaPorId = new Map(e.contas.map(c => [c.id, c]));
    const categorias = new Map(e.categorias.map(c => [c.id, c]));
    const soma = { entrou: 0, impostos: 0, custo_pecas: 0, despesas: 0, financeiras: 0 };
    const porNome = new Map<string, number>();

    for (const p of e.pagamentos) {
        if (!noPeriodo.has(p.payment_date.slice(0, 7))) continue;
        const conta = contaPorId.get(p.obligation_id);
        if (!conta) continue;
        const valor = valorDeCaixa(p);
        if (valor === 0) continue;
        if (conta.type === 'receivable') { soma.entrou += valor; continue; }
        soma[classificarSaida(conta, categorias)] += valor;
        const nome = nomeDaCategoria(conta, categorias);
        porNome.set(nome, (porNome.get(nome) ?? 0) + valor);
    }

    const entrou = centavos(soma.entrou);
    const sobrou = centavos(soma.entrou - soma.impostos - soma.custo_pecas);
    const fatias = [...porNome]
        .map(([nome, valor]) => ({ nome, valor: centavos(valor) }))
        .filter(f => f.valor > 0)
        .sort((a, b) => b.valor - a.valor);
    const porCategoria = fatias.length > MAX_FATIAS
        ? [...fatias.slice(0, MAX_FATIAS),
            { nome: 'Outros', valor: centavos(fatias.slice(MAX_FATIAS).reduce((s, f) => s + f.valor, 0)) }]
        : fatias;

    return {
        entrou,
        impostos: centavos(soma.impostos),
        custoPecas: centavos(soma.custo_pecas),
        sobrouDaProducao: sobrou,
        percentualDaProducao: entrou > 0 ? centavos((sobrou / entrou) * 100) : null,
        despesas: centavos(soma.despesas),
        financeiras: centavos(soma.financeiras),
        lucro: centavos(sobrou - soma.despesas - soma.financeiras),
        porCategoria,
    };
}

/** Variação percentual sobre o mês anterior; null quando não há base. */
export function variacao(atual: number, anterior: number): number | null {
    if (anterior === 0) return null;
    return centavos(((atual - anterior) / Math.abs(anterior)) * 100);
}

/** Mesmo formato de DRELine, para o `pdfService.generateExecutiveReport` de hoje. */
export interface LinhaDoRelatorio {
    label: string; value: number; level: number; percent?: number; is_deduction?: boolean; is_total?: boolean;
}

export function linhasDoRelatorio(c: CaixaDoMes): LinhaDoRelatorio[] {
    const pct = (v: number) => (c.entrou > 0 ? centavos((v / c.entrou) * 100) : 0);
    return [
        { label: 'ENTROU', value: c.entrou, level: 1, percent: 100 },
        { label: '(-) Impostos', value: c.impostos, level: 2, is_deduction: true, percent: pct(c.impostos) },
        { label: '(-) Custo das peças', value: c.custoPecas, level: 2, is_deduction: true, percent: pct(c.custoPecas) },
        { label: '(=) SOBROU DA PRODUÇÃO', value: c.sobrouDaProducao, level: 1, is_total: true, percent: pct(c.sobrouDaProducao) },
        { label: '(-) Despesas da empresa', value: c.despesas, level: 2, is_deduction: true, percent: pct(c.despesas) },
        { label: '(-) Juros e tarifas', value: c.financeiras, level: 2, is_deduction: true, percent: pct(c.financeiras) },
        { label: '(=) LUCRO DE CAIXA', value: c.lucro, level: 1, is_total: true, percent: pct(c.lucro) },
    ];
}
