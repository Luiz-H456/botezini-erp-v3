import { ArrowRight, Wallet, AlertTriangle, Factory, CheckCircle2 } from 'lucide-react';
import { Indicador } from '@/components/finance/ui/Indicador';
import { CARTAO, ITEM, ROTULO, BOTAO_SUAVE } from '@/components/finance/ui/estilo';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import type { DestinoDaFila } from '@/utils/inicio/fila';
import type { View } from '@/utils/navegacao';
import type { useFilaDoInicio } from '@/hooks/inicio/useFilaDoInicio';

interface Props { fila: ReturnType<typeof useFilaDoInicio>; onAbrir: (d: DestinoDaFila) => void; onIrPara: (v: View) => void }

/** O que precisa de você — o Início agrupado por objetivo. */
export default function Inicio({ fila, onAbrir, onIrPara }: Props) {
    const { mostrar } = useMostrarValor();
    const { blocos, resumo, carregando, erro } = fila;
    return (
        <div className="space-y-6">
            <div>
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Início</p>
                <h1 className="mt-1 text-2xl font-black uppercase tracking-tighter text-white">O que precisa de você</h1>
            </div>
            {erro && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erro}</p>}
            {resumo && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Indicador icone={Wallet} rotulo="Livre para usar" valor={mostrar(resumo.livre)} tom={resumo.livre < 0 ? 'rose' : 'zinc'} onClick={() => onIrPara('finance')} />
                    <Indicador icone={AlertTriangle} rotulo="A receber vencido" valor={mostrar(resumo.receberVencido)} tom={resumo.receberVencido > 0 ? 'rose' : 'zinc'} onClick={() => onIrPara('receivables')} />
                    <Indicador icone={Factory} rotulo="Pedidos em produção" valor={String(resumo.emProducao)} onClick={() => onIrPara('quadro')} />
                </section>
            )}
            {carregando && !resumo ? <p className={`${CARTAO} py-10 text-center text-sm text-zinc-500`}>Carregando…</p>
            : blocos.length === 0 && !erro ? (
                <p className={`${CARTAO} flex items-center justify-center gap-2 py-10 text-sm font-bold text-emerald-400`}><CheckCircle2 size={16} /> Nada pendente — bom trabalho</p>
            ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                    {blocos.map(b => (
                        <section key={b.objetivo} className={`${CARTAO} p-4 space-y-2`}>
                            <h2 className={ROTULO}>{b.rotulo}</h2>
                            {b.linhas.map(l => (
                                <div key={l.id} className={`${ITEM} relative flex items-center justify-between gap-3 overflow-hidden py-3 pl-4 pr-3`}>
                                    {l.urgente && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-500" />}
                                    <span className={`min-w-0 text-sm font-bold ${l.urgente ? 'text-rose-300' : 'text-zinc-200'}`}>{l.texto}</span>
                                    <button type="button" aria-label={`${l.acao}: ${l.texto}`} onClick={() => onAbrir(l.destino)} className={`${BOTAO_SUAVE} shrink-0`}>{l.acao} <ArrowRight size={12} /></button>
                                </div>
                            ))}
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
