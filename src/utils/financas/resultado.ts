/** Meta, margem e DRE do Resultado (spec S5 §4). Mesma base de caixa da cascata. */
import type { CaixaDoMes, LinhaDoRelatorio } from './caixa.ts';

const um = (n: number) => Math.round(n * 10) / 10;
const centavos = (n: number) => Math.round(n * 100) / 100;

export function metaDoPeriodo(realizado: number, metaMensal: number | null | undefined, meses: number) {
    const mensal = Number(metaMensal) || 0;
    if (mensal <= 0 || meses <= 0) return null;
    const meta = centavos(mensal * meses);
    const pct = um((realizado / meta) * 100);
    return { meta, pct, atingiu: realizado >= meta };
}

export function margemAbaixoDoAlvo(c: CaixaDoMes, alvoPct: number | null | undefined) {
    const alvo = Number(alvoPct) || 0;
    if (alvo <= 0 || !(c.entrou > 0) || c.percentualDaProducao === null) return null;
    return c.percentualDaProducao < alvo ? { margem: c.percentualDaProducao, alvo } : null;
}

export function linhasDoDre(c: CaixaDoMes): LinhaDoRelatorio[] {
    const pct = (v: number) => (c.entrou > 0 ? centavos((v / c.entrou) * 100) : 0);
    const liquida = centavos(c.entrou - c.impostos);
    const bruto = centavos(liquida - c.custoPecas);
    const operacional = centavos(bruto - c.despesas);
    const liquido = centavos(operacional - c.financeiras);
    return [
        { label: 'RECEITA BRUTA', value: c.entrou, level: 1, percent: 100 },
        { label: '(-) Impostos', value: c.impostos, level: 2, is_deduction: true, percent: pct(c.impostos) },
        { label: '(=) RECEITA LÍQUIDA', value: liquida, level: 1, is_total: true, percent: pct(liquida) },
        { label: '(-) Custo das peças (CPV)', value: c.custoPecas, level: 2, is_deduction: true, percent: pct(c.custoPecas) },
        { label: '(=) LUCRO BRUTO', value: bruto, level: 1, is_total: true, percent: pct(bruto) },
        { label: '(-) Despesas operacionais', value: c.despesas, level: 2, is_deduction: true, percent: pct(c.despesas) },
        { label: '(=) RESULTADO OPERACIONAL', value: operacional, level: 1, is_total: true, percent: pct(operacional) },
        { label: '(-) Despesas financeiras', value: c.financeiras, level: 2, is_deduction: true, percent: pct(c.financeiras) },
        { label: '(=) LUCRO LÍQUIDO', value: liquido, level: 1, is_total: true, percent: pct(liquido) },
    ];
}
