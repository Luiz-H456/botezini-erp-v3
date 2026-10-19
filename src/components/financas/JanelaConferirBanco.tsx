import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/common';
import { storageService } from '@/services/storage';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { parseBRL } from '@/utils/currency';
import { centavos } from '@/utils/financas/base';
import type { SituacaoDoBanco } from '@/utils/financas/bancos';
import type { ObligationSummary } from '@/types';

interface Props {
    banco: SituacaoDoBanco;
    /** Todas as contas carregadas; a janela mostra as de `banco.aConferir`. */
    contas: ObligationSummary[];
    onFechar: () => void;
    onAlterado: () => void;
}

/** O saldo do sistema contra o do extrato, e o que falta conferir neste banco. */
export function JanelaConferirBanco({ banco, contas, onFechar, onAlterado }: Props) {
    const { mostrar } = useMostrarValor();
    const [extrato, setExtrato] = useState('');
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [erro, setErro] = useState('');
    const [feitas, setFeitas] = useState<Set<string>>(new Set());
    const pendentes = useMemo(
        () => contas.filter(c => banco.aConferir.includes(c.id) && !feitas.has(c.id)),
        [contas, banco.aConferir, feitas]
    );

    const temDigitos = /\d/.test(extrato);
    const digitado = temDigitos ? parseBRL(extrato) : null;
    const diferenca = digitado === null ? null : centavos(digitado - banco.saldo);

    const conferir = async (id: string) => {
        setOcupado(id); setErro('');
        try {
            // Só marca, nunca alterna: se outra aba já conferiu, continua conferida.
            await storageService.marcarConferida(id);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não consegui marcar como conferida.');
            setOcupado(null);
            return;
        }
        setFeitas(f => new Set(f).add(id));
        setOcupado(null);
        onAlterado();
    };

    // Portal: contêineres de página com filhos fixos cortariam a janela.
    return createPortal(
        <Modal isOpen onClose={onFechar} title={`Conferir · ${banco.nome}`} maxWidth="lg">
            <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <p className="text-xs text-zinc-500">Saldo no sistema</p>
                        <p className="text-lg font-black tracking-tighter tabular-nums">{mostrar(banco.saldo)}</p>
                    </div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Saldo do extrato
                        <input value={extrato} onChange={e => setExtrato(e.target.value)} inputMode="decimal" placeholder="0,00"
                            className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white text-right tabular-nums" />
                    </label>
                </div>
                {diferenca !== null && (
                    <p className={`text-sm ${Math.abs(diferenca) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {Math.abs(diferenca) < 0.01 ? '✓ bate com o extrato' : `diferença de ${mostrar(Math.abs(diferenca))} — confira os lançamentos abaixo`}
                    </p>
                )}
                <div>
                    <p className="text-xs text-zinc-500 mb-2">
                        {pendentes.length === 0 ? 'Nada a conferir neste banco.' : `${pendentes.length} lançamento(s) a conferir`}
                    </p>
                    <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl">
                        {pendentes.map(c => (
                            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                <span className="truncate text-zinc-300">{c.description}</span>
                                <span className="flex items-center gap-3 shrink-0">
                                    <span className="tabular-nums">{mostrar(c.paid_amount)}</span>
                                    <button type="button" disabled={ocupado === c.id} onClick={() => conferir(c.id)}
                                        className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-40">conferido</button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                {erro && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erro}</p>}
                <div className="flex justify-end">
                    <button type="button" onClick={onFechar} className="inline-flex h-10 items-center justify-center px-4 rounded-xl border border-zinc-800 bg-zinc-950/50 text-zinc-400 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-zinc-700">Fechar</button>
                </div>
            </div>
        </Modal>,
        document.body,
    );
}
