import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import {
    RefreshCw, TrendingDown, Wallet, Target, AlertTriangle, CheckCircle, Lock, Scale,
} from 'lucide-react';
import { formatCurrency } from '@/utils';
import { useSaudeDoCaixa } from '@/hooks/useSaudeDoCaixa';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { InfoTooltip } from '@/components/common';
import { IndicadorRecarga } from '@/components/common/IndicadorRecarga';
import type { Veredito } from '@/utils/saudeDoCaixa';
import { ROTULO, ROTULO_PEQUENO, CARTAO, ITEM, CAMPO, BOTAO_SECUNDARIO, BOTAO_SUAVE } from './ui/estilo';

const COR_GRADE = '#27272a';
const COR_EIXO = '#71717a';

const dia = (iso?: string) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');

/** Cada veredito tem cor e ícone próprios — a leitura é de relance. */
const ESTILO: Record<Veredito, { cor: string; borda: string; texto: string; Icone: typeof Target }> = {
    tudo_bem: { cor: 'bg-emerald-500/10', borda: 'border-emerald-500/30', texto: 'text-emerald-400', Icone: CheckCircle },
    // Âmbar, não verde: saldo positivo com caixa encolhendo não é bom sinal.
    queima_reserva: { cor: 'bg-amber-500/10', borda: 'border-amber-500/30', texto: 'text-amber-400', Icone: TrendingDown },
    fecha_mas_nao_para_de_pe: { cor: 'bg-amber-500/10', borda: 'border-amber-500/30', texto: 'text-amber-400', Icone: AlertTriangle },
    nao_fecha_mas_e_saudavel: { cor: 'bg-amber-500/10', borda: 'border-amber-500/30', texto: 'text-amber-400', Icone: AlertTriangle },
    ruim_dos_dois_lados: { cor: 'bg-rose-500/10', borda: 'border-rose-500/30', texto: 'text-rose-400', Icone: AlertTriangle },
    sem_dados: { cor: 'bg-zinc-900', borda: 'border-zinc-800', texto: 'text-zinc-400', Icone: AlertTriangle },
};

function Kpi({ label, valor, sub, tom, dica }: {
    label: string; valor: string; sub?: string;
    tom: 'zinc' | 'emerald' | 'rose' | 'amber'; dica?: string;
}) {
    const cor = { zinc: 'text-zinc-200', emerald: 'text-emerald-400', rose: 'text-rose-400', amber: 'text-amber-400' }[tom];
    return (
        <div className={`${CARTAO} p-4`}>
            <div className="flex items-center gap-1.5 mb-1">
                <p className={ROTULO_PEQUENO}>{label}</p>
                {dica && <InfoTooltip><p className="text-[11px] text-zinc-300 leading-relaxed">{dica}</p></InfoTooltip>}
            </div>
            <p className={`text-xl font-black font-mono tracking-tighter ${cor}`}>{valor}</p>
            {sub && <p className="text-[9px] text-zinc-600 font-bold font-mono mt-0.5">{sub}</p>}
        </div>
    );
}

function Cartao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
    return (
        <div className={`${CARTAO} p-5 min-w-0`}>
            <h3 className="text-[10px] font-black text-white uppercase tracking-widest">{titulo}</h3>
            {subtitulo && <p className="text-[10px] text-zinc-600 font-bold mt-0.5 mb-3">{subtitulo}</p>}
            {children}
        </div>
    );
}

export function SaudeDoCaixaPanel({ mesInicial }: { mesInicial?: string }) {
    const v = useSaudeDoCaixa(mesInicial);
    const { oculto } = useMostrarValor();

    if (v.loading) {
        return (
            <div className="text-center p-16 text-zinc-600 flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className={ROTULO}>Fechando as contas do mês...</span>
            </div>
        );
    }

    const f = v.fechamento;
    const pe = v.equilibrio;
    const est = ESTILO[v.leitura.veredito];
    const diferencaDoOtimismo = f.saldoFinal - v.fechamentoPeloVencimento.saldoFinal;

    return (
        <div className="space-y-4 ease-out animate-in fade-in duration-200">
            <div className="flex items-center gap-3 flex-wrap">
                <input type="month" value={v.mes} onChange={e => v.setMes(e.target.value)} className={CAMPO} />
                <IndicadorRecarga ativo={v.recarregando} />
                <button onClick={v.reload} aria-label="Recarregar" className={`${BOTAO_SECUNDARIO} w-10 px-0 ml-auto`}>
                    <RefreshCw size={18} className={v.recarregando ? 'animate-spin' : ''} />
                </button>
            </div>

            {v.error && (
                <div className="text-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <p className="text-xs text-rose-400 font-bold">{v.error}</p>
                </div>
            )}

            {/* O VEREDITO — as duas perguntas cruzadas numa frase */}
            <div className={`${est.cor} border ${est.borda} rounded-2xl p-5 flex items-start gap-3`}>
                <est.Icone size={20} className={`${est.texto} shrink-0 mt-0.5`} />
                <div className="min-w-0">
                    <p className={`text-sm font-black ${est.texto}`}>{v.leitura.titulo}</p>
                    <p className="text-[11px] text-zinc-400 font-bold leading-relaxed mt-1">{v.leitura.explicacao}</p>
                </div>
            </div>

            {/* ── PERGUNTA 1: o mês fecha? ── */}
            <div className="flex items-center gap-2">
                <Wallet size={14} className="text-emerald-500" />
                <h2 className="text-[11px] font-black text-white uppercase tracking-widest">O mês fecha?</h2>
                <InfoTooltip>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Liquidez, não resultado</p>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                        Pergunta se sobra dinheiro na conta, não se a operação dá lucro. Usa a data em que cada
                        cliente <strong className="text-zinc-200">costuma pagar</strong>, corrigida pelo histórico dele — não o
                        vencimento, que é promessa. Projeta de hoje até o fim do mês, a partir do saldo atual das contas.
                    </p>
                </InfoTooltip>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Saldo hoje" valor={formatCurrency(v.saldoAtual)}
                    sub={v.reservado > 0 ? `livre ${formatCurrency(v.livre)}` : undefined} tom="zinc"
                    dica={v.reservado > 0 ? 'O que está em caixinhas não paga conta — por isso o saldo livre aparece separado.' : undefined} />
                <Kpi label="Entra − sai" valor={formatCurrency(f.resultadoDoPeriodo)}
                    sub={`${formatCurrency(f.entradas)} − ${formatCurrency(f.saidas)}`}
                    tom={f.resultadoDoPeriodo >= 0 ? 'emerald' : 'rose'}
                    dica="O resultado do período. Negativo significa que o caixa encolheu — mesmo que o saldo final continue positivo, porque havia reserva." />
                <Kpi label={`Saldo em ${dia(v.periodo.fim)}`} valor={formatCurrency(f.saldoFinal)}
                    tom={f.saldoFinal >= 0 ? 'emerald' : 'rose'} />
                <Kpi label="Reserva dura" 
                    valor={f.mesesDeReserva === null ? '—' : f.mesesDeReserva <= 0 ? '< 1 mês' : `${f.mesesDeReserva} ${f.mesesDeReserva === 1 ? 'mês' : 'meses'}`}
                    sub={f.consomeReserva ? 'neste ritmo de queima' : 'não está queimando'}
                    tom={f.mesesDeReserva === null ? 'zinc' : f.mesesDeReserva <= 2 ? 'rose' : 'amber'}
                    dica="Quantos meses a reserva cobre se a queima se repetir. Arredondado para baixo — em falta de caixa, errar cedo custa menos." />
            </div>

            {f.primeiroDiaNegativo && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3">
                    <TrendingDown size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[11px] font-black text-rose-400 uppercase tracking-widest">
                            O saldo fica negativo em {dia(f.primeiroDiaNegativo)}
                        </p>
                        <p className="text-[11px] text-zinc-400 font-bold leading-relaxed mt-1">
                            Fundo do poço: <span className="font-mono text-rose-400">{formatCurrency(f.menorSaldo)}</span> em {dia(f.diaDoMenorSaldo)}.
                            {f.fechaMasFuraNoMeio && ' O mês termina positivo, mas passa por esse buraco antes — terminar bem não é o mesmo que nunca faltar dinheiro.'}
                        </p>
                    </div>
                </div>
            )}

            {f.consomeReserva && f.fecha && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                    <TrendingDown size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest">
                            O caixa encolheu {formatCurrency(Math.abs(f.resultadoDoPeriodo))} no período
                        </p>
                        <p className="text-[11px] text-zinc-400 font-bold leading-relaxed mt-1">
                            O saldo termina positivo, mas saiu mais do que entrou — a diferença veio da reserva.
                            Um mês assim não quebra nada; repetido, zera o caixa. O saldo final sozinho não mostra isso.
                        </p>
                    </div>
                </div>
            )}

            <Cartao titulo="Saldo dia a dia" subtitulo={`De ${dia(v.periodo.inicio)} a ${dia(v.periodo.fim)}, pela data provável de pagamento`}>
                <div className="w-full h-[240px] min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={v.pontos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="grad-saldo" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                            <XAxis dataKey="data" stroke={COR_EIXO} fontSize={10} axisLine={false} tickLine={false}
                                tickFormatter={dia} minTickGap={24} />
                            <YAxis stroke={COR_EIXO} fontSize={10} axisLine={false} tickLine={false} width={52}
                                tickFormatter={(n: number) => (oculto ? '' : `${Math.round(n / 1000)}k`)} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#09090b', borderColor: '#3f3f46', fontSize: 11, borderRadius: 12 }}
                                labelFormatter={(l: any) => dia(String(l ?? ''))}
                                formatter={((val: any) => [formatCurrency(Number(val)), 'Saldo']) as any} />
                            {/* A linha do zero é o limite que importa: cruzá-la é cheque especial. */}
                            <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="4 4" strokeWidth={1.5} />
                            <Area type="monotone" dataKey="saldo" stroke="#10b981" strokeWidth={2}
                                fill="url(#grad-saldo)" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                {Math.abs(diferencaDoOtimismo) >= 1 && (
                    <p className="text-[10px] text-zinc-500 font-bold mt-3 leading-relaxed">
                        Contando pelo vencimento combinado, o saldo final seria{' '}
                        <span className="font-mono text-zinc-300">{formatCurrency(v.fechamentoPeloVencimento.saldoFinal)}</span> —
                        uma diferença de <span className={`font-mono ${diferencaDoOtimismo < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {formatCurrency(Math.abs(diferencaDoOtimismo))}</span>. É o tamanho do otimismo de contar com o prazo prometido.
                    </p>
                )}
            </Cartao>

            {/* ── PERGUNTA 2: se sustenta? ── */}
            <div className="flex items-center gap-2 pt-2">
                <Scale size={14} className="text-amber-500" />
                <h2 className="text-[11px] font-black text-white uppercase tracking-widest">A operação se sustenta?</h2>
                <InfoTooltip>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Estrutura, não caixa</p>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                        Pergunta se a margem cobre o custo fixo, independente de quem pagou quando. Em
                        <strong className="text-zinc-200"> regime de competência</strong>: a receita é a das
                        <strong className="text-zinc-200"> vendas</strong> do mês e o custo variável é o
                        <strong className="text-zinc-200"> daquelas mesmas peças</strong> — não das parcelas que vencem
                        no período. Uma venda em 3× conta inteira no mês em que foi feita, casada com o próprio custo.
                    </p>
                </InfoTooltip>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Kpi label="Vendas do mês" valor={formatCurrency(pe.receita)} tom="zinc"
                    dica="Valor das peças vendidas no mês (competência), não das parcelas que vencem nele." />
                <Kpi label="Margem de contribuição" valor={formatCurrency(pe.margemContribuicao)}
                    sub={`${pe.margemContribuicaoPct}% da receita`}
                    tom={pe.margemContribuicao > 0 ? 'emerald' : 'rose'}
                    dica="Vendas do mês menos o custo variável DAQUELAS peças (custo unitário da ficha × quantidade). É o que sobra para pagar o custo fixo." />
                <Kpi label="Custo fixo" valor={formatCurrency(pe.custoFixo)} tom="zinc" />
                <Kpi label="Lucro do mês" valor={formatCurrency(pe.lucro)}
                    sub={`margem de ${pe.margemDeLucroPct}%`}
                    tom={pe.lucro > 0 ? 'emerald' : 'rose'}
                    dica="Vendas menos custo variável menos custo fixo. A margem é quanto sobra de cada real vendido." />
                <Kpi label="Ponto de equilíbrio"
                    valor={pe.pontoDeEquilibrio === null ? '—' : formatCurrency(pe.pontoDeEquilibrio)}
                    sub={pe.margemDeSeguranca === null ? undefined : `margem de segurança ${pe.margemDeSeguranca}%`}
                    tom={pe.sustenta ? 'emerald' : 'rose'}
                    dica="Quanto precisa faturar no mês para empatar. A margem de segurança diz quanto o faturamento pode cair antes de não pagar as contas." />
            </div>

            {pe.pontoDeEquilibrio === null && pe.receita > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4">
                    <p className="text-[11px] font-black text-rose-400 uppercase tracking-widest mb-1">
                        Não existe volume que resolva
                    </p>
                    <p className="text-[11px] text-zinc-400 font-bold leading-relaxed">
                        Os custos variáveis já consomem toda a receita — cada peça vendida piora o resultado.
                        Por isso não há ponto de equilíbrio a mostrar: vender mais não empata. O que empata é
                        preço ou custo.
                    </p>
                </div>
            )}

            {(pe.receitaSemCustoConhecido > 0 || pe.variavelForaDaFicha > 0) && (
                <div className={`${CARTAO} p-4 space-y-2`}>
                    <p className={ROTULO}>Onde a margem pode estar otimista</p>
                    {pe.receitaSemCustoConhecido > 0 && (
                        <p className="text-[11px] text-zinc-400 font-bold leading-relaxed">
                            <span className="font-mono text-amber-400">{formatCurrency(pe.receitaSemCustoConhecido)}</span> em
                            vendas de produtos <strong className="text-zinc-300">sem custo na ficha técnica</strong>. Essa parte
                            entrou na receita com custo variável zero, então a margem de contribuição está mais alta do que a real.
                        </p>
                    )}
                    {pe.variavelForaDaFicha > 0 && (
                        <p className="text-[11px] text-zinc-400 font-bold leading-relaxed">
                            As contas variáveis do mês somam <span className="font-mono text-zinc-300">{formatCurrency(pe.variaveisLancadas)}</span>,
                            mas o custo das peças vendidas dá <span className="font-mono text-zinc-300">{formatCurrency(pe.custoVariavel)}</span> —
                            uma diferença de <span className="font-mono text-amber-400">{formatCurrency(pe.variavelForaDaFicha)}</span>.
                            Pode ser custo variável que existe e não está na ficha (frete, comissão), ou compra de estoque para os
                            próximos meses. Só o primeiro caso derruba a margem.
                        </p>
                    )}
                </div>
            )}

            {/* Revisão — o custo já entrou como variável; aqui se corrige o que
                era fixo e ninguém marcou. Nada fica fora da conta. */}
            {v.paraRevisar.length > 0 && (
                <Cartao titulo="Conferir se é fixo"
                    subtitulo="Categorias que entraram como variáveis sem ninguém ter confirmado">
                    <p className="text-[11px] text-zinc-400 font-bold leading-relaxed mb-3">
                        Toda despesa do mês está na conta. Estas categorias ainda não foram revisadas e por
                        isso contam como <b className="text-zinc-300">variáveis</b> — se alguma delas for fixa,
                        o custo fixo está menor do que o real e o ponto de equilíbrio, otimista.
                    </p>
                    <div className="space-y-1.5">
                        {v.paraRevisar.map(c => (
                            <div key={c.id} className={`flex items-center justify-between gap-3 ${ITEM} px-3 py-2 flex-wrap`}>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-zinc-200 truncate">{c.nome}</p>
                                    <p className="text-[10px] font-mono text-zinc-600">{formatCurrency(c.valor)} no mês</p>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                    <button disabled={v.salvando}
                                        onClick={() => v.classificar(c.id, 'fixo')}
                                        title="Sai todo mês independente da produção"
                                        className={BOTAO_SUAVE}>
                                        É custo fixo
                                    </button>
                                    <button disabled={v.salvando}
                                        onClick={() => v.classificar(c.id, 'variavel')}
                                        title="Confirmar que acompanha a produção"
                                        className={BOTAO_SECUNDARIO}>
                                        Confirmar variável
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-[10px] text-zinc-600 font-bold mt-3 leading-relaxed">
                        <Lock size={14} className="inline mb-0.5" /> Fixo é o que sai todo mês independente de quanto você produz
                        (aluguel, folha, contador). Variável cresce com a produção (tecido, aviamento, comissão).
                        A escolha vale para a categoria inteira e para todas as contas dela.
                    </p>
                </Cartao>
            )}
        </div>
    );
}
