import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, ShoppingCart, Truck, ArrowDownLeft } from 'lucide-react';
import { storageService } from '@/services/storage';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { getTodayStr } from '@/utils/date';
import { mesAnterior, mesDe, nomeDoMes, proximoMes } from '@/utils/financas/base';
import { numero, percentual } from '@/utils/numeros';
import { parecerDoMes } from '@/utils/vendas/parecerDoMes';
import type { OrcamentoDoParecer, PedidoDoParecer } from '@/utils/vendas/parecerDoMes';
import type { ContaResumo, PagamentoResumo } from '@/utils/financas/base';
import { Indicador } from '@/components/finance/ui/Indicador';
import { CARTAO, ROTULO } from '@/components/finance/ui/estilo';

interface Dados {
    orcamentos: OrcamentoDoParecer[];
    pedidos: PedidoDoParecer[];
    contas: ContaResumo[];
    pagamentos: PagamentoResumo[];
}

/** "+18% vs set"; sem base no mês anterior, nada. Curto: o cartão corta o que passa da largura. */
const contraAnterior = (v: number | null, mesAnt: string) =>
    v === null ? '' : `${percentual(Math.round(v), 0, true)} vs ${nomeDoMes(mesAnt).slice(0, 3)}`;

const juntar = (...partes: string[]) => partes.filter(Boolean).join(' · ');

/** Parecer das vendas do mês: quatro números e o que eles dizem. Só leitura, um controle (o mês). */
export function ParecerDoMes() {
    const { mostrar } = useMostrarValor();
    const hoje = getTodayStr();
    const [mes, setMes] = useState(mesDe(hoje));
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState('');

    useEffect(() => {
        let vivo = true;
        Promise.all([
            storageService.getBudgets(),
            storageService.getOrders(),
            storageService.getObligations(),
            storageService.getAllPaymentsComTeto(),
        ]).then(([orcamentos, pedidos, contas, pag]) => {
            if (vivo) setDados({ orcamentos, pedidos, contas, pagamentos: pag.pagamentos });
        }, (e: unknown) => {
            if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui carregar o parecer do mês.');
        });
        return () => { vivo = false; };
    }, []);

    const p = useMemo(
        () => (dados ? parecerDoMes({ ...dados, mes, hoje, dinheiro: mostrar }) : null),
        [dados, mes, hoje, mostrar],
    );

    return (
        <section className={`${CARTAO} p-5 space-y-4`} aria-label="Parecer do mês">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={`flex items-center gap-2 ${ROTULO}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Parecer do mês
                </h2>
                <span className="flex items-center rounded-xl border border-zinc-800 bg-zinc-950/50">
                    <button type="button" onClick={() => setMes(mesAnterior(mes))} className="h-9 w-9 text-zinc-400 hover:text-white" aria-label="Mês anterior"><ChevronLeft size={18} className="mx-auto" /></button>
                    <span className="min-w-32 text-center text-[10px] font-black uppercase tracking-widest text-zinc-200">{nomeDoMes(mes)}</span>
                    <button type="button" onClick={() => setMes(proximoMes(mes))} className="h-9 w-9 text-zinc-400 hover:text-white" aria-label="Próximo mês"><ChevronRight size={18} className="mx-auto" /></button>
                </span>
            </div>

            {erro && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erro}</p>}
            {!erro && !p && <p className="text-sm text-zinc-500">Carregando…</p>}

            {p && (
                <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Indicador icone={FileText} rotulo="Orçamentos" valor={mostrar(p.orcamentos.atual.valor)}
                            sub={juntar(`${numero(p.orcamentos.atual.quantidade, 0)} feitos · ${numero(p.orcamentos.atual.viraramPedido, 0)} viraram`, contraAnterior(p.orcamentos.variacao, p.mesAnterior))} />
                        <Indicador icone={ShoppingCart} rotulo="Vendas · pedidos fechados" valor={mostrar(p.vendas.atual.valor)} tom={(p.vendas.variacao ?? 0) < 0 ? 'amber' : 'zinc'}
                            sub={juntar(`${numero(p.vendas.atual.quantidade, 0)} pedidos · ${numero(p.vendas.atual.pecas, 0)} peças`, contraAnterior(p.vendas.variacao, p.mesAnterior))} />
                        <Indicador icone={Truck} rotulo="Entregas" valor={mostrar(p.entregas.atual.valor)}
                            sub={juntar(`${numero(p.entregas.atual.quantidade, 0)} entregues`, contraAnterior(p.entregas.variacao, p.mesAnterior))} />
                        <Indicador icone={ArrowDownLeft} rotulo="Recebimentos" valor={mostrar(p.recebimentos.atual)} tom="emerald"
                            sub={contraAnterior(p.recebimentos.variacao, p.mesAnterior) || 'entrou no caixa'} />
                    </div>
                    <ul className="space-y-1.5">
                        {p.frases.map(f => (
                            <li key={f.texto} className={`flex gap-2 text-sm leading-relaxed ${f.alerta ? 'font-bold text-amber-400' : 'text-zinc-300'}`}>
                                <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${f.alerta ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                                {f.texto}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}
