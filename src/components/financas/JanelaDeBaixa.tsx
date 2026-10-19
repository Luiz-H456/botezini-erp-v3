import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/common';
import { storageService } from '@/services/storage';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { getTodayStr } from '@/utils/date';
import { parseBRL } from '@/utils/currency';
import type { BankAccount, ObligationSummary } from '@/types';
import type { CashEnvelope } from '@/types/finance';
import { sugestoesDeCaixinha } from '@/utils/financas/caixinhas';

const campo = 'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600';

interface Props {
    conta: ObligationSummary;
    bancos: BankAccount[];
    caixinhas: CashEnvelope[];
    bancoInicial: string | null;
    /** Abre a janela completa (parcial com desconto, anexo, informativo, anotação, método). */
    onMaisOpcoes: () => void;
    onFechar: () => void;
    onConcluido: () => void;
}

/** Recebi / Paguei em um clique: tudo já preenchido, e a sugestão de caixinha junto. */
export function JanelaDeBaixa({ conta, bancos, caixinhas, bancoInicial, onMaisOpcoes, onFechar, onConcluido }: Props) {
    const { mostrar } = useMostrarValor();
    const recebendo = conta.type === 'receivable';
    const [valor, setValor] = useState(String(conta.remaining_amount).replace('.', ','));
    const [data, setData] = useState(getTodayStr());
    const [bancoId, setBancoId] = useState(bancoInicial ?? '');
    const [recusadas, setRecusadas] = useState<Set<string>>(new Set());
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    /** O dinheiro já mexeu: daqui em diante só se fecha, e fechar avisa o pai para reler. */
    const [baixaFeita, setBaixaFeita] = useState(false);

    const quantia = parseBRL(valor);
    const sugestoes = useMemo(
        () => (recebendo ? sugestoesDeCaixinha(quantia, caixinhas) : []), [recebendo, quantia, caixinhas]);
    const ativos = bancos.filter(b => b.is_active);
    const pode = quantia > 0 && quantia <= conta.remaining_amount + 0.001 && !!bancoId && !!data && !salvando;

    const confirmar = async () => {
        if (!pode) return;
        setSalvando(true);
        setErro('');
        try {
            await storageService.payObligation({
                obligation_id: conta.id, amount: quantia, account_id: bancoId,
                method: conta.planned_method || 'PIX', payment_date: data,
            });
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não consegui registrar a baixa.');
            setSalvando(false);
            return;
        }
        setBaixaFeita(true);
        const falhas: string[] = [];
        for (const s of sugestoes) {
            if (recusadas.has(s.caixinhaId)) continue;
            try { await storageService.moveEnvelope(s.caixinhaId, s.valor, `Recebimento: ${conta.description}`); }
            catch { falhas.push(s.nome); }
        }
        setSalvando(false);
        if (falhas.length) {
            setErro(`Baixa feita. Não consegui guardar em: ${falhas.join(', ')}. Guarde à mão em Caixinhas.`);
            return;
        }
        onConcluido();
    };

    // Enquanto grava, a janela não fecha: fechar recarregaria a lista antes da baixa
    // terminar (a linha ainda mostraria Recebi e daria para pagar duas vezes).
    const fechar = () => { if (salvando) return; if (baixaFeita) onConcluido(); else onFechar(); };

    // Portal: contêineres de página com filhos fixos cortariam a janela.
    return createPortal(
        <Modal isOpen onClose={fechar} title={`${recebendo ? 'Recebi' : 'Paguei'} · ${conta.description}`} maxWidth="md">
            <div className="p-6 space-y-3 max-h-[85vh] overflow-y-auto">
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Valor
                    <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal"
                        className={`${campo} mt-1 text-right tabular-nums`} />
                </label>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Data
                    <input type="date" value={data} onChange={e => setData(e.target.value)} className={`${campo} mt-1`} />
                </label>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Banco
                    <select value={bancoId} onChange={e => setBancoId(e.target.value)} className={`${campo} mt-1`}>
                        <option value="">escolha</option>
                        {ativos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </label>

                {sugestoes.map(s => {
                    const aceita = !recusadas.has(s.caixinhaId);
                    return (
                        <div key={s.caixinhaId} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950 px-3 py-2 text-sm">
                            <span className="text-zinc-300">Guardar <b className="tabular-nums">{mostrar(s.valor)}</b> em {s.nome} ({s.percentual}%)?</span>
                            <span className="flex gap-2 text-xs shrink-0">
                                <button type="button" onClick={() => setRecusadas(r => { const n = new Set(r); n.delete(s.caixinhaId); return n; })}
                                    className={aceita ? 'text-emerald-400 underline' : 'text-zinc-500'}>sim</button>
                                <button type="button" onClick={() => setRecusadas(r => new Set(r).add(s.caixinhaId))}
                                    className={!aceita ? 'text-zinc-200 underline' : 'text-zinc-500'}>não</button>
                            </span>
                        </div>
                    );
                })}

                {!baixaFeita && (
                <button type="button" onClick={onMaisOpcoes} disabled={salvando} className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-40">
                    + mais opções: quitar com desconto · anexar comprovante · já {recebendo ? 'recebido' : 'pago'} antes do ERP · anotação
                </button>
                )}

                {quantia > conta.remaining_amount + 0.001 && (
                    <p className="text-sm text-amber-400">O valor passa do que falta ({mostrar(conta.remaining_amount)}).</p>
                )}
                {erro && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erro}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={fechar} disabled={salvando} className="inline-flex h-10 items-center justify-center px-4 rounded-xl border border-zinc-800 bg-zinc-950/50 text-zinc-400 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-zinc-700 disabled:opacity-40">
                        {baixaFeita ? 'Fechar' : 'Cancelar'}
                    </button>
                    {!baixaFeita && (
                        <button type="button" onClick={confirmar} disabled={!pode}
                            className="inline-flex h-10 items-center justify-center gap-2 px-4 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 disabled:opacity-40">
                            Confirmar
                        </button>
                    )}
                </div>
            </div>
        </Modal>,
        document.body,
    );
}
