import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PackageCheck, X, Truck } from 'lucide-react';
import { SearchableSelect } from '@/components/common';
import { parseBRL } from '@/utils/currency';
import type { SaldoItem } from '@/utils/baixaPorItem';
import { ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

export interface Lancamento {
    qty_done: number;
    qty_expedited?: number;
    sector_id?: string;
    operation?: string;
    item_key?: string;
}

/**
 * Baixa por peça.
 *
 * O saldo do pedido dizia "faltam 40", sem dizer de quê. Aqui cada linha do
 * pedido tem seu próprio campo: dá para lançar 18 polos azul claro, 4 azul
 * escuro e nenhuma calça — que é como a entrega parcial acontece de verdade.
 */
export function BaixaModal({ titulo, saldos, semItem, sectors, busy, aviso, onConfirm, onClose }: {
    titulo: string;
    saldos: SaldoItem[];
    semItem: number;
    sectors: { id: string; name: string }[];
    busy: boolean;
    /** Mensagem de quem abriu a janela (ex.: falha parcial que remontou a janela). */
    aviso?: string;
    onConfirm: (lancamentos: Lancamento[]) => Promise<void>;
    onClose: () => void;
}) {
    // Quantidades digitadas, por chave de item.
    const [feito, setFeito] = useState<Record<string, string>>({});
    const [expedido, setExpedido] = useState<Record<string, string>>({});
    const [sectorId, setSectorId] = useState('');
    const [operation, setOperation] = useState('');
    const [error, setError] = useState('');

    const num = (v?: string) => Math.max(0, parseBRL(v || '') || 0);

    const lancamentos: Lancamento[] = saldos
        .map(s => ({
            item_key: s.chave,
            qty_done: num(feito[s.chave]),
            qty_expedited: num(expedido[s.chave]),
            sector_id: sectorId || undefined,
            operation: operation || undefined,
        }))
        .filter(l => l.qty_done > 0 || (l.qty_expedited || 0) > 0);

    const totalFeito = lancamentos.reduce((t, l) => t + l.qty_done, 0);
    const excedeAlgum = saldos.some(s => num(feito[s.chave]) > s.resta);
    const canConfirm = lancamentos.length > 0 && !busy;

    const confirm = async () => {
        if (!canConfirm) return;
        try { await onConfirm(lancamentos); }
        catch (e: any) { setError(e?.message || 'Falha ao lançar'); }
    };

    const preencherTudo = () => {
        // Atalho do "acabou tudo": joga o saldo restante em cada peça.
        const cheio: Record<string, string> = {};
        for (const s of saldos) if (s.resta > 0) cheio[s.chave] = String(s.resta);
        setFeito(cheio);
    };

    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-modal flex items-center justify-center p-4 ease-out animate-in fade-in duration-200" onClick={busy ? undefined : onClose}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col ease-out animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
                    <div>
                        <h3 className="text-white font-black uppercase tracking-tight flex items-center gap-2">
                            <PackageCheck size={16} className="text-emerald-400" /> Registrar baixa
                        </h3>
                        <p className={`${ROTULO} mt-1`}>
                            {titulo}
                        </p>
                    </div>
                    <button onClick={onClose} disabled={busy} aria-label="Fechar" title="Fechar" className={`${BOTAO_SECUNDARIO} w-10 px-0`}><X size={18} /></button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    <div className="flex items-center justify-between gap-2">
                        <p className={ROTULO}>
                            Quanto saiu de cada peça
                        </p>
                        <button type="button" onClick={preencherTudo}
                            className={BOTAO_SECUNDARIO}>
                            Preencher o que falta
                        </button>
                    </div>

                    {saldos.length === 0 ? (
                        <p className="text-[11px] font-black text-zinc-600 uppercase tracking-widest text-center py-6">
                            Este pedido não tem peças cadastradas
                        </p>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-3">
                                <span className={`flex-1 ${ROTULO_PEQUENO}`}>Peça</span>
                                <span className={`w-24 ${ROTULO_PEQUENO} text-center`}>Produzida</span>
                                <span className={`w-24 ${ROTULO_PEQUENO} text-center flex items-center justify-center gap-1`}>
                                    <Truck size={12} /> Expedida
                                </span>
                            </div>
                            {saldos.map(s => {
                                const digitado = num(feito[s.chave]);
                                const excede = digitado > s.resta;
                                const pronto = s.resta === 0;
                                return (
                                    <div key={s.chave}
                                        className={`flex items-center gap-2 px-3 py-2 ${
                                            excede ? 'bg-rose-500/5 border border-rose-500/30 rounded-xl'
                                                : pronto ? 'bg-emerald-500/5 border border-emerald-500/20 rounded-xl'
                                                : ITEM
                                        }`}>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-zinc-200 truncate">
                                                {s.produto}
                                                {s.cor && <span className="text-zinc-400"> · {s.cor}</span>}
                                                {s.tamanho && <span className="text-zinc-600"> · {s.tamanho}</span>}
                                            </p>
                                            <p className="text-[10px] font-mono font-bold text-zinc-600">
                                                {pronto
                                                    ? <span className="text-emerald-400">completo · {s.total} pç</span>
                                                    : <>resta <span className="text-amber-400">{s.resta}</span> de {s.total} pç</>}
                                                {s.expedido > 0 && <span className="text-emerald-400/70"> · exp {s.expedido}</span>}
                                            </p>
                                        </div>
                                        <input
                                            value={feito[s.chave] || ''} inputMode="decimal" placeholder="0"
                                            onChange={e => setFeito(f => ({ ...f, [s.chave]: e.target.value }))}
                                            className={`${CAMPO} w-24 text-right font-mono ${excede ? 'border-rose-500/50' : ''}`}
                                        />
                                        <input
                                            value={expedido[s.chave] || ''} inputMode="decimal" placeholder="0"
                                            onChange={e => setExpedido(x => ({ ...x, [s.chave]: e.target.value }))}
                                            className={`${CAMPO} w-24 text-right font-mono`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {excedeAlgum && (
                        <p className="text-[11px] text-rose-400 font-bold">
                            Alguma quantidade passa do que falta. Dá para lançar assim mesmo — o saldo apenas
                            fica zerado —, mas confira se não é engano.
                        </p>
                    )}

                    {semItem > 0 && (
                        <p className={`text-[10px] text-zinc-500 font-bold leading-relaxed ${ITEM} p-3`}>
                            Este pedido tem <strong className="text-zinc-300">{semItem} pç</strong> baixadas antes de
                            existir baixa por peça. Elas contam no saldo do pedido, mas não aparecem em nenhuma linha
                            acima — por isso as duas contas podem não fechar.
                        </p>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-2`}>Setor (opcional)</label>
                            <SearchableSelect value={sectorId} onChange={setSectorId}
                                options={[{ value: '', label: '— Nenhum —' }, ...sectors.map(s => ({ value: s.id, label: s.name }))]}
                                placeholder="SETOR..." />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-2`}>Operação (opcional)</label>
                            <input value={operation} onChange={e => setOperation(e.target.value)} placeholder="Ex: Costura"
                                className={`${CAMPO} w-full`} />
                        </div>
                    </div>

                    {(error || aviso) && <p className="text-xs text-rose-400 font-bold">{error || aviso}</p>}
                </div>

                <div className="flex items-center gap-3 px-5 py-4 border-t border-zinc-800 shrink-0">
                    <button onClick={onClose} disabled={busy} className={`${BOTAO_SECUNDARIO} flex-1`}>Cancelar</button>
                    <button onClick={confirm} disabled={!canConfirm}
                        className={`${BOTAO_PRINCIPAL} flex-1`}>
                        {busy ? 'Lançando...' : lancamentos.length === 0 ? 'Informe uma quantidade'
                            : `Baixar ${totalFeito} pç em ${lancamentos.length} ${lancamentos.length === 1 ? 'peça' : 'peças'}`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
