import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Users, Package, Hammer, TrendingUp } from 'lucide-react';
import { storageService } from '@/services/storage';
import { comprasRepository } from '@/repositories/comprasRepository';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { mapaDeReferencia } from '@/utils/tabelaVerdade';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { getTodayStr } from '@/utils/date';
import { mesAnterior, mesDe, nomeDoMes, nomeDoTrimestre, proximoMes, trimestreDe } from '@/utils/financas/base';
import { numero, percentual } from '@/utils/numeros';
import { lucroPorPedido } from '@/utils/financas/lucroPorPedido';
import type { PedidoParaLucro } from '@/utils/financas/lucroPorPedido';
import type { ContaResumo } from '@/utils/financas/base';
import type { PLBomLine, PLInsumo } from '@/utils/purchaseList';
import type { CustoVinculado } from '@/utils/fabrica/vinculado';
import { Indicador } from '@/components/finance/ui/Indicador';
import { CARTAO, ROTULO, ROTULO_PEQUENO, pilula } from '@/components/finance/ui/estilo';

interface Dados {
    pedidos: PedidoParaLucro[];
    contas: ContaResumo[];
    fichas: Map<string, PLBomLine[]>;
    insumos: Map<string, PLInsumo>;
    clientes: Map<string, string>;
    vinculado: Map<string, Map<string, CustoVinculado>>;
    ultimoPreco: Map<string, number>;
    /** Custo de referência da tabela verdade por insumo (v3.1): entre o pago no pedido e a última compra. */
    referencia: Map<string, number>;
    /** Alíquota sobre a venda, 0..1 (perfil da empresa guarda em %). null = não cadastrada. */
    aliquota: number | null;
}

const rotuloDaOrigem = (o: string) => (o === 'tabela' ? 'tabela de preços' : o);

const th = `px-3 py-2.5 whitespace-nowrap ${ROTULO_PEQUENO}`;
const td = 'px-3 py-2.5 text-xs whitespace-nowrap tabular-nums';
const fmtDia = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Lucro de cada pedido entregue no período: valor − material (ficha) − mão de obra (folha ÷ peças). */
export function LucroPorPedido() {
    const { mostrar } = useMostrarValor();
    const [mes, setMes] = useState(mesDe(getTodayStr()));
    const [porTrimestre, setPorTrimestre] = useState(false);
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState('');

    useEffect(() => {
        let vivo = true;
        (async () => {
            const [pedidos, contas, insumos, clientes, perfil] = await Promise.all([
                storageService.getOrders(), storageService.getObligations(), storageService.getInsumos(), storageService.getClients(),
                storageService.getCompanyProfile(),
            ]);
            const entregues = pedidos.filter(p => p.status === 'Entregue');
            // Ficha lida à risca: falha aqui lança, em vez de virar "produto sem ficha" e um lucro inventado.
            const [fichas, vinculado, ultimoPreco, catalogo, comFaixa] = await Promise.all([
                comprasRepository.fichasDoPedidoEstrito(entregues.flatMap(p => (p.items || []).map(i => i.product_id))),
                // Preço que o pedido pagou e último preço de compra: compra vinculada não mexe no custo médio.
                comprasRepository.custoVinculadoPorPedido(entregues.filter(p => !p.compras_legado).map(p => p.id)),
                comprasRepository.ultimoPrecoPorInsumo(),
                tabelaVerdadeRepository.catalogo(),
                tabelaVerdadeRepository.insumosComFaixa(),
            ]);
            if (!vivo) return;
            setDados({
                pedidos: entregues as unknown as PedidoParaLucro[],
                contas: contas as unknown as ContaResumo[],
                fichas,
                insumos: new Map(insumos.map(i => [i.id, {
                    id: i.id, name: i.name, unit: i.unit, current_stock: 0,
                    average_unit_cost: Number(i.average_unit_cost) || 0, category: i.category,
                }])),
                clientes: new Map(clientes.map(c => [c.id, c.company_name])),
                vinculado,
                ultimoPreco,
                referencia: mapaDeReferencia(catalogo, comFaixa, getTodayStr()),
                aliquota: Number(perfil?.default_tax_rate) > 0 ? Number(perfil?.default_tax_rate) / 100 : null,
            });
        })().catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui calcular o lucro por pedido.'); });
        return () => { vivo = false; };
    }, []);

    const meses = porTrimestre ? trimestreDe(mes) : [mes];
    const passo = porTrimestre ? 3 : 1;
    const andar = (n: number) => { let r = mes; for (let i = 0; i < passo; i++) r = n < 0 ? mesAnterior(r) : proximoMes(r); setMes(r); };
    const rotulo = porTrimestre ? nomeDoTrimestre(mes) : nomeDoMes(mes);
    const chave = meses.join(',');
    const r = useMemo(() => (dados ? lucroPorPedido({ ...dados, meses }) : null), [dados, chave]);

    const margemTotal = r && r.resumo.valor > 0 ? (r.resumo.lucro / r.resumo.valor) * 100 : null;

    return (
        <section className={`${CARTAO} p-5 space-y-4`} aria-label="Lucro por pedido">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={`flex items-center gap-2 ${ROTULO}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Lucro por pedido
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setPorTrimestre(false)} aria-pressed={!porTrimestre} className={pilula(!porTrimestre)}>Mês</button>
                    <button type="button" onClick={() => setPorTrimestre(true)} aria-pressed={porTrimestre} className={pilula(porTrimestre)}>Trimestre</button>
                    <span className="flex items-center rounded-xl border border-zinc-800 bg-zinc-950/50">
                        <button type="button" onClick={() => andar(-1)} className="h-9 w-9 text-zinc-400 hover:text-white" aria-label="Período anterior"><ChevronLeft size={18} className="mx-auto" /></button>
                        <span className="min-w-32 text-center text-[10px] font-black uppercase tracking-widest text-zinc-200">{rotulo}</span>
                        <button type="button" onClick={() => andar(1)} className="h-9 w-9 text-zinc-400 hover:text-white" aria-label="Próximo período"><ChevronRight size={18} className="mx-auto" /></button>
                    </span>
                </div>
            </div>

            {erro && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erro}</p>}
            {!erro && !r && <p className="text-sm text-zinc-500">Calculando…</p>}

            {r && (
                <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Indicador icone={Users} rotulo="Folha do período" valor={mostrar(r.resumo.folha)} sub="salários, INSS, FGTS e 13º · pelo vencimento" />
                        <Indicador icone={Package} rotulo="Peças entregues" valor={numero(r.resumo.pecas, 0)} sub={`${numero(r.linhas.length, 0)} pedidos entregues`} />
                        <Indicador icone={Hammer} rotulo="Mão de obra por peça" valor={r.resumo.maoDeObraPorPeca === null ? '—' : mostrar(r.resumo.maoDeObraPorPeca)} sub="folha ÷ peças entregues" />
                        <Indicador icone={TrendingUp} rotulo="Lucro dos pedidos" valor={mostrar(r.resumo.lucro)} tom={r.resumo.lucro < 0 ? 'rose' : 'emerald'}
                            sub={[margemTotal === null ? '' : `margem ${percentual(margemTotal, 1)}`, r.resumo.pedidosIncompletos ? `${numero(r.resumo.pedidosIncompletos, 0)} com material incompleto` : ''].filter(Boolean).join(' · ')} />
                    </div>

                    {r.resumo.semAliquota && r.linhas.length > 0 && (
                        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-400">
                            Sem alíquota de imposto em Cadastros › Empresa: o lucro abaixo está sem imposto.
                        </p>
                    )}
                    {r.resumo.semFolha && (
                        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-400">
                            Nenhuma conta de folha vence neste período: o lucro abaixo está sem mão de obra.
                        </p>
                    )}

                    {r.linhas.length === 0 ? (
                        <p className="text-sm text-zinc-500">Nenhum pedido entregue em {rotulo.toLowerCase()}.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-zinc-800">
                            <table className="w-full text-left">
                                <thead className="bg-zinc-950/60">
                                    <tr>
                                        <th className={th}>Pedido</th>
                                        <th className={th}>Cliente</th>
                                        <th className={th}>Entregue</th>
                                        <th className={`${th} text-right`}>Peças</th>
                                        <th className={`${th} text-right`}>Valor</th>
                                        <th className={`${th} text-right`}>Material</th>
                                        <th className={`${th} text-right`}>Mão de obra</th>
                                        <th className={`${th} text-right`}>Imposto</th>
                                        <th className={`${th} text-right`}>Lucro</th>
                                        <th className={`${th} text-right`}>Margem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/60">
                                    {r.linhas.map(l => (
                                        <tr key={l.id}>
                                            <td className={`${td} font-mono font-bold text-zinc-200`}>{l.numero}</td>
                                            <td className={`${td} max-w-48 truncate text-zinc-300`}>{(l.clienteId && dados?.clientes.get(l.clienteId)) || '—'}</td>
                                            <td className={`${td} text-zinc-400`}>{fmtDia(l.entregueEm)}</td>
                                            <td className={`${td} text-right text-zinc-300`}>{numero(l.pecas, 0)}</td>
                                            <td className={`${td} text-right font-mono text-zinc-200`}>{mostrar(l.valor)}</td>
                                            <td className={`${td} text-right font-mono ${l.completo ? 'text-zinc-400' : 'text-amber-400'}`}
                                                title={[l.origens.length ? `preço: ${l.origens.map(rotuloDaOrigem).join(' · ')}` : '', ...l.faltas].filter(Boolean).join(' · ') || undefined}>
                                                {mostrar(l.material)}
                                                {l.origens.some(o => o !== 'custo médio') && <span className="block text-[10px] font-bold text-zinc-600">{l.origens.filter(o => o !== 'custo médio').map(rotuloDaOrigem).join(' · ')}</span>}
                                                {!l.completo && <span className="block text-[10px] font-bold">{l.faltas.join(' · ')}</span>}
                                            </td>
                                            <td className={`${td} text-right font-mono text-zinc-400`}>{mostrar(l.maoDeObra)}</td>
                                            <td className={`${td} text-right font-mono text-zinc-400`}>{mostrar(l.imposto)}</td>
                                            <td className={`${td} text-right font-mono font-black ${l.lucro < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                {!l.completo && <span className="mr-1 text-[10px] font-bold text-amber-400">até</span>}{mostrar(l.lucro)}
                                            </td>
                                            <td className={`${td} text-right font-bold ${l.margem !== null && l.margem < 0 ? 'text-rose-400' : 'text-zinc-300'}`}>
                                                {l.margem === null ? '—' : percentual(l.margem, 1)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-[10px] font-bold text-zinc-600">
                        Material pela ficha técnica × peças, ao preço que o pedido pagou (compra vinculada), senão o último preço de compra, senão o custo médio. Mão de obra: folha do período dividida pelas peças entregues nele. Imposto: valor × alíquota de Cadastros › Empresa.
                        &quot;Até&quot; = falta ficha ou custo de insumo, e o lucro real é menor que o mostrado.
                    </p>
                </>
            )}
        </section>
    );
}
