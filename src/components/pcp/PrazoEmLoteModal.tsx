import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { storageService } from '@/services/storage';
import { getTodayStr } from '@/utils/date';
import { erroDaNovaData } from '@/utils/fabrica/prazoEmLote';
import { mensagemDeErro } from '@/utils/errorHandling';
import { avisar } from '@/utils/avisos';
import { diaEMes } from '@/utils/financas/base';
import { useEscFecha } from '@/hooks/useEscFecha';
import { CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

interface Atrasado { id: string; order_number: string; client_name?: string; deadline?: string | null }

/** Nova data de entrega para vários pedidos atrasados de uma vez (auditoria R4). Grava só o prazo. */
export function PrazoEmLoteModal({ atrasados, onClose, onFeito }: { atrasados: Atrasado[]; onClose: () => void; onFeito: () => void }) {
    const hoje = getTodayStr();
    const [marcados, setMarcados] = useState<Set<string>>(() => new Set(atrasados.map(a => a.id)));
    const [data, setData] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    useEscFecha(!salvando, onClose);
    const alternar = (id: string) => setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    const salvar = async () => {
        const problema = erroDaNovaData(data, hoje);
        if (problema) { setErro(problema); return; }
        if (marcados.size === 0) { setErro('Marque ao menos um pedido'); return; }
        setSalvando(true); setErro('');
        try {
            await storageService.alterarPrazo([...marcados], data);
            avisar(`${marcados.size} pedido(s) com entrega para ${diaEMes(data)}.`, 'success');
            onFeito();
        } catch (e) {
            setErro(mensagemDeErro(e, 'Não consegui mudar os prazos.'));
        } finally {
            setSalvando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-modal bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Nova data para vários pedidos">
            <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-white font-black flex items-center gap-2"><CalendarClock size={16} className="text-amber-500" /> Nova data de entrega</h3>
                        <p className="text-sm text-zinc-400">Para os pedidos marcados. O prazo antigo é trocado; avise o cliente pelo botão de mensagem do pedido.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={salvando} aria-label="Fechar" className="h-11 w-11 inline-flex items-center justify-center text-zinc-500 hover:text-white"><X size={18} /></button>
                </div>
                <ul className="max-h-60 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800">
                    {atrasados.map(a => (
                        <li key={a.id}>
                            <label className="flex min-h-11 items-center gap-3 px-3 py-2 cursor-pointer">
                                <input type="checkbox" checked={marcados.has(a.id)} onChange={() => alternar(a.id)} className="h-4 w-4 accent-amber-500" />
                                <span className="min-w-0 flex-1 text-sm"><span className="font-bold text-zinc-100">{a.order_number}</span> <span className="text-zinc-400">{a.client_name}</span></span>
                                <span className="shrink-0 text-xs text-rose-300">era {a.deadline ? diaEMes(a.deadline) : '—'}</span>
                            </label>
                        </li>
                    ))}
                </ul>
                <label className="block"><span className={ROTULO_PEQUENO}>Nova data</span>
                    <input type="date" min={hoje} value={data} onChange={e => setData(e.target.value)} className={`${CAMPO} w-full mt-1`} /></label>
                {erro && <p role="alert" className="text-sm text-rose-400">{erro}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={salvando} className={BOTAO_SECUNDARIO}>Cancelar</button>
                    <button type="button" onClick={salvar} disabled={salvando} className={BOTAO_PRINCIPAL}>
                        {salvando ? <Loader2 size={14} className="animate-spin" /> : null} Mudar prazo de {marcados.size}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
