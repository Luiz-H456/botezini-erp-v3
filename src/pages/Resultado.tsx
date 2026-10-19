import { useEffect, useMemo, useState } from 'react';
import { useDadosDasFinancas } from '@/hooks/financas/useDadosDasFinancas';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import type { DadosDasFinancas } from '@/hooks/financas/useDadosDasFinancas';
import { pdfService } from '@/services/pdfService';
import { storageService } from '@/services/storage';
import { getTodayStr } from '@/utils/date';
import { normalizeCategoryName } from '@/utils/categoryResolver';
import { mesAnterior, mesDe, nomeDoMes, nomeDoTrimestre, proximoMes, trimestreDe } from '@/utils/financas/base';
import { caixaDoPeriodo, linhasDoRelatorio, variacao } from '@/utils/financas/caixa';
import { vendasDoPeriodo } from '@/utils/financas/vendas';
import { linhasDoDre, margemAbaixoDoAlvo, metaDoPeriodo } from '@/utils/financas/resultado';
import type { CompanyProfile } from '@/types';
import type { FiltrosDaLista } from '@/utils/financas/lista';
import type { View } from '@/utils/navegacao';
import { ChevronLeft, ChevronRight, FileDown, ArrowDownLeft, Factory, TrendingUp, ShoppingBag } from 'lucide-react';
import { Indicador } from '@/components/finance/ui/Indicador';
import { CARTAO, ITEM, ROTULO, BOTAO_SECUNDARIO, pilula } from '@/components/finance/ui/estilo';

interface PropsResultado { abrirContas: (f: Partial<FiltrosDaLista>) => void; onIrPara?: (v: View) => void }

export default function Resultado({ abrirContas, onIrPara }: PropsResultado) {
    const { dados, erro, carregando } = useDadosDasFinancas();
    if (erro) return <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erro}</p>;
    if (!dados) return <p className="text-sm text-zinc-500">{carregando ? 'Carregando…' : ''}</p>;
    return <ResultadoDoMes dados={dados} abrirVisaoGeral={abrirContas} onIrPara={onIrPara} />;
}

interface Props {
    dados: DadosDasFinancas;
    abrirVisaoGeral: (f: Partial<FiltrosDaLista>) => void;
    onIrPara?: (v: View) => void;
}

/** A empresa deu lucro, quanto vendeu, e para onde foi o dinheiro? */
function ResultadoDoMes({ dados, abrirVisaoGeral, onIrPara }: Props) {
    const { mostrar } = useMostrarValor();
    const [mes, setMes] = useState(mesDe(getTodayStr()));
    const [porTrimestre, setPorTrimestre] = useState(false);
    const [erroPdf, setErroPdf] = useState('');
    const [vista, setVista] = useState<'caixa' | 'dre'>('caixa');
    const [perfil, setPerfil] = useState<CompanyProfile | null>(null);
    // Leitura do perfil falhou: a meta pode existir, então o convite "Defina a meta" não vale.
    const [erroPerfil, setErroPerfil] = useState(false);
    // A leitura terminou (bem ou mal): antes disso o cartão da meta fica vazio, sem piscar o convite.
    const [perfilLido, setPerfilLido] = useState(false);

    useEffect(() => {
        let vivo = true;
        storageService.getCompanyProfile().then(p => { if (vivo) { setPerfil(p); setPerfilLido(true); } }, () => { if (vivo) { setPerfil(null); setErroPerfil(true); setPerfilLido(true); } });
        return () => { vivo = false; };
    }, []);

    /** Anda n meses (n negativo volta). */
    const andar = (m: string, n: number) => {
        let r = m;
        for (let i = 0; i < Math.abs(n); i++) r = n < 0 ? mesAnterior(r) : proximoMes(r);
        return r;
    };
    const passo = porTrimestre ? 3 : 1;
    const meses = porTrimestre ? trimestreDe(mes) : [mes];
    const mesesAnteriores = porTrimestre ? trimestreDe(andar(mes, -3)) : [mesAnterior(mes)];
    const rotulo = porTrimestre ? nomeDoTrimestre(mes) : nomeDoMes(mes);
    const rotuloAnterior = porTrimestre ? nomeDoTrimestre(andar(mes, -3)) : nomeDoMes(mesAnterior(mes)).split(' ')[0];
    const chave = meses.join(',');

    const caixa = useMemo(() => caixaDoPeriodo({ pagamentos: dados.pagamentos, contas: dados.contas, categorias: dados.categorias, meses }), [dados, chave]);
    const anterior = useMemo(() => caixaDoPeriodo({ pagamentos: dados.pagamentos, contas: dados.contas, categorias: dados.categorias, meses: mesesAnteriores }), [dados, chave]);
    const vendas = useMemo(() => vendasDoPeriodo({ pedidos: dados.pedidos, contas: dados.contas, meses }), [dados, chave]);
    const fimDoPeriodo = meses[meses.length - 1];
    const mesesDoAno = useMemo(() => {
        const r: string[] = [];
        for (let m = `${fimDoPeriodo.slice(0, 4)}-01`; m <= fimDoPeriodo; m = proximoMes(m)) r.push(m);
        return r;
    }, [fimDoPeriodo]);
    const vendasAno = useMemo(() => vendasDoPeriodo({ pedidos: dados.pedidos, contas: dados.contas, meses: mesesDoAno }), [dados, mesesDoAno]);
    const metaPeriodo = metaDoPeriodo(vendas.vendido, perfil?.revenue_goal, meses.length);
    const metaAno = metaDoPeriodo(vendasAno.vendido, perfil?.revenue_goal, mesesDoAno.length);
    const margemBaixa = margemAbaixoDoAlvo(caixa, perfil?.target_margin);
    const delta = variacao(caixa.lucro, anterior.lucro);

    const exportar = async () => {
        setErroPdf('');
        try {
            pdfService.generateExecutiveReport(
                vista === 'dre' ? linhasDoDre(caixa) : linhasDoRelatorio(caixa), rotulo, await storageService.getCompanyProfile(),
                caixa.porCategoria.map(f => ({ name: f.nome, value: f.valor })),
                { revenue: caixa.entrou, expenses: caixa.despesas, ebitda: caixa.sobrouDaProducao - caixa.despesas, result: caixa.lucro });
        } catch (e) {
            setErroPdf(e instanceof Error ? e.message : 'Não consegui gerar o PDF.');
        }
    };

    const categoriaPorNome = new Map(dados.categorias.map(c => [normalizeCategoryName(c.name), c.id]));
    const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    const maiorFatia = Math.max(1, ...caixa.porCategoria.map(f => f.valor));
    const linha = (rotulo: string, valor: number, tom = 'text-zinc-400') => (
        <div className={`flex justify-between gap-3 py-2.5 text-sm tabular-nums ${tom}`}><span>{rotulo}</span><span className="font-mono">{mostrar(valor)}</span></div>
    );

    const barraDeMeta = (nome: string, realizado: number, m: NonNullable<typeof metaPeriodo>) => (
        <div className="space-y-1.5">
            <p className="flex justify-between gap-3 text-sm tabular-nums">
                <span className="truncate text-zinc-300">{nome}</span>
                <span className={`font-mono ${m.atingiu ? 'text-emerald-400' : 'text-zinc-300'}`}>{mostrar(realizado)} de {mostrar(m.meta)} · {pct(m.pct)}</span>
            </p>
            <span className="block h-1.5 rounded-full bg-zinc-800"><span className={`block h-1.5 rounded-full ${m.atingiu ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, m.pct)}%` }} /></span>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className={`flex items-center gap-2 ${ROTULO}`}><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Como estamos indo</p>
                    <h1 className="mt-1 text-2xl font-black uppercase tracking-tighter text-white">Resultado · {rotulo}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setPorTrimestre(false)} aria-pressed={!porTrimestre} className={pilula(!porTrimestre)}>Mês</button>
                    <button type="button" onClick={() => setPorTrimestre(true)} aria-pressed={porTrimestre} className={pilula(porTrimestre)}>Trimestre</button>
                    <span className="flex items-center rounded-xl border border-zinc-800 bg-zinc-950/50">
                        <button type="button" onClick={() => setMes(andar(mes, -passo))} className="h-9 w-9 text-zinc-400 hover:text-white" aria-label="Período anterior"><ChevronLeft size={18} className="mx-auto" /></button>
                        <span className="min-w-32 text-center text-[10px] font-black uppercase tracking-widest text-zinc-200">{rotulo}</span>
                        <button type="button" onClick={() => setMes(andar(mes, passo))} className="h-9 w-9 text-zinc-400 hover:text-white" aria-label="Próximo período"><ChevronRight size={18} className="mx-auto" /></button>
                    </span>
                    <button type="button" onClick={exportar} className={`${BOTAO_SECUNDARIO} h-9`}><FileDown size={14} /> Exportar PDF</button>
                </div>
            </div>
            {erroPdf && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erroPdf}</p>}
            {dados.pagamentosIncompletos && (
                <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-400">Há mais de 5.000 pagamentos: os meses mais antigos podem estar incompletos.</p>
            )}

            {margemBaixa && (
                <p className={`${ITEM} p-3 text-sm font-bold text-amber-400`}>Sobrou da produção {pct(margemBaixa.margem)} — abaixo da margem alvo de {pct(margemBaixa.alvo)} (Minha empresa)</p>
            )}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Indicador icone={ArrowDownLeft} rotulo="Entrou" valor={mostrar(caixa.entrou)} tom="emerald" />
                <Indicador icone={Factory} rotulo="Sobrou da produção" valor={mostrar(caixa.sobrouDaProducao)}
                    sub={caixa.percentualDaProducao !== null ? `${pct(caixa.percentualDaProducao)} do que entrou` : undefined} />
                <Indicador icone={TrendingUp} rotulo="Lucro de caixa" valor={mostrar(caixa.lucro)} tom={caixa.lucro < 0 ? 'rose' : 'emerald'}
                    sub={`${rotuloAnterior} ${mostrar(anterior.lucro)} · ${delta === null ? '—' : `${delta > 0 ? '+' : ''}${pct(delta)}`}`} />
                <Indicador icone={ShoppingBag} rotulo="Vendido (pela entrega)" valor={mostrar(vendas.vendido)} tom="amber"
                    sub={`${vendas.pedidos} pedido(s) · ${vendas.pecas} peça(s)`} />
            </section>

            <section className={`${CARTAO} p-5 space-y-3`}>
                <h2 className={ROTULO}>Meta de faturamento</h2>
                {metaPeriodo && metaAno ? (
                    <>
                        {barraDeMeta(rotulo, vendas.vendido, metaPeriodo)}
                        {barraDeMeta(`Ano até ${nomeDoMes(fimDoPeriodo).split(' ')[0]}`, vendasAno.vendido, metaAno)}
                    </>
                ) : !perfilLido ? null : erroPerfil ? (
                    <p className="text-sm text-zinc-500">Não consegui ler a meta agora</p>
                ) : (
                    onIrPara ? (
                        <button type="button" onClick={() => onIrPara('empresa')} className="text-left text-sm text-zinc-500 hover:text-zinc-300">
                            Defina a meta de faturamento em <span className="underline">Cadastros › Minha empresa</span>
                        </button>
                    ) : (
                        <p className="text-sm text-zinc-500">Defina a meta de faturamento em Cadastros › Minha empresa</p>
                    )
                )}
            </section>

            <div className="grid gap-3 lg:grid-cols-2">
                <section className={`${CARTAO} p-5 min-w-0`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h2 className={ROTULO}>{porTrimestre ? 'Caixa do trimestre' : 'Caixa do mês'}</h2>
                        <span className="flex gap-1">
                            <button type="button" onClick={() => setVista('caixa')} aria-pressed={vista === 'caixa'} className={pilula(vista === 'caixa')}>Caixa</button>
                            <button type="button" onClick={() => setVista('dre')} aria-pressed={vista === 'dre'} className={pilula(vista === 'dre')}>DRE</button>
                        </span>
                    </div>
                    {vista === 'dre' ? linhasDoDre(caixa).map(l => (
                        <div key={l.label} className={`flex justify-between gap-3 py-2.5 text-sm tabular-nums ${l.is_total ? 'border-t border-zinc-800 font-black text-zinc-100' : l.is_deduction ? 'text-zinc-400' : 'font-bold text-zinc-100'}`}>
                            <span>{l.label}</span>
                            <span className="flex items-baseline gap-2 font-mono">{mostrar(l.value)}<span className="w-12 text-right text-[10px] text-zinc-500">{pct(l.percent ?? 0)}</span></span>
                        </div>
                    )) : (<>
                        {linha('Entrou', caixa.entrou, 'text-zinc-100 font-bold')}
                        {linha('− impostos', caixa.impostos)}
                        {linha('− custo das peças', caixa.custoPecas)}
                        <div className="flex justify-between gap-3 border-t border-zinc-800 py-2.5 text-sm font-black tabular-nums text-zinc-100">
                            <span>Sobrou da produção</span>
                            <span className="flex items-baseline gap-2 font-mono">{mostrar(caixa.sobrouDaProducao)}{caixa.percentualDaProducao !== null && <span className="text-[10px] text-zinc-500">{pct(caixa.percentualDaProducao)}</span>}</span>
                        </div>
                        {linha('− despesas da empresa', caixa.despesas)}
                        {linha('− juros e tarifas', caixa.financeiras)}
                        <div className="mt-1 flex justify-between gap-3 border-t-2 border-amber-500/40 pt-3 text-lg font-black tabular-nums">
                            <span className="uppercase tracking-tighter text-white">Lucro de caixa</span>
                            <span className={`font-mono ${caixa.lucro < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{mostrar(caixa.lucro)}</span>
                        </div>
                    </>)}
                    <div className="mt-4 flex justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        <span>Recebido antecipado de pedidos ainda não entregues</span>
                        <span className="font-mono tabular-nums text-violet-400">{mostrar(vendas.recebidoAntecipado)}</span>
                    </div>
                </section>

                <section className={`${CARTAO} p-5 min-w-0 space-y-3`}>
                    <h2 className={ROTULO}>Para onde foi o dinheiro</h2>
                    {caixa.porCategoria.length === 0 && <p className="text-sm text-zinc-500">Nenhuma saída neste {porTrimestre ? 'trimestre' : 'mês'}.</p>}
                    {caixa.porCategoria.map(f => {
                        const id = categoriaPorNome.get(normalizeCategoryName(f.nome));
                        const semFiltro = f.nome === 'Outros' || f.nome === 'Sem categoria';
                        return (
                            <button key={f.nome} type="button" disabled={!id && semFiltro}
                                title={!id && f.nome === 'Outros' ? 'soma das categorias menores' : !id && semFiltro ? 'contas sem categoria' : undefined}
                                onClick={() => abrirVisaoGeral(id ? { categoriaId: id, rapido: 'pagas' } : { busca: f.nome, rapido: 'pagas' })}
                                className="block w-full space-y-1.5 text-left disabled:cursor-default">
                                <span className="flex justify-between gap-3 text-sm"><span className="truncate text-zinc-300">{f.nome}</span><span className="font-mono tabular-nums text-zinc-300">{mostrar(f.valor)}</span></span>
                                <span className="block h-1.5 rounded-full bg-zinc-800"><span className="block h-1.5 rounded-full bg-amber-500/70" style={{ width: `${Math.max(2, (f.valor / maiorFatia) * 100)}%` }} /></span>
                            </button>
                        );
                    })}
                    <p className="text-[10px] font-bold text-zinc-600">Clicar numa barra abre Contas filtrada por aquela categoria.</p>
                </section>
            </div>
        </div>
    );
}
