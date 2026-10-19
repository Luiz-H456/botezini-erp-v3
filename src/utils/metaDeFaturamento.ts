/**
 * Meta de faturamento sugerida: quanto vender por mês para pagar o fixo e ainda
 * sobrar a margem alvo. Spec do S2, seção 5.2.
 */
import { getTodayStr } from './date.ts';
import { montarItensVendidos } from './itensVendidos.ts';
import type { PedidoVendido, OrcamentoRef } from './itensVendidos.ts';
import { baseDoEquilibrio } from './saudeDoCaixa.ts';
import type { BaseDoEquilibrio, ContaParaEquilibrio, Natureza } from './saudeDoCaixa.ts';

export interface MetaSugerida {
    /** null = sem sugestão; o porquê está em `motivo`. */
    valor: number | null;
    motivo: string | null;
    custoFixoMedio: number;
    /** Índice de margem de contribuição, em %, medido só nas vendas com custo conhecido. */
    margemDeContribuicaoPct: number | null;
    margemAlvoPct: number;
    /** Quanto do faturamento tem custo cadastrado no produto, em %. */
    coberturaPct: number;
    /** Cobertura abaixo de COBERTURA_MINIMA: a margem foi medida numa amostra pequena. */
    fraca: boolean;
}

/** Abaixo disto o custo é chute na maioria das vendas (mesmo corte da Completude). */
export const COBERTURA_MINIMA = 30;

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Os `n` meses fechados antes do mês de `hoje`, do mais recente para o mais antigo. */
export function ultimosMesesFechados(hoje: string, n = 3): { de: string; ate: string }[] {
    let ano = Number(hoje.slice(0, 4));
    let mes = Number(hoje.slice(5, 7));
    const saida: { de: string; ate: string }[] = [];
    for (let i = 0; i < n; i++) {
        mes -= 1;
        if (mes === 0) { mes = 12; ano -= 1; }
        saida.push({ de: `${ano}-${doisDigitos(mes)}-01`, ate: `${ano}-${doisDigitos(mes)}-${doisDigitos(ultimoDia(ano, mes))}` });
    }
    return saida;
}

const pct = (v: number) => String(v).replace('.', ',');

export function metaSugerida(bases: BaseDoEquilibrio[], margemAlvoPct: number): MetaSugerida {
    const meses = bases.length || 1;
    let receita = 0, semCusto = 0, custoVar = 0, fixo = 0;
    for (const b of bases) {
        receita += b.receita;
        semCusto += b.receitaSemCustoConhecido;
        custoVar += b.custoVariavelDasVendas;
        fixo += b.despesasFixas.filter(s => s.natureza === 'fixo').reduce((t, s) => t + s.valor, 0);
    }
    const comCusto = receita - semCusto;
    const custoFixoMedio = Math.round((fixo / meses) * 100) / 100;
    const cobertura = receita > 0 ? (comCusto / receita) * 100 : 0;
    // O corte usa o valor cheio: 29,6% arredonda para 30% na tela mas ainda é amostra fraca.
    const base = { custoFixoMedio, margemAlvoPct, coberturaPct: Math.round(cobertura), fraca: cobertura < COBERTURA_MINIMA };

    if (comCusto <= 0) {
        return { ...base, valor: null, margemDeContribuicaoPct: null,
            motivo: 'cadastre o custo das peças (Produtos › Calcular preço) para a sugestão aparecer' };
    }
    const mc = ((comCusto - custoVar) / comCusto) * 100;
    const mcPct = Math.round(mc * 10) / 10;
    if (custoFixoMedio <= 0) {
        return { ...base, valor: null, margemDeContribuicaoPct: mcPct,
            motivo: 'nenhuma despesa marcada como fixa nos últimos 3 meses — marque as fixas em Cadastros › Categorias' };
    }
    if (mc <= margemAlvoPct) {
        return { ...base, valor: null, margemDeContribuicaoPct: mcPct,
            motivo: `a margem das peças (${pct(mcPct)}%) não chega à margem alvo (${pct(margemAlvoPct)}%) — nenhum faturamento resolve; revise preço ou margem alvo` };
    }
    // Arredonda aos centavos antes do teto: 21000 ÷ 0,35 dá 60000,00000000001 em ponto flutuante e viraria 61.000.
    const valor = Math.ceil(Math.round(custoFixoMedio / ((mc - margemAlvoPct) / 100) * 100) / 100 / 1000) * 1000;
    return { ...base, valor, margemDeContribuicaoPct: mcPct, motivo: null };
}

/** O que a sugestão lê do banco — o Fichário já carrega tudo isto e passa pronto. */
export interface DadosDaMeta {
    obrigacoes: ContaParaEquilibrio[];
    categorias: { id: string; name: string; natureza?: Natureza | null }[];
    pedidos: PedidoVendido[];
    orcamentos: OrcamentoRef[];
    clientes: { id: string; company_name: string }[];
    produtos: { name: string; average_unit_cost?: number | null }[];
}

/** A mesma leitura da Saúde do caixa, para os 3 meses fechados antes de `hoje`. */
export function calcularMetaSugerida(d: DadosDaMeta, margemAlvoPct: number, hoje = getTodayStr()): MetaSugerida {
    const nomeCliente = new Map(d.clientes.map(c => [c.id, c.company_name]));
    const vendas = montarItensVendidos(d.pedidos, d.orcamentos, id => (id && nomeCliente.get(id)) || '—');
    const custos = new Map<string, number>(d.produtos
        .filter(p => Number(p.average_unit_cost) > 0)
        .map(p => [p.name, Number(p.average_unit_cost)]));
    const naturezaPorCategoriaId = new Map<string, Natureza | undefined>(d.categorias.map(c => [c.id, c.natureza || undefined]));
    const nomePorCategoriaId = new Map<string, string>(d.categorias.map(c => [c.id, c.name]));
    const bases = ultimosMesesFechados(hoje).map(({ de, ate }) => baseDoEquilibrio({
        vendas, custos, obrigacoes: d.obrigacoes, naturezaPorCategoriaId, nomePorCategoriaId, de, ate,
    }));
    return metaSugerida(bases, margemAlvoPct);
}
