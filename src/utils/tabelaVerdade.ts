/**
 * Tabela verdade de tecidos (v3.1, spec 2026-10-29): o preço que o fornecedor cobra hoje,
 * por faixa de cor e condição de pagamento, mais o frete — o "custo de referência".
 *
 * PREVER × APURAR. Orçamento, custo da peça e a sugestão da compra usam esta referência;
 * o lucro do pedido usa o que foi pago e só cai aqui sem compra vinculada (lucroPorPedido).
 *
 * AUSÊNCIA É INFORMAÇÃO (como custoDaPeca): o que falta vira pendência, nunca zero. Faixa
 * sem preço devolve valor null para o consumidor cair na próxima origem.
 *
 * Condições e frete moram sempre na linha: "usa o do fornecedor" é uma cópia mantida pelo
 * banco (_sincronizar_comercial_da_linha). Por isso aqui só se olha a linha.
 *
 * Sem import do app, para testar com node --test.
 */

export type ModoFrete = 'cif' | 'por_kg' | 'fixo' | 'cotacao';
export interface TVLinha { id: string; fornecedor_id: string; nome: string; ordem: number; usa_frete_do_fornecedor: boolean; usa_condicoes_do_fornecedor: boolean }
export interface TVCondicao { id: string; fornecedor_id: string; linha_id: string | null; nome: string; ordem: number; padrao: boolean; ativa: boolean }
export interface TVFrete { fornecedor_id: string; linha_id: string | null; modo: ModoFrete; valor: number | null; remessa_tipica_kg: number | null }
export interface TVTipo { id: string; linha_id: string; nome: string; unidade: 'kg' | 'm'; rendimento_m_por_kg: number | null; composicao: string | null; ordem: number }
export interface TVFaixa { id: string; tipo_id: string; nome: string; ordem: number; insumo_id: string }
export interface TVPreco { faixa_id: string; condicao_id: string; vale_desde: string; valor: number; origem: 'tabela' | 'importado_da_compra' }
export interface TVCor { nome: string; hex: string; faixa_id: string }
/** `cores` é opcional: a conta não precisa dela; as telas (cartão e editor) sim. */
export interface Catalogo { linhas: TVLinha[]; condicoes: TVCondicao[]; fretes: TVFrete[]; tipos: TVTipo[]; faixas: TVFaixa[]; precos: TVPreco[]; cores?: TVCor[] }

export type Pendencia =
    | 'faixa sem preço' | 'frete a cotar' | 'frete fixo sem remessa típica'
    | 'frete não cadastrado' | 'tecido sem rendimento' | 'sem condição padrão';

export interface CustoDeReferencia { valor: number | null; preco: number | null; frete: number; condicao: TVCondicao | null; pendencias: Pendencia[] }
export interface CompraDaFaixa { data: string; quantidade: number; custo_unitario: number }
export interface Comparacao {
    menor: { valor: number; data: string };
    maior: { valor: number; data: string };
    /** Média ponderada pela quantidade, de todas as compras da janela. */
    media: number;
    /** Previsto ponderado, só das compras que tinham preço de tabela na data. */
    previstoMedio: number | null;
    diferencaPct: number | null;
    acima: boolean;
    compras: number;
}

export const MAX_FAIXAS = 6;
/** Acima disto a média comprada vira aviso; abaixo é arredondamento, não notícia. */
export const LIMITE_ACIMA_PCT = 2;
export const JANELA_DIAS = 90;

const c4 = (n: number) => Math.round(n * 10000) / 10000;
const c2 = (n: number) => Math.round(n * 100) / 100;

export function precoVigente(precos: TVPreco[], faixaId: string, condicaoId: string, data: string): TVPreco | null {
    let melhor: TVPreco | null = null;
    for (const p of precos) {
        if (p.faixa_id !== faixaId || p.condicao_id !== condicaoId || p.vale_desde > data) continue;
        if (!melhor || p.vale_desde > melhor.vale_desde) melhor = p;
    }
    return melhor;
}

export function condicoesDaLinha(linhaId: string, condicoes: TVCondicao[]): TVCondicao[] {
    return condicoes.filter(c => c.linha_id === linhaId && c.ativa).sort((a, b) => a.ordem - b.ordem);
}

export function condicaoPadrao(linhaId: string, condicoes: TVCondicao[]): TVCondicao | null {
    return condicoesDaLinha(linhaId, condicoes).find(c => c.padrao) ?? null;
}

export function freteDaLinha(linhaId: string, fretes: TVFrete[]): TVFrete | null {
    return fretes.find(f => f.linha_id === linhaId) ?? null;
}

/** Frete por unidade do tecido (kg ou metro). Metro precisa do rendimento para sair do kg. */
export function freteNaUnidade(
    frete: TVFrete | null,
    tipo: Pick<TVTipo, 'unidade' | 'rendimento_m_por_kg'>,
): { valor: number; pendencia?: Pendencia } {
    if (!frete) return { valor: 0, pendencia: 'frete não cadastrado' };
    if (frete.modo === 'cif') return { valor: 0 };
    if (frete.modo === 'cotacao') return { valor: 0, pendencia: 'frete a cotar' };
    let porKg: number;
    if (frete.modo === 'por_kg') porKg = Number(frete.valor) || 0;
    else {
        const remessa = Number(frete.remessa_tipica_kg);
        if (!(remessa > 0)) return { valor: 0, pendencia: 'frete fixo sem remessa típica' };
        porKg = (Number(frete.valor) || 0) / remessa;
    }
    if (tipo.unidade === 'kg') return { valor: c4(porKg) };
    const rend = Number(tipo.rendimento_m_por_kg);
    if (!(rend > 0)) return { valor: 0, pendencia: 'tecido sem rendimento' };
    return { valor: c4(porKg / rend) };
}

export function custoDeReferencia(faixa: TVFaixa, cat: Catalogo, data: string): CustoDeReferencia {
    const pendencias: Pendencia[] = [];
    const tipo = cat.tipos.find(t => t.id === faixa.tipo_id);
    if (!tipo) return { valor: null, preco: null, frete: 0, condicao: null, pendencias: ['faixa sem preço'] };
    const condicao = condicaoPadrao(tipo.linha_id, cat.condicoes);
    if (!condicao) pendencias.push('sem condição padrão');
    const f = freteNaUnidade(freteDaLinha(tipo.linha_id, cat.fretes), tipo);
    if (f.pendencia) pendencias.push(f.pendencia);
    const preco = condicao ? precoVigente(cat.precos, faixa.id, condicao.id, data)?.valor ?? null : null;
    if (preco === null) pendencias.push('faixa sem preço');
    return { valor: preco === null ? null : c4(preco + f.valor), preco, frete: f.valor, condicao, pendencias };
}

/** insumo_id → custo de referência, para os consumidores (inclui apelidos: todo insumo com faixa_id). */
export function mapaDeReferencia(cat: Catalogo, insumosComFaixa: { id: string; faixa_id: string }[], data: string): Map<string, number> {
    const porFaixa = new Map<string, number>();
    for (const fx of cat.faixas) {
        const v = custoDeReferencia(fx, cat, data).valor;
        if (v !== null && v > 0) porFaixa.set(fx.id, v);
    }
    const mapa = new Map<string, number>();
    for (const i of insumosComFaixa) {
        const v = porFaixa.get(i.faixa_id);
        if (v !== undefined) mapa.set(i.id, v);
    }
    return mapa;
}

export function menosDias(dataIso: string, dias: number): string {
    const d = new Date(`${dataIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString().slice(0, 10);
}

export function comparacaoComComprado(
    compras: CompraDaFaixa[],
    previstoNaData: (data: string) => number | null,
    hoje: string,
    dias = JANELA_DIAS,
): Comparacao | null {
    const desde = menosDias(hoje, dias);
    const janela = compras.filter(c => c.data >= desde && c.data <= hoje && c.quantidade > 0 && c.custo_unitario > 0);
    if (janela.length === 0) return null;
    let menor = janela[0], maior = janela[0], q = 0, pago = 0, qPrev = 0, pagoPrev = 0, prev = 0;
    for (const c of janela) {
        if (c.custo_unitario < menor.custo_unitario) menor = c;
        if (c.custo_unitario > maior.custo_unitario) maior = c;
        q += c.quantidade; pago += c.quantidade * c.custo_unitario;
        const p = previstoNaData(c.data);
        if (p !== null && p > 0) { qPrev += c.quantidade; pagoPrev += c.quantidade * c.custo_unitario; prev += c.quantidade * p; }
    }
    const previstoMedio = qPrev > 0 ? c2(prev / qPrev) : null;
    const diferencaPct = qPrev > 0 ? c2((pagoPrev / prev - 1) * 100) : null;
    return {
        menor: { valor: menor.custo_unitario, data: menor.data },
        maior: { valor: maior.custo_unitario, data: maior.data },
        media: c2(pago / q),
        previstoMedio,
        diferencaPct,
        acima: diferencaPct !== null && diferencaPct > LIMITE_ACIMA_PCT,
        compras: janela.length,
    };
}
