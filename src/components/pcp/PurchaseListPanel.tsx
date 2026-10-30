import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShoppingCart, RefreshCw, AlertTriangle, Package, FileDown, PackagePlus, X } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils';
import { InfoTooltip, ConfirmDialog, MenuMais } from '@/components/common';
import { usePurchaseList, WeekFilter } from '@/hooks/pcp/usePurchaseList';
import { pdfService } from '@/services/pdfService';
import { comprasRepository } from '@/repositories/comprasRepository';
import type { Compra } from '@/types';
import type { PurchaseLine } from '@/utils/purchaseList';
import { numero } from '@/utils/numeros';
import { reais } from '@/utils/financas/base';
import { agruparItensDaCompra, semanaDe, totalDaCompra } from '@/utils/fabrica/lancarCompra';
import { LancarCompraModal } from './LancarCompraModal';
import { UsarDoEstoqueModal } from './UsarDoEstoqueModal';
import { EntreguesSemSobra } from './EntreguesSemSobra';
import { CARTAO, ITEM, ROTULO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, BOTAO_SUAVE, pilula } from '@/components/finance/ui/estilo';
import type { View } from '@/utils/navegacao';

import { mensagemDeErro } from '@/utils/errorHandling';
const FILTERS: { value: WeekFilter; label: string }[] = [
    { value: 'open', label: 'Em aberto' },
    { value: 'this_week', label: 'Esta semana' },
    { value: 'next_week', label: 'Próxima semana' },
];

export function PurchaseListPanel({ onIrPara, filtroInicial }: { onIrPara?: (v: View) => void; filtroInicial?: WeekFilter }) {
    const pl = usePurchaseList(filtroInicial);
    const { result } = pl;
    const shortageCount = result.lines.filter(l => l.is_shortage).length;
    const [pdfError, setPdfError] = useState('');
    const [lancando, setLancando] = useState(false);
    const [usando, setUsando] = useState<PurchaseLine | null>(null);
    const [avisoOk, setAvisoOk] = useState('');
    const [erroTela, setErroTela] = useState('');
    // Erro da exclusão aparece na seção das compras, onde a pessoa está olhando.
    const [erroCompras, setErroCompras] = useState('');
    const [compras, setCompras] = useState<Compra[]>([]);
    const [excluindo, setExcluindo] = useState<Compra | null>(null);
    const [excluindoBusy, setExcluindoBusy] = useState(false);

    const carregarCompras = useCallback(async () => {
        const { de, ate } = semanaDe(new Date());
        try { setCompras(await comprasRepository.comprasDoPeriodo(de, ate)); }
        catch (e: any) { setErroTela(`Não consegui ler as compras desta semana: ${mensagemDeErro(e, 'falha')}`); }
    }, []);
    useEffect(() => { carregarCompras(); }, [carregarCompras]);

    const insumoPorId = useMemo(() => new Map(pl.insumos.map(i => [i.id, i])), [pl.insumos]);
    const nomeDoFornecedor = (c: Compra) =>
        c.fornecedor_nome || pl.suppliers.find(s => s.id === c.fornecedor_id)?.company_name || 'Sem fornecedor';

    const depoisDeGravar = (msg: string) => {
        setAvisoOk(msg); setErroTela(''); setErroCompras('');
        pl.reload(); carregarCompras();
    };

    const excluirCompra = async () => {
        if (!excluindo) return;
        setExcluindoBusy(true);
        try {
            await comprasRepository.excluirCompra(excluindo.id);
            setExcluindo(null);
            depoisDeGravar('Compra excluída');
        } catch (e: any) {
            // A recusa do banco (pedido já entregue, estoque já usado) vem explicada na mensagem.
            setExcluindo(null);
            setAvisoOk('');
            setErroCompras(mensagemDeErro(e, 'Falha ao excluir a compra'));
        } finally {
            setExcluindoBusy(false);
        }
    };

    const filterLabel = FILTERS.find(f => f.value === pl.filter)?.label || '';

    // Sem custo cadastrado o total sai R$ 0,00 mesmo havendo falta — parece
    // defeito, mas é insumo com custo zerado. Vale avisar em vez de deixar o
    // usuário achar que a conta está errada.
    const semCusto = result.lines.filter(l => l.is_shortage && l.unit_cost <= 0);

    const exportarPdf = () => {
        setPdfError('');
        try {
            pdfService.generatePurchaseListPDF(result.lines, filterLabel, result.total_cost);
        } catch (e: any) {
            // Sem isto a exceção sobe pro handler do React e vira tela de erro.
            setPdfError(mensagemDeErro(e, 'Falha ao gerar o PDF'));
            console.error('generatePurchaseListPDF:', e);
        }
    };

    return (
        <div className="space-y-5">
            {erroTela && (
                <div className="flex items-start gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-bold text-rose-300 flex-1">{erroTela}</span>
                    <button type="button" aria-label="Fechar aviso" title="Fechar aviso" onClick={() => setErroTela('')}
                        className={`${BOTAO_SECUNDARIO} w-10 px-0`}><X size={18} /></button>
                </div>
            )}
            {avisoOk && (
                <div className={`${ITEM} flex items-center gap-3 px-4 py-2.5 text-emerald-400`}>
                    <span className="text-[11px] font-bold flex-1">{avisoOk}</span>
                    <button type="button" aria-label="Fechar aviso" title="Fechar aviso" onClick={() => setAvisoOk('')}
                        className={`${BOTAO_SECUNDARIO} w-10 px-0`}><X size={18} /></button>
                </div>
            )}
            {/* Barra de controle */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex flex-wrap items-center gap-1">
                    {FILTERS.map(f => (
                        <button key={f.value} type="button" onClick={() => pl.setFilter(f.value)} className={pilula(pl.filter === f.value)}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={pl.reload} title="Recarregar" aria-label="Recarregar"
                    className={`${BOTAO_SECUNDARIO} w-10 px-0`}>
                    <RefreshCw size={18} className={pl.loading || pl.recarregando ? 'animate-spin' : ''} />
                </button>
                <div className="ml-auto flex items-center gap-3">
                    {/* Enquanto recarrega, as linhas na tela são as de antes da compra: reabrir lançaria em dobro. */}
                    <button type="button" onClick={() => setLancando(true)} disabled={pl.loading || pl.recarregando} className={BOTAO_PRINCIPAL}>
                        <PackagePlus size={14} /> Lançar compra
                    </button>
                    <button type="button" onClick={exportarPdf} disabled={result.lines.length === 0} className={BOTAO_SUAVE}>
                        <FileDown size={14} /> Exportar PDF
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Kpi label="Total a comprar (estimado)" value={formatCurrency(result.total_cost)} tone="amber" icon={ShoppingCart}
                    info={<>
                        <p className="text-[11px] font-black text-white mb-1">Como o total é calculado</p>
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                            Para cada pedido em aberto, multiplica a ficha técnica do produto pela
                            quantidade e soma o consumo por insumo. A lista mostra o que falta depois do
                            que já foi comprado e vinculado a cada pedido, valorizado pelo <b>custo médio
                            de compra</b> cadastrado. O estoque (sobras) aparece ao lado, mas não reduz o que falta.
                        </p>
                        <p className="text-[10px] text-zinc-400 leading-relaxed mt-1.5">
                            Se o item do pedido escolheu um tecido diferente do da ficha, o consumo migra
                            para o tecido escolhido.
                        </p>
                        <p className="text-[10px] text-amber-500/90 leading-relaxed mt-1.5">
                            É estimativa: insumo com custo zerado entra com valor zero, e produto sem ficha
                            técnica fica de fora do cálculo.
                        </p>
                    </>} />
                <Kpi label="Pedidos considerados" value={String(result.orders_count)} tone="zinc" icon={Package} />
                <Kpi label="Insumos em falta" value={String(shortageCount)} tone={shortageCount > 0 ? 'rose' : 'emerald'} icon={AlertTriangle} />
            </div>

            {pl.avisoVinculo && (
                <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-bold text-amber-300/90">{pl.avisoVinculo}</span>
                </div>
            )}

            {pl.error && (
                <div className="text-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <p className="text-xs text-rose-400 font-bold">{pl.error}</p>
                </div>
            )}

            {pdfError && (
                <div className="flex items-start gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-bold text-rose-300">
                        Falha ao gerar o PDF: {pdfError}
                        <span className="block text-zinc-500 font-medium mt-0.5">
                            A lista na tela continua válida. Detalhes técnicos no console do navegador.
                        </span>
                    </span>
                </div>
            )}

            {semCusto.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-2.5 bg-sky-500/5 border border-sky-500/20 rounded-xl">
                    <AlertTriangle size={15} className="text-sky-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-bold text-sky-300/90">
                        {semCusto.length} insumo(s) em falta estão com <b>custo zerado</b> no cadastro, então
                        não entram no total estimado:{' '}
                        <span className="text-zinc-400">{semCusto.map(l => l.insumo_name).join(', ')}</span>.
                        O total abaixo está subestimado até você lançar o custo de compra deles.{' '}
                        {onIrPara && <button type="button" onClick={() => onIrPara('inventory')} className="underline font-black">Abrir Estoque</button>}
                    </span>
                </div>
            )}

            {/* Aviso: produtos sem ficha técnica (ignorados no cálculo) */}
            {result.products_without_bom.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-bold text-amber-300/90">
                        {result.products_without_bom.length} produto(s) sem ficha técnica foram ignorados no cálculo:{' '}
                        <span className="text-zinc-400">
                            {result.products_without_bom.map(id => pl.productNames.get(id) || id).join(', ')}
                        </span>. Cadastre a ficha técnica para incluí-los.{' '}
                        {onIrPara && <button type="button" onClick={() => onIrPara('produtos')} className="underline font-black">Cadastrar ficha</button>}
                    </span>
                </div>
            )}

            {/* Tabela */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
                {pl.loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                    </div>
                ) : result.lines.length === 0 ? (
                    <div className="text-center py-16 text-[11px] font-black text-zinc-600 uppercase tracking-widest">
                        Nenhum consumo previsto para o período
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-zinc-900/60 border-b border-zinc-800">
                                <tr>
                                    <th className="text-left px-4 py-2.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Insumo</th>
                                    <th className="text-right px-4 py-2.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Previsto</th>
                                    <th className="text-right px-4 py-2.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Já comprado</th>
                                    <th className="text-right px-4 py-2.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Falta</th>
                                    <th className="text-right px-4 py-2.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Em estoque</th>
                                    <th className="text-left px-4 py-2.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Pedidos</th>
                                    <th className="px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody>
                                {result.lines.map(l => (
                                    <tr key={l.insumo_id} className={`border-b border-zinc-800/50 ${l.is_shortage ? 'bg-rose-500/5' : ''}`}>
                                        <td className="px-4 py-2.5 text-xs text-zinc-300 font-bold">{l.insumo_name}</td>
                                        <td className="px-4 py-2.5 text-xs font-mono text-right text-zinc-400">{numero(l.needed)} {l.unit}</td>
                                        <td className="px-4 py-2.5 text-xs font-mono text-right text-zinc-500">{l.vinculado > 0 ? `${numero(l.vinculado)} ${l.unit}` : '—'}</td>
                                        <td className={`px-4 py-2.5 text-xs font-mono font-bold text-right ${l.to_buy > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                            {l.to_buy > 0 ? `${numero(l.to_buy)} ${l.unit}` : '—'}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs font-mono text-right text-zinc-400">{l.in_stock > 0 ? `${numero(l.in_stock)} ${l.unit}` : ''}</td>
                                        <td className="px-4 py-2.5 text-[11px] text-zinc-500">
                                            {l.pedidos.map(p => `${p.order_number} (${numero(p.falta)} ${l.unit})`).join(' · ')}
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            {l.in_stock > 0 && l.to_buy > 0 && (
                                                <button type="button" onClick={() => setUsando(l)} disabled={pl.loading || pl.recarregando} className={BOTAO_SUAVE}>Usar do estoque</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Compras desta semana */}
            <div className="space-y-3">
                <p className={ROTULO}>Compras desta semana</p>
                {erroCompras && (
                    <div className="flex items-start gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                        <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                        <span className="text-[11px] font-bold text-rose-300 flex-1">{erroCompras}</span>
                        <button type="button" aria-label="Fechar aviso" title="Fechar aviso" onClick={() => setErroCompras('')}
                            className={`${BOTAO_SECUNDARIO} w-10 px-0`}><X size={18} /></button>
                    </div>
                )}
                {compras.length === 0 ? (
                    <div className={`${ITEM} text-center py-6 text-[11px] font-black text-zinc-600 uppercase tracking-widest`}>
                        Nenhuma compra lançada nesta semana
                    </div>
                ) : compras.map(c => (
                    <div key={c.id} className={`${CARTAO} p-4`}>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-zinc-200 truncate">{nomeDoFornecedor(c)}</p>
                                <p className="text-[10px] font-mono text-zinc-500">{formatDate(c.data)}{c.notas ? ` · ${c.notas}` : ''}</p>
                            </div>
                            <p className="text-sm font-mono font-black text-amber-400">{reais(totalDaCompra(c.itens || []))}</p>
                            <MenuMais rotulo="Mais ações da compra" itens={[
                                { rotulo: 'Excluir compra', perigo: true, onClick: () => setExcluindo(c) },
                            ]} />
                        </div>
                        <ul className="mt-2 space-y-1">
                            {agruparItensDaCompra(c.itens || []).map(g => {
                                const ins = insumoPorId.get(g.insumo_id);
                                return (
                                    <li key={g.insumo_id} className="text-xs text-zinc-400">
                                        <span className="font-bold text-zinc-300">{ins?.name ?? '(insumo)'}</span>{' '}
                                        <span className="font-mono text-zinc-500">
                                            {g.destinos.map(d =>
                                                `${d.pedido_id ? (pl.numerosDosPedidos.get(d.pedido_id) ?? 'Pedido') : 'Estoque'} · ${numero(d.quantidade)} ${ins?.unit ?? ''}`.trim(),
                                            ).join('  |  ')}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>

            <EntreguesSemSobra onApurado={msg => depoisDeGravar(msg)} />

            {lancando && (
                <LancarCompraModal
                    linhas={result.lines} insumos={pl.insumos} suppliers={pl.suppliers} pedidos={pl.pedidosAtivos}
                    onClose={() => setLancando(false)}
                    onDone={() => { setLancando(false); depoisDeGravar('Compra lançada'); }}
                />
            )}
            {usando && (
                <UsarDoEstoqueModal
                    insumo={{ id: usando.insumo_id, name: usando.insumo_name, unit: usando.unit, current_stock: usando.in_stock }}
                    pedidos={usando.pedidos.map(p => ({ id: p.order_id, order_number: p.order_number, falta: p.falta }))}
                    onClose={() => setUsando(null)}
                    onDone={() => { setUsando(null); depoisDeGravar('Estoque usado no pedido'); }}
                />
            )}
            <ConfirmDialog
                isOpen={!!excluindo}
                title="Excluir compra"
                message={excluindo ? `Excluir a compra de ${nomeDoFornecedor(excluindo)} em ${formatDate(excluindo.data)}? O que entrou no estoque por ela é estornado.` : ''}
                variant="danger" confirmLabel="Excluir" isLoading={excluindoBusy}
                onConfirm={excluirCompra} onCancel={() => setExcluindo(null)}
            />
        </div>
    );
}

function Kpi({ label, value, tone, icon: Icon, info }: { label: string; value: string; tone: 'zinc' | 'amber' | 'emerald' | 'rose'; icon: typeof ShoppingCart; info?: React.ReactNode }) {
    const color = { zinc: 'text-zinc-300', amber: 'text-amber-400', emerald: 'text-emerald-400', rose: 'text-rose-400' }[tone];
    return (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} className="text-zinc-600" />
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{label}</p>
                {info && <InfoTooltip>{info}</InfoTooltip>}
            </div>
            <p className={`text-xl font-black font-mono tracking-tighter ${color}`}>{value}</p>
        </div>
    );
}
