import { useState } from 'react';
import { RefreshCw, PackageCheck, Eye } from 'lucide-react';
import { usePcpProduction, ProdOrderRow } from '@/hooks/pcp/usePcpProduction';
import { BaixaModal } from './BaixaModal';
import { OrderPreviewModal } from '@/components/orders/OrderPreviewModal';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { msgEntregaParcial } from '@/utils/mensagensCliente';
import { ROTULO, ITEM, BOTAO_SUAVE, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

export function ProductionControlPanel({ semFinanceiro = false }: { semFinanceiro?: boolean }) {
    const ctl = usePcpProduction();
    const [baixa, setBaixa] = useState<ProdOrderRow | null>(null);
    const [gravandoBaixa, setGravandoBaixa] = useState(false);
    const [erroBaixa, setErroBaixa] = useState('');
    const [versaoBaixa, setVersaoBaixa] = useState(0);
    const [preview, setPreview] = useState<ProdOrderRow | null>(null);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <p className={ROTULO}>Baixas parciais — saldo por pedido</p>
                <button onClick={ctl.reload} aria-label="Recarregar" title="Recarregar" className={`${BOTAO_SECUNDARIO} ml-auto w-10 px-0`}>
                    <RefreshCw size={18} className={ctl.busy || ctl.loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {ctl.error && <div className="text-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl"><p className="text-xs text-rose-400 font-bold">{ctl.error}</p></div>}

            {ctl.loading ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>
            ) : ctl.rows.length === 0 ? (
                <div className="text-center py-16 text-[11px] font-black text-zinc-600 uppercase tracking-widest">Nenhum pedido ativo</div>
            ) : (
                <div className="space-y-3">
                    {ctl.rows.map((row) => {
                        const { order, progress, client_name, client_contact } = row;
                        return (
                        <div key={order.id} className={`${ITEM} p-3`}>
                            {/* Celular: duas linhas (pedido e cliente / contagem e botões). Numa linha só,
                                o lado direito não encolhe e o número do pedido escrevia por cima do cliente. */}
                            <div className="flex flex-col gap-2 mb-1.5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                                    <button onClick={() => setPreview(row)} title="Ver pedido"
                                        className="text-xs font-black text-white hover:text-amber-400 transition-colors shrink-0">
                                        #{order.order_number}
                                    </button>
                                    <span className="text-[11px] text-zinc-300 font-bold truncate max-w-full">{client_name || 'Cliente'}</span>
                                    {client_contact && <span className="text-[11px] text-zinc-500 truncate">· {client_contact}</span>}
                                    <span className="text-[11px] text-zinc-500 font-bold truncate">· {order.production_stage || '—'}</span>
                                </div>
                                <div className="flex items-center gap-3 sm:shrink-0">
                                    <span className="mr-auto text-[11px] font-mono text-zinc-400 sm:mr-0">
                                        {progress.done}/{progress.total_pieces} pç · resta <span className="text-amber-400 font-bold">{progress.remaining}</span>
                                        {progress.expedited > 0 && <span className="text-emerald-400"> · exp {progress.expedited}</span>}
                                    </span>
                                    {/* Só aparece quando há peça expedida — a mensagem
                                        lista exatamente o que saiu, montada a partir dos
                                        saldos por item. Sem expedição não há o que avisar. */}
                                    <BotaoMensagem
                                        compacto
                                        titulo="Avisar entrega parcial"
                                        telefone={row.client?.phone}
                                        texto={(() => {
                                            const saiu = ctl.saldosDoPedido(row.order)
                                                .filter(s => s.expedido > 0)
                                                .map(s => ({
                                                    descricao: [s.produto, s.cor, s.tamanho].filter(Boolean).join(' · '),
                                                    quantidade: s.expedido,
                                                }));
                                            return saiu.length === 0 ? '' : msgEntregaParcial(
                                                row.client || { company_name: row.client_name },
                                                row.order, saiu,
                                            );
                                        })()}
                                    />
                                    <button onClick={() => setPreview(row)} title="Ver pedido completo" aria-label="Ver pedido completo"
                                        className={`${BOTAO_SECUNDARIO} w-10 px-0`}>
                                        <Eye size={18} />
                                    </button>
                                    <button onClick={() => setBaixa(row)} aria-label="Baixa parcial" className={BOTAO_SUAVE}>
                                        <PackageCheck size={14} /> Baixa
                                    </button>
                                </div>
                            </div>
                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, progress.pct)}%` }} />
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            {preview && (
                <OrderPreviewModal
                    order={preview.order}
                    client={preview.client}
                    companyProfile={ctl.companyProfile}
                    onClose={() => setPreview(null)}
                    onPrint={() => window.print()}
                    isFactoryMode={semFinanceiro}
                />
            )}

            {baixa && (() => {
                const saldos = ctl.saldosDoPedido(baixa.order);
                const semItem = ctl.baixaSemItem(baixa.order.id);
                const total = saldos.reduce((t, s) => t + s.total, 0);
                const resta = Math.max(0, total - saldos.reduce((t, s) => t + s.feito, 0) - semItem);
                return (
                    <BaixaModal
                        // Mesmo padrão do Quadro: a janela só remonta quando uma falha deixou parte
                        // gravada (campos zeram, saldo já relido). Remontar a cada lançamento apagava
                        // o que estava digitado no meio do laço.
                        key={`${baixa.order.id}-${versaoBaixa}`}
                        titulo={`#${baixa.order.order_number} · resta ${resta} de ${total} pç`}
                        sectors={ctl.sectors}
                        busy={gravandoBaixa || ctl.busy}
                        aviso={erroBaixa}
                        saldos={saldos}
                        semItem={semItem}
                        onConfirm={async (lancamentos) => {
                            // Um log por peça: cada linha do pedido tem seu próprio lançamento
                            // imutável, que é o que permite reconstruir o que saiu em cada entrega.
                            setGravandoBaixa(true);
                            let feitos = 0;
                            try {
                                for (const l of lancamentos) {
                                    await ctl.logProduction({ order_id: baixa.order.id, ...l });
                                    feitos++;
                                }
                                setBaixa(null);
                                setErroBaixa('');
                            } catch (e) {
                                if (feitos > 0) {
                                    setVersaoBaixa(v => v + 1);
                                    setErroBaixa(`Não consegui gravar toda a baixa do pedido #${baixa.order.order_number}. O que entrou já está no saldo: confira antes de lançar de novo.`);
                                }
                                throw e;
                            } finally {
                                setGravandoBaixa(false);
                            }
                        }}
                        onClose={() => { setBaixa(null); setErroBaixa(''); }}
                    />
                );
            })()}
        </div>
    );
}
