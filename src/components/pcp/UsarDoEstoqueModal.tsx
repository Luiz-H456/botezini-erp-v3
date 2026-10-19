import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { comprasRepository } from '@/repositories/comprasRepository';
import { useEscFecha } from '@/hooks/useEscFecha';
import { parseBRL } from '@/utils/currency';
import { numero } from '@/utils/numeros';
import { CARTAO, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

interface Props {
    insumo: { id: string; name: string; unit: string; current_stock: number };
    pedidos: { id: string; order_number: string; falta?: number }[];
    onClose: () => void;
    onDone: () => void;
}

/** Tira do estoque (sobras guardadas) e vincula a um pedido: `usar_do_estoque`. */
export function UsarDoEstoqueModal({ insumo, pedidos, onClose, onDone }: Props) {
    const [pedidoId, setPedidoId] = useState(pedidos[0]?.id ?? '');
    // Sem `falta` conhecida (quem chama não sabe) não há o que sugerir: o campo começa vazio.
    const sugerida = (id: string) => {
        const falta = pedidos.find(p => p.id === id)?.falta;
        return falta ? numero(Math.round(Math.min(falta, insumo.current_stock) * 1000) / 1000) : '';
    };
    const [quantidade, setQuantidade] = useState(() => sugerida(pedidos[0]?.id ?? ''));
    const [gravando, setGravando] = useState(false);
    const [erro, setErro] = useState('');

    const q = parseBRL(quantidade);
    const podeUsar = !!pedidoId && q > 0 && !gravando;

    const fechar = () => { if (!gravando) onClose(); };
    useEscFecha(true, fechar);

    const usar = async () => {
        if (!podeUsar) return;
        setGravando(true); setErro('');
        try {
            await comprasRepository.usarDoEstoque(pedidoId, insumo.id, q);
            onDone();
        } catch (e: any) {
            setErro(e?.message || 'Falha ao usar do estoque');
            setGravando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-modal bg-zinc-950/70 flex items-center justify-center p-4" onClick={fechar}>
            <div role="dialog" aria-modal="true" aria-label="Usar do estoque"
                className={`${CARTAO} max-w-md w-full max-h-[85vh] flex flex-col`}
                onClick={e => e.stopPropagation()}>
                <div className="shrink-0 flex items-start gap-3 px-5 pt-5 pb-3">
                    <div className="flex-1 min-w-0">
                        <p className={ROTULO}>Usar do estoque</p>
                        <p className="text-sm font-bold text-zinc-200 mt-1 truncate">{insumo.name}</p>
                    </div>
                    <button type="button" aria-label="Fechar" title="Fechar" onClick={fechar}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2 space-y-4">
                    <p className="text-xs font-mono text-zinc-400">
                        Em estoque: <span className="text-white font-bold">{numero(insumo.current_stock)} {insumo.unit}</span>
                    </p>
                    {pedidos.length === 0 && (
                        <p className="text-[11px] font-bold text-amber-400">Nenhum pedido ativo para receber do estoque.</p>
                    )}
                    <label className="flex flex-col gap-1">
                        <span className={ROTULO_PEQUENO}>Pedido</span>
                        <select className={`${CAMPO} w-full`} value={pedidoId} disabled={gravando}
                            onChange={e => { setPedidoId(e.target.value); setQuantidade(sugerida(e.target.value)); }}>
                            {pedidos.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.order_number}{p.falta ? ` · falta ${numero(p.falta)} ${insumo.unit}` : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className={ROTULO_PEQUENO}>Quantidade ({insumo.unit})</span>
                        <input className={`${CAMPO} w-full`} inputMode="decimal" value={quantidade} disabled={gravando}
                            onChange={e => setQuantidade(e.target.value)} />
                    </label>
                    {q > insumo.current_stock && (
                        <p className="text-[11px] font-bold text-amber-400">Mais do que há em estoque: o banco pode recusar.</p>
                    )}
                    {erro && <p className="text-[11px] font-bold text-rose-400">{erro}</p>}
                </div>

                <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-800">
                    <button type="button" onClick={fechar} disabled={gravando} className={BOTAO_SECUNDARIO}>Cancelar</button>
                    <button type="button" onClick={usar} disabled={!podeUsar} className={BOTAO_PRINCIPAL}>
                        {gravando ? 'Usando…' : 'Usar'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
