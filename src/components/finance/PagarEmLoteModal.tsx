import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCheck, Loader2, X } from 'lucide-react';
import type { BankAccount, ObligationSummary } from '@/types';
import { storageService } from '@/services/storage';
import { PAYMENT_METHODS } from '@/utils/constants';
import { getTodayStr } from '@/utils/date';
import { mensagemDeErro } from '@/utils/errorHandling';
import { avisar } from '@/utils/avisos';
import type { Lote } from '@/utils/financas/loteDePagamento';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { useEscFecha } from '@/hooks/useEscFecha';
import SearchableSelect from '@/components/common/SearchableSelect';
import { CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

/**
 * Baixa de várias contas de uma vez (auditoria R3). Cada conta é baixada pelo mesmo caminho do
 * pagamento individual (payObligation), com o saldo inteiro, na mesma data, banco e forma — e fica
 * com o seu próprio pagamento, que se estorna sozinho se precisar. Uma que falhar não para as outras;
 * o resumo diz quais falharam e por quê.
 */
export function PagarEmLoteModal({ lote, bancos, onClose, onFeito }: {
    lote: Lote<ObligationSummary>; bancos: BankAccount[]; onClose: () => void; onFeito: () => void;
}) {
    const { mostrar } = useMostrarValor();
    const receber = lote.tipo === 'receivable';
    const [banco, setBanco] = useState(bancos.find(b => b.is_active !== false)?.id ?? '');
    const [data, setData] = useState(getTodayStr());
    const [metodo, setMetodo] = useState('PIX');
    const [feitas, setFeitas] = useState(0);
    const [rodando, setRodando] = useState(false);
    const [falhas, setFalhas] = useState<{ descricao: string; motivo: string }[]>([]);
    useEscFecha(!rodando, onClose);

    const executar = async () => {
        if (!banco) return;
        setRodando(true); setFalhas([]); setFeitas(0);
        const erros: { descricao: string; motivo: string }[] = [];
        for (const conta of lote.aptas) {
            try {
                await storageService.payObligation({
                    obligation_id: conta.id, amount: conta.remaining_amount, account_id: banco,
                    method: metodo, payment_date: data, notes: 'Baixa em lote',
                });
            } catch (e) {
                erros.push({ descricao: conta.description, motivo: mensagemDeErro(e, 'falhou') });
            }
            setFeitas(n => n + 1);
        }
        setRodando(false);
        const ok = lote.aptas.length - erros.length;
        if (ok > 0) avisar(`${ok} conta(s) ${receber ? 'recebida(s)' : 'paga(s)'} em lote.`, 'success');
        if (erros.length) { setFalhas(erros); avisar(`${erros.length} conta(s) não foram baixadas. Veja o motivo na janela.`, 'error'); }
        else onFeito();
    };

    return createPortal(
        <div className="fixed inset-0 z-modal bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Baixa em lote">
            <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-white font-black">{receber ? 'Receber' : 'Pagar'} {lote.aptas.length} conta(s) de uma vez</h3>
                        <p className="text-sm text-zinc-400">Total {mostrar(lote.total)} · cada uma pelo saldo que falta</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={rodando} aria-label="Fechar" className="h-11 w-11 inline-flex items-center justify-center text-zinc-500 hover:text-white"><X size={18} /></button>
                </div>
                <ul className="max-h-40 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800 text-sm">
                    {lote.aptas.map(c => (
                        <li key={c.id} className="flex justify-between gap-3 px-3 py-2"><span className="truncate text-zinc-300">{c.description}</span><span className="shrink-0 text-zinc-400">{mostrar(c.remaining_amount)}</span></li>
                    ))}
                </ul>
                {lote.ignoradas.length > 0 && (
                    <p className="text-xs text-zinc-500">Fora do lote: {lote.ignoradas.map(i => `${i.conta.description} (${i.motivo})`).join(', ')}.</p>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block sm:col-span-3"><span className={ROTULO_PEQUENO}>{receber ? 'Entrou no banco' : 'Saiu do banco'}</span>
                        <SearchableSelect value={banco} onChange={setBanco} placeholder="BANCO..."
                            options={bancos.filter(b => b.is_active !== false).map(b => ({ value: b.id, label: b.name }))} /></label>
                    <label className="block"><span className={ROTULO_PEQUENO}>Data</span>
                        <input type="date" className={`${CAMPO} w-full mt-1`} value={data} onChange={e => setData(e.target.value)} /></label>
                    <label className="block sm:col-span-2"><span className={ROTULO_PEQUENO}>Forma</span>
                        <SearchableSelect value={metodo} onChange={setMetodo} options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))} /></label>
                </div>
                {falhas.length > 0 && (
                    <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                        <p className="font-bold">Não foram baixadas:</p>
                        <ul className="list-disc pl-5">{falhas.map(f => <li key={f.descricao}>{f.descricao}: {f.motivo}</li>)}</ul>
                    </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={falhas.length ? onFeito : onClose} disabled={rodando} className={BOTAO_SECUNDARIO}>{falhas.length ? 'Fechar' : 'Cancelar'}</button>
                    {!falhas.length && (
                        <button type="button" onClick={executar} disabled={rodando || !banco} className={BOTAO_PRINCIPAL}>
                            {rodando ? <><Loader2 size={14} className="animate-spin" /> {feitas}/{lote.aptas.length}</>
                                : <><CheckCheck size={14} /> {receber ? 'Receber' : 'Pagar'} {lote.aptas.length} — {mostrar(lote.total)}</>}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
