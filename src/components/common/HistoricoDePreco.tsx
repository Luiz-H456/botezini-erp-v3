import React, { useMemo } from 'react';
import {
    Users, Package, CheckCircle2, Clock, Lightbulb, ArrowUpRight, ArrowDownRight,
    Tag, PackageSearch, BarChart3,
} from 'lucide-react';
import { formatCurrency } from '@/utils';
import {
    resumirProduto, sugerirPrecoDeFechamento, bandaRealizada, ROTULO_STATUS,
} from '@/utils/historicoDeProduto';
import type {
    VendaDoProduto, FaixaAvaliada, FaixaDeDesconto, SugestaoDePreco, ReferenciaDePreco,
} from '@/utils/historicoDeProduto';
import type { Product } from '@/types';
import { BOTAO_SUAVE } from '@/components/finance/ui/estilo';

/** O que o cadastro do produto sabe sobre preço, no formato que a conta espera. */
export function referenciaDoProduto(produto?: Partial<Product> | null): ReferenciaDePreco {
    return {
        lista: Number(produto?.price_tier1) || 0,
        tier2: Number(produto?.price_tier2) || 0,
        tier3: Number(produto?.price_tier3) || 0,
        custo: Number(produto?.average_unit_cost) || 0,
    };
}

/**
 * Blocos de leitura do histórico de preço de um produto.
 *
 * Moram aqui, e não dentro da caixinha do orçamento, porque as mesmas peças são
 * usadas em dois lugares que precisam responder à mesma pergunta: o orçamento
 * ("por quanto costumo vender isto?") e o cadastro do produto ("os preços que
 * cadastrei batem com o que eu cobro?"). Duas cópias divergiriam na primeira
 * mudança de fórmula.
 */

export const ROTULO_CONFIANCA: Record<string, string> = {
    baixa: 'confiança baixa', media: 'confiança média', alta: 'confiança alta',
};

/** Dinheiro sem centavos, para os valores grandes de "a cada 100 peças". */
export const cheio = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;

export const dataCurta = (iso: string) =>
    iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

// ─── peças pequenas ──────────────────────────────────────────────────────────

export function Tile({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
    return (
        <div className="px-2 py-2 text-center">
            <p className="text-[7px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-0.5">{rotulo}</p>
            <p className={`text-[11px] font-mono font-black tracking-tighter ${destaque ? 'text-amber-500' : 'text-zinc-300'}`}>{valor}</p>
        </div>
    );
}

/** Média de um recorte (fechado / em aberto). `null` vira texto, nunca R$ 0,00. */
export function MediaPorStatus({ icone: Icone, rotulo, valor, contagem, vazio, cor }: {
    icone: React.ElementType; rotulo: string;
    valor: number | null; contagem: number; vazio: string; cor: string;
}) {
    return (
        <div className="px-3 py-2">
            <p className="text-[7px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-0.5 flex items-center gap-1">
                <Icone size={12} /> {rotulo}
            </p>
            {valor === null ? (
                <p className="text-[10px] font-bold text-zinc-700 italic">{vazio}</p>
            ) : (
                <p className={`text-[11px] font-mono font-black tracking-tighter ${cor}`}>
                    {formatCurrency(valor)}
                    <span className="text-[10px] text-zinc-600 font-bold ml-1.5">{contagem}×</span>
                </p>
            )}
        </div>
    );
}

/** "80% a 90% da tabela" — a fronteira aberta vira "acima de" / "abaixo de". */
export const faixaEmTexto = (f: FaixaDeDesconto) => {
    const p = (n: number) => `${Math.round(n * 100)}%`;
    if (f.indiceMax === Infinity) return `${p(f.indiceMin)}+`;
    if (f.indiceMin === 0) return `até ${p(f.indiceMax)}`;
    return `${p(f.indiceMin)}–${p(f.indiceMax)}`;
};

/**
 * Uma faixa da curva: que desconto, quanto a casa fecha ali e quanto rende
 * aplicado a este produto.
 *
 * A barra usa a taxa CRUA — é o que de fato aconteceu. A descontada pela
 * incerteza é detalhe da conta interna, e mostrá-la aqui faria o usuário
 * conferir a barra contra a fração ao lado e achar que uma das duas está errada.
 */
export function LinhaDaCurva({ faixa, melhor }: { faixa: FaixaAvaliada; melhor: boolean }) {
    const cor = faixa.abaixoDoCusto ? 'text-rose-500/70'
        : melhor ? 'text-amber-500' : 'text-zinc-500';
    return (
        <div className={`flex items-center gap-2 rounded-md px-1 py-0.5 -mx-1 ${melhor ? 'bg-amber-500/10' : ''}`}>
            <span className={`w-[52px] text-[10px] font-mono font-bold shrink-0 whitespace-nowrap ${cor}`}>
                {faixaEmTexto(faixa)}
            </span>
            <span className={`w-[58px] text-[10px] font-mono shrink-0 text-right ${cor}`}>
                {formatCurrency(faixa.preco)}
            </span>
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${melhor ? 'bg-amber-500' : 'bg-zinc-700'}`}
                        style={{ width: `${Math.round(faixa.taxa * 100)}%` }} />
                </div>
                <span className="text-[10px] font-mono text-zinc-600 shrink-0 w-[44px]">
                    {faixa.fechados}/{faixa.linhas}
                </span>
            </div>
            <span className={`w-[58px] text-right text-[10px] font-mono font-black shrink-0 ${cor}`}>
                {faixa.abaixoDoCusto ? 'no custo' : cheio(faixa.porCem)}
            </span>
        </div>
    );
}

/**
 * A curva inteira, não só o vencedor.
 *
 * Ver o desconto que fecha muito e rende pouco ao lado do que rende muito e não
 * fecha é o que torna a sugestão discutível em vez de um número para obedecer —
 * e é também o que permite desconfiar dela, que foi o que aconteceu na prática.
 */
export function Curva({ faixas, melhor, base }: {
    faixas: FaixaAvaliada[]; melhor?: FaixaAvaliada; base?: number;
}) {
    return (
        <div className="space-y-1 mt-2.5">
            <div className="flex items-center gap-2 text-[7px] font-black text-zinc-700 uppercase tracking-[0.15em]">
                <span className="w-[52px]">% tabela</span>
                <span className="w-[58px] text-right">Preço</span>
                <span className="flex-1">Fecha</span>
                <span className="w-[58px] text-right">Por 100</span>
            </div>
            {faixas.map((f, i) => (
                <LinhaDaCurva key={i} faixa={f} melhor={f === melhor} />
            ))}
            {/* De onde vem a taxa: da casa toda, não deste produto. É o que
                permite ter amostra, e é a suposição que fica em aberto — a casa
                desconta de forma parecida em produtos diferentes. */}
            <p className="text-[10px] text-zinc-700 leading-snug pt-1.5">
                Taxa medida em {base ? `${base.toLocaleString('pt-BR')} orçamentos` : 'todos os orçamentos'} da casa,
                normalizados pelo T1 de cada produto. Supõe que você desconta de forma parecida em produtos diferentes.
            </p>
        </div>
    );
}

/**
 * A banda de preço realizado — a análise de Marn & Rosiello (HBR, 1992).
 *
 * Não estima nada: mostra a dispersão do que já foi vendido, em % da tabela, e
 * quanto a cauda de baixo deixou na mesa. Continua de pé quando a sugestão se
 * recusa a opinar, que é justamente quando mais se precisa de alguma leitura.
 */
export function BandaDePreco({ vendas, lista }: { vendas: VendaDoProduto[]; lista?: number | null }) {
    const b = useMemo(() => bandaRealizada(vendas, lista), [vendas, lista]);
    if (!b) return null;

    const p = (n: number) => `${Math.round(n * 100)}%`;
    // A régua vai de p10 a p90 e a caixa central de p25 a p75; quando tudo sai
    // no mesmo preço a largura é zero e o desenho vira um traço — que é a
    // leitura correta: não há banda.
    const esc = (n: number) => {
        const min = Math.min(b.p10, b.p25), max = Math.max(b.p90, b.p75);
        return max === min ? 50 : ((n - min) / (max - min)) * 100;
    };

    return (
        <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-1">
                    <BarChart3 size={12} /> Banda de preço realizado
                </p>
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                    {b.base} venda{b.base > 1 ? 's' : ''} fechada{b.base > 1 ? 's' : ''}
                </p>
            </div>

            <div className="relative h-7 mb-1.5">
                <div className="absolute top-3 left-0 right-0 h-px bg-zinc-800" />
                <div className="absolute top-1.5 h-4 rounded bg-amber-500/20 border border-amber-500/40"
                    style={{ left: `${esc(b.p25)}%`, width: `${Math.max(1.5, esc(b.p75) - esc(b.p25))}%` }} />
                <div className="absolute top-0.5 w-px h-6 bg-amber-500"
                    style={{ left: `${esc(b.mediana)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-zinc-600 mb-2">
                <span>{p(b.p10)}</span>
                <span className="text-amber-500 font-black">mediana {p(b.mediana)}</span>
                <span>{p(b.p90)}</span>
            </div>

            <p className="text-[10px] text-zinc-500 leading-snug">
                Metade do seu volume sai entre <b className="text-zinc-300">{p(b.p25)}</b> e{' '}
                <b className="text-zinc-300">{p(b.p75)}</b> da tabela — uma banda de{' '}
                <b className="text-zinc-300">
                    {b.largura.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pontos
                </b>.
                {b.vazamento > 0 && (
                    <> As {b.linhasAbaixo} venda{b.linhasAbaixo > 1 ? 's' : ''} abaixo da mediana
                        ({b.pecasAbaixo.toLocaleString('pt-BR')} peças) teriam rendido{' '}
                        <b className="text-emerald-400">{cheio(b.vazamento)}</b> a mais no preço mediano.</>
                )}
            </p>
        </div>
    );
}

/**
 * A sugestão: o preço, o quanto mexer, e a curva que o justifica.
 *
 * O destaque é o preço e a diferença para o que se cobra hoje — que é a ação.
 * O retorno esperado aparece em "a cada 100 peças orçadas", porque R$ 0,44 por
 * peça orçada é uma unidade que ninguém tem na cabeça e R$ 44 a cada 100, sim.
 */
export function BlocoDaSugestao({ s }: { s: SugestaoDePreco }) {
    const sobe = s.diferenca > 0;
    const mexe = Math.abs(s.diferenca) >= 0.01;
    return (
        <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
                {/* "Espaço para subir" e não "melhor preço": a conta só opina
                    para cima. O ótimo abaixo do praticado vira aviso, não corte. */}
                <p className="text-[10px] font-black text-amber-500/80 uppercase tracking-[0.2em] flex items-center gap-1">
                    <Lightbulb size={12} /> Espaço para subir
                </p>
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{ROTULO_CONFIANCA[s.confianca]}</p>
            </div>

            <div className="flex items-baseline gap-2.5 mb-2">
                <span className="text-2xl font-mono font-black text-amber-500 tracking-tighter leading-none">
                    {formatCurrency(s.preco)}
                </span>
                {mexe && (
                    // Direção escrita, não só a cor da seta: "R$ 2,84 vs. hoje"
                    // não diz para que lado, e é justamente o que se precisa saber.
                    <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-0.5 ${sobe ? 'text-emerald-400' : 'text-sky-400'}`}>
                        {sobe ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {sobe ? 'subir' : 'baixar'} {formatCurrency(Math.abs(s.diferenca))}
                    </span>
                )}
            </div>

            <p className="text-[10px] text-zinc-500 leading-snug mb-1">{s.memoria}</p>

            <Curva faixas={s.faixas} melhor={s.faixa} base={s.baseDaCurva} />
        </div>
    );
}

/** Sugestão ou o motivo de não haver — com a curva junto, quando existe. */
export function SugestaoOuMotivo({ vendas, curva, referencia, onUsarPreco }: {
    vendas: VendaDoProduto[];
    curva: FaixaDeDesconto[] | null | undefined;
    referencia: ReferenciaDePreco;
    /** Com ela, a sugestão ganha o botão que a aplica na linha. */
    onUsarPreco?: (preco: number) => void;
}) {
    const r = useMemo(
        () => sugerirPrecoDeFechamento(vendas, curva, referencia),
        [vendas, curva, referencia]);

    if (r.ok) return (
        <>
            <BlocoDaSugestao s={r.sugestao} />
            {onUsarPreco && (
                <div className="px-4 pb-3">
                    <button type="button" onClick={() => onUsarPreco(r.sugestao.preco)} className={BOTAO_SUAVE}>
                        Usar {formatCurrency(r.sugestao.preco)}
                    </button>
                </div>
            )}
        </>
    );
    return (
        <div className="px-4 py-3">
            <div className="flex items-start gap-2">
                <Lightbulb size={12} className="text-zinc-700 mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">Sem espaço de alta</p>
                    <p className="text-[10px] text-zinc-500 leading-snug">{r.motivo}</p>
                </div>
            </div>
            {/* A curva continua aparecendo: mesmo sem um número para recomendar,
                saber quanto a casa fecha em cada desconto é o que se quer olhar. */}
            {r.faixas && <Curva faixas={r.faixas} />}
        </div>
    );
}

// ─── tabela cadastrada × praticado ───────────────────────────────────────────

const FAIXAS_DO_CADASTRO = [
    { campo: 'price_tier1' as const, rotulo: 'T1', legenda: 'Varejo' },
    { campo: 'price_tier2' as const, rotulo: 'T2', legenda: 'Atacado 1' },
    { campo: 'price_tier3' as const, rotulo: 'T3', legenda: 'Atacado 2' },
];

/**
 * As três faixas cadastradas no produto, com a nota que explica o critério.
 *
 * O preço praticado marca qual faixa está sendo seguida. É a pergunta que o
 * orçamento não respondia: "esse valor que estou digitando é o T2 ou eu inventei
 * um número?". A faixa mais próxima só é apontada dentro de um centavo — quase
 * igual não é igual, e dizer "é o T2" para um valor que não é o T2 seria pior
 * que não dizer nada.
 */
export function TabelaDoCadastro({ produto, precoAtual, compacto }: {
    produto: Pick<Product, 'price_tier1' | 'price_tier2' | 'price_tier3' | 'price_notes'>;
    precoAtual?: number;
    compacto?: boolean;
}) {
    const faixas = FAIXAS_DO_CADASTRO
        .map(f => ({ ...f, valor: Number(produto[f.campo]) || 0 }))
        .filter(f => f.valor > 0);

    if (faixas.length === 0 && !produto.price_notes) return null;

    const preco = Number(precoAtual) || 0;
    const igual = faixas.find(f => Math.abs(f.valor - preco) < 0.005);

    return (
        <div className={compacto ? 'px-4 py-2.5' : 'p-4'}>
            <p className="text-[7px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1">
                <Tag size={12} /> Tabela do cadastro
            </p>
            {faixas.length > 0 && (
                <div className="flex items-stretch gap-1.5">
                    {faixas.map(f => {
                        const ativo = igual?.campo === f.campo;
                        return (
                            <div key={f.campo}
                                className={`flex-1 rounded-lg border px-2 py-1.5 text-center transition-colors ${ativo
                                    ? 'border-emerald-500/50 bg-emerald-500/10'
                                    : 'border-zinc-800 bg-zinc-900/40'}`}>
                                <p className={`text-[7px] font-black uppercase tracking-[0.2em] ${ativo ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                    {f.rotulo} · {f.legenda}
                                </p>
                                <p className={`text-[11px] font-mono font-black tracking-tighter ${ativo ? 'text-emerald-400' : 'text-zinc-300'}`}>
                                    {formatCurrency(f.valor)}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
            {preco > 0 && !igual && faixas.length > 0 && (
                <p className="text-[10px] text-zinc-600 mt-1.5 leading-snug">
                    O valor da linha ({formatCurrency(preco)}) não é nenhuma das faixas cadastradas.
                </p>
            )}
            {produto.price_notes && (
                <p className="text-[10px] text-zinc-500 leading-snug mt-2 whitespace-pre-wrap break-words">
                    {produto.price_notes}
                </p>
            )}
        </div>
    );
}

// ─── painel inteiro, para uso fora do balão ──────────────────────────────────

/**
 * O histórico completo em bloco, para caber numa página em vez de num balão.
 *
 * É o que o cadastro do produto mostra abaixo da tabela de preços: define-se o
 * T1/T2/T3 olhando para o que já foi cobrado e fechado, em vez de para o nada.
 */
export function PainelHistoricoDePreco({ vendas, carregando, curva, referencia }: {
    vendas: VendaDoProduto[];
    carregando?: boolean;
    curva?: FaixaDeDesconto[] | null;
    referencia?: ReferenciaDePreco;
}) {
    const resumo = useMemo(() => resumirProduto(vendas), [vendas]);
    const ref = referencia || {};

    if (carregando) {
        return (
            <p className="text-zinc-600 text-[10px] uppercase font-black tracking-[0.2em] animate-pulse py-8 text-center">
                Carregando histórico...
            </p>
        );
    }

    if (!resumo) {
        return (
            <div className="text-center py-8">
                <PackageSearch size={28} className="mx-auto text-zinc-700 mb-2" />
                <p className="text-zinc-500 text-xs">Este produto ainda não foi orçado com preço.</p>
                <p className="text-zinc-600 text-[10px] mt-1">
                    Assim que houver orçamentos, a faixa praticada e a taxa de fechamento aparecem aqui.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 xl:divide-x divide-zinc-800/70">
            <div className="min-w-0">
                <SugestaoOuMotivo vendas={vendas} curva={curva} referencia={ref} />
                {/* A banda vem logo abaixo da sugestão porque é a leitura que
                    sobrevive quando a sugestão se recusa a opinar. */}
                <div className="border-t border-zinc-800/70">
                    <BandaDePreco vendas={vendas} lista={ref.lista} />
                </div>
            </div>

            <div className="min-w-0 border-t xl:border-t-0 border-zinc-800/70">
                <div className="grid grid-cols-3 divide-x divide-zinc-800/70 border-b border-zinc-800/70">
                    <Tile rotulo="Menor" valor={formatCurrency(resumo.menor)} />
                    <Tile rotulo="Médio" valor={formatCurrency(resumo.medio)} destaque />
                    <Tile rotulo="Maior" valor={formatCurrency(resumo.maior)} />
                </div>

                <div className="grid grid-cols-2 divide-x divide-zinc-800/70 border-b border-zinc-800/70">
                    <MediaPorStatus icone={CheckCircle2} rotulo="Fechado"
                        valor={resumo.medioFechado} contagem={resumo.fechados}
                        vazio="nada fechado" cor="text-emerald-400" />
                    <MediaPorStatus icone={Clock} rotulo="Em aberto"
                        valor={resumo.medioAberto} contagem={resumo.abertos}
                        vazio="nada em aberto" cor="text-zinc-300" />
                </div>

                <div className="px-4 py-2 border-b border-zinc-800/70 flex items-center gap-3 text-[10px] font-bold text-zinc-500">
                    <span className="flex items-center gap-1"><Package size={12} className="text-zinc-600" />{resumo.quantidadeTotal.toLocaleString('pt-BR')} pçs</span>
                    <span className="flex items-center gap-1"><Users size={12} className="text-zinc-600" />{resumo.clientes} cliente{resumo.clientes > 1 ? 's' : ''}</span>
                    <span className="ml-auto text-zinc-600">mediana {formatCurrency(resumo.mediana)}</span>
                </div>

                {resumo.cores.length > 0 && (
                    <div className="px-4 py-2">
                        <p className="text-[7px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">Médio por cor</p>
                        <div className="max-h-[132px] overflow-y-auto custom-scrollbar">
                            {resumo.cores.map(c => (
                                <div key={c.cor} className="flex items-center gap-2 py-0.5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 truncate flex-1 min-w-0">{c.cor}</span>
                                    <span className="text-[10px] font-bold text-zinc-600 shrink-0">{c.quantidade.toLocaleString('pt-BR')} pçs</span>
                                    <span className="text-[10px] font-mono font-black text-amber-500/90 shrink-0 w-[62px] text-right">
                                        {formatCurrency(c.valorMedio)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="xl:col-span-2 border-t border-zinc-800/70">
                <p className="px-4 pt-2 pb-1 text-[7px] font-black text-zinc-600 uppercase tracking-[0.2em]">
                    Orçamentos · bolinha verde fechou
                </p>
                <div className="divide-y divide-zinc-800/50 max-h-[220px] overflow-y-auto custom-scrollbar">
                    {resumo.vendas.map((v, i) => (
                        <div key={`${v.orcamentoId}-${i}`} className="px-4 py-1.5 flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.fechado ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                title={ROTULO_STATUS[v.status] || v.status} />
                            <span className="text-[10px] font-mono text-zinc-500 shrink-0 w-[52px]">{dataCurta(v.data)}</span>
                            <span className="text-[10px] font-bold text-zinc-300 truncate flex-1 min-w-0">{v.cliente}</span>
                            <span className="text-[10px] text-zinc-600 uppercase tracking-widest truncate shrink-0 max-w-[180px]">
                                {v.quantidade.toLocaleString('pt-BR')} pçs{v.cor ? ` · ${v.cor}` : ''}{v.tamanho ? ` · ${v.tamanho}` : ''}
                            </span>
                            <span className="text-[10px] font-mono font-black text-amber-500 shrink-0 w-[68px] text-right">{formatCurrency(v.valorUnit)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
