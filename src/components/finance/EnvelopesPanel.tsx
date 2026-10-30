import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Wallet, Landmark, PiggyBank, Plus } from 'lucide-react';
import { Indicador } from '@/components/finance/ui/Indicador';
import { CARTAO, CAMPO as CAMPO_APP, ROTULO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, BOTAO_SUAVE } from '@/components/finance/ui/estilo';
import { parseBRL } from '@/utils/currency';
import { progressoDaMeta } from '@/utils/financas/caixinhas';
import { useEnvelopes } from '@/hooks/finance/useEnvelopes';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { CashEnvelope, EnvelopeMovement } from '@/types/finance';
import { SearchableSelect, InfoTooltip, ConfirmDialog, MenuMais } from '@/components/common';

import { mensagemDeErro } from '@/utils/errorHandling';
import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];
const PURPOSES = ['Impostos', 'Folha de pagamento', 'Fornecedores', 'Reserva de emergência', '13º / Férias', 'Investimento', 'Outro'];

const CAMPO = `${CAMPO_APP} w-full`;
const BTN_SECUNDARIO = BOTAO_SECUNDARIO;
const BTN_PRINCIPAL = BOTAO_PRINCIPAL;
const JANELA = 'fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-modal flex items-center justify-center p-4 ease-out animate-in fade-in duration-200';
const CAIXA = 'bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full ease-out animate-in zoom-in-95 duration-200';

export function EnvelopesPanel() {
    const env = useEnvelopes();
    const { mostrar } = useMostrarValor();
    const [editing, setEditing] = useState<Partial<CashEnvelope> | null>(null);
    const [extrato, setExtrato] = useState<CashEnvelope | null>(null);
    const [transferFrom, setTransferFrom] = useState<CashEnvelope | null>(null);
    const [showProvision, setShowProvision] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<CashEnvelope | null>(null);

    const freeNegative = env.overview.free < -0.001;
    const autoEnvelopes = env.envelopes.filter(e => (e.auto_fund_pct ?? 0) > 0);

    return (
        <div className="space-y-6">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Indicador grande icone={Wallet} rotulo="Livre para usar" valor={mostrar(env.overview.free)} tom={freeNegative ? 'rose' : 'emerald'} />
                <Indicador grande icone={Landmark} rotulo="Nos bancos" valor={mostrar(env.overview.total_real)} />
                <Indicador grande icone={PiggyBank} rotulo="Nas caixinhas" valor={mostrar(env.overview.allocated)} tom="violet" />
            </section>

            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setEditing({ color: COLORS[0], target_amount: 0 })} className={BOTAO_PRINCIPAL}><Plus size={13} /> Nova caixinha</button>
                <MenuMais rotulo="Mais ações" itens={[{ rotulo: 'Distribuir um valor…', onClick: () => setShowProvision(true) }]} />
            </div>

            {freeNegative && (
                <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">As caixinhas somam mais que o saldo dos bancos. Tire valores de alguma caixinha ou reforce o caixa.</p>
            )}

            {env.error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{env.error}</p>}

            {env.loading ? (
                <p className="text-sm text-zinc-500">Carregando…</p>
            ) : env.envelopes.length === 0 ? (
                <p className={`${CARTAO} py-10 text-center text-sm text-zinc-500`}>Nenhuma caixinha ainda — crie a primeira para separar seu dinheiro.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {env.envelopes.map(e => (
                        <EnvelopeCard key={e.id} env={e} busy={env.busy} mostrar={mostrar}
                            onEdit={() => setEditing(e)}
                            onDelete={() => setConfirmDelete(e)}
                            onMove={(delta) => env.move(e.id, delta)}
                            onExtrato={() => setExtrato(e)} />
                    ))}
                </div>
            )}

            <p className="text-[10px] font-bold text-zinc-600">Nenhuma caixinha move dinheiro de verdade: é um rótulo sobre o saldo dos bancos.</p>

            {editing && (
                <EnvelopeForm
                    initial={editing}
                    busy={env.busy}
                    onSave={async (data) => { await env.saveEnvelope(data); setEditing(null); }}
                    onClose={() => setEditing(null)}
                />
            )}

            {extrato && (
                <ExtratoModal envelope={extrato} getMovements={env.getMovements} onClose={() => setExtrato(null)}
                    onTransferir={env.envelopes.length > 1 ? () => { setTransferFrom(extrato); setExtrato(null); } : undefined} />
            )}

            {transferFrom && (
                <TransferModal
                    from={transferFrom}
                    others={env.envelopes.filter(e => e.id !== transferFrom.id)}
                    busy={env.busy}
                    onConfirm={async (toId, amount) => { await env.transfer(transferFrom.id, toId, amount); setTransferFrom(null); }}
                    onClose={() => setTransferFrom(null)}
                />
            )}

            {showProvision && (
                <ProvisionModal
                    envelopes={autoEnvelopes}
                    free={env.overview.free}
                    busy={env.busy}
                    onConfirm={async (base) => { await env.fund(base); setShowProvision(false); }}
                    onClose={() => setShowProvision(false)}
                />
            )}

            <ConfirmDialog
                isOpen={!!confirmDelete}
                title="Excluir caixinha"
                message={confirmDelete ? `Excluir "${confirmDelete.name}"? O valor reservado volta para o livre.` : ''}
                variant="danger"
                confirmLabel="Excluir"
                isLoading={env.busy}
                onConfirm={async () => { if (confirmDelete) { await env.deleteEnvelope(confirmDelete.id); setConfirmDelete(null); } }}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
}

function EnvelopeCard({ env, busy, mostrar, onEdit, onDelete, onMove, onExtrato }: {
    env: CashEnvelope; busy: boolean; mostrar: (n: number) => string;
    onEdit: () => void; onDelete: () => void; onMove: (delta: number) => Promise<void>; onExtrato: () => void;
}) {
    const [amount, setAmount] = useState('');
    const parsed = parseBRL(amount);
    const meta = progressoDaMeta(env);

    const doMove = async (sign: 1 | -1) => {
        if (parsed <= 0) return;
        // Falhou: o valor digitado fica (o erro já aparece no topo da página).
        try { await onMove(sign * parsed); setAmount(''); } catch { /* erro mostrado por env.error */ }
    };

    return (
        <div className={`${CARTAO} relative overflow-hidden p-5 space-y-4`}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: env.color }} />
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: env.color }} />
                    <div className="min-w-0">
                        <span className="text-sm font-black text-zinc-100 truncate block">{env.name}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block truncate">
                            {[env.purpose, (env.auto_fund_pct ?? 0) > 0 ? `guarda ${env.auto_fund_pct}% de cada recebimento` : null].filter(Boolean).join(' · ') || 'manual'}
                        </span>
                    </div>
                </div>
                <MenuMais rotulo={`Mais ações de ${env.name}`} itens={[
                    { rotulo: 'Extrato e transferir', onClick: onExtrato },
                    { rotulo: 'Editar', onClick: onEdit },
                    { rotulo: 'Excluir', onClick: onDelete, perigo: true },
                ]} />
            </div>

            <div>
                <p className="text-xl font-black tracking-tighter tabular-nums text-zinc-100">{mostrar(env.balance)}</p>
                {meta && (
                    <>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2">
                            <div className="h-full rounded-full" style={{ width: `${meta.percentual}%`, background: env.color }} />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mt-1">meta {mostrar(meta.meta)} · {meta.percentual}%</p>
                    </>
                )}
            </div>

            <div className="flex items-center gap-2">
                <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" aria-label={`Valor para ${env.name}`}
                    className={`${CAMPO_APP} flex-1 min-w-0 text-right tabular-nums`} />
                <button type="button" onClick={() => doMove(1)} disabled={busy || parsed <= 0} title="Guardar (livre → caixinha)" className={BOTAO_SUAVE}>Guardar</button>
                <button type="button" onClick={() => doMove(-1)} disabled={busy || parsed <= 0} title="Tirar (caixinha → livre)" className={BTN_SECUNDARIO}>Tirar</button>
            </div>
        </div>
    );
}

function Rotulo({ children }: { children: React.ReactNode }) {
    return <label className={`${ROTULO} block mb-1.5`}>{children}</label>;
}

function Cabecalho({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-white min-w-0">{children}</h3>
            <button type="button" onClick={onClose} aria-label="Fechar" className="p-2 -mr-2 text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
    );
}

function EnvelopeForm({ initial, busy, onSave, onClose }: {
    initial: Partial<CashEnvelope>; busy: boolean;
    onSave: (data: Partial<CashEnvelope>) => Promise<void>; onClose: () => void;
}) {
    // Fechar com algo digitado pergunta antes (passada de celular e fábrica).
    const saida = useSaidaProtegida(onClose);
    const [name, setName] = useState(initial.name || '');
    const [color, setColor] = useState(initial.color || COLORS[0]);
    const [target, setTarget] = useState(String(initial.target_amount ?? 0));
    const [notes, setNotes] = useState(initial.notes || '');
    const [purpose, setPurpose] = useState(initial.purpose || '');
    const [autoPct, setAutoPct] = useState(String(initial.auto_fund_pct ?? 0));

    const [error, setError] = useState('');

    const save = async () => {
        if (!name.trim()) return;
        setError('');
        try { await onSave({
            ...initial, name: name.trim(), color,
            target_amount: Number(target) || 0, notes: notes || undefined,
            purpose: purpose || undefined,
            // Prazo e saldo mínimo saíram da tela, mas o dado gravado não pode ser apagado.
            target_date: initial.target_date,
            min_balance: initial.min_balance ?? 0,
            auto_fund_pct: Number(autoPct) || 0,
        }); } catch (e: any) { setError(mensagemDeErro(e, 'Falha ao salvar a caixinha')); }
    };

    return createPortal(
        <div className={JANELA} onClick={saida.pedirParaFechar}>
            <div className={`${CAIXA} max-w-md p-6 space-y-4`} onClick={e => e.stopPropagation()} {...saida.aoMexer}>
                {saida.confirmacao}
                <Cabecalho onClose={saida.pedirParaFechar}>{initial.id ? 'Editar caixinha' : 'Nova caixinha'}</Cabecalho>
                <div>
                    <Rotulo>Nome</Rotulo>
                    <input value={name} onChange={e => setName(e.target.value)} autoFocus className={CAMPO} />
                </div>
                <div>
                    <Rotulo>Cor</Rotulo>
                    <div className="flex gap-2 flex-wrap">
                        {COLORS.map(c => (
                            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Cor ${c}`}
                                className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`}
                                style={{ background: c }} />
                        ))}
                    </div>
                </div>
                <div>
                    <Rotulo>Finalidade</Rotulo>
                    <SearchableSelect
                        value={purpose}
                        onChange={setPurpose}
                        options={[{ value: '', label: '— Nenhuma —' }, ...PURPOSES.map(p => ({ value: p, label: p }))]}
                        placeholder="Finalidade…"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Rotulo>Meta (R$)</Rotulo>
                        <input type="number" min={0} step="0.01" value={target} onChange={e => setTarget(e.target.value)} className={`${CAMPO} text-right tabular-nums`} />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <label className={ROTULO}>% automático</label>
                            <InfoTooltip iconSize={11}>
                                <p className="text-[10px] font-bold text-zinc-300 leading-relaxed mb-1.5">
                                    % que esta caixinha guarda quando você usa <span className="text-white font-black">Distribuir um valor</span> ou aceita a sugestão ao baixar uma conta.
                                </p>
                                <p className="text-[10px] text-zinc-400 leading-relaxed">
                                    Ex.: 15% em "Impostos" → sobre um recebimento de R$ 1.000, R$ 150 são separados aqui. Deixe 0 para não entrar na distribuição.
                                </p>
                            </InfoTooltip>
                        </div>
                        <input type="number" min={0} max={100} step="0.1" value={autoPct} onChange={e => setAutoPct(e.target.value)} className={`${CAMPO} text-right tabular-nums`} />
                    </div>
                </div>
                <div>
                    <Rotulo>Notas</Rotulo>
                    <input value={notes} onChange={e => setNotes(e.target.value)} className={CAMPO} />
                </div>
                {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
                <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" onClick={saida.pedirParaFechar} className={BTN_SECUNDARIO}>Cancelar</button>
                    <button type="button" onClick={save} disabled={busy || !name.trim()} className={BTN_PRINCIPAL}>Salvar</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

const KIND_LABEL: Record<string, string> = {
    allocate: 'Guardado', release: 'Tirado', transfer_in: 'Transferência recebida', transfer_out: 'Transferência enviada',
};

function ExtratoModal({ envelope, getMovements, onClose, onTransferir }: {
    envelope: CashEnvelope;
    getMovements: (id: string) => Promise<EnvelopeMovement[]>;
    onClose: () => void;
    /** Só informado quando existe outra caixinha para receber. */
    onTransferir?: () => void;
}) {
    const { mostrar } = useMostrarValor();
    const [movs, setMovs] = useState<EnvelopeMovement[] | null>(null);

    useEffect(() => {
        getMovements(envelope.id).then(setMovs).catch(() => setMovs([]));
    }, [envelope.id, getMovements]);

    return createPortal(
        <div className={JANELA} onClick={onClose}>
            <div className={`${CAIXA} max-w-lg max-h-[85vh] flex flex-col p-6 gap-4`} onClick={e => e.stopPropagation()}>
                <Cabecalho onClose={onClose}>
                    <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: envelope.color }} />
                        Extrato — {envelope.name}
                    </span>
                </Cabecalho>
                <div className="flex-1 overflow-y-auto">
                    {movs === null ? (
                        <p className="py-10 text-center text-sm text-zinc-500">Carregando…</p>
                    ) : movs.length === 0 ? (
                        <p className="py-10 text-center text-sm text-zinc-500">Sem movimentos ainda.</p>
                    ) : (
                        <ul className="space-y-4">
                            {movs.map(m => (
                                <li key={m.id} className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <span className="text-sm text-zinc-200 block">{KIND_LABEL[m.kind] || m.kind}</span>
                                        {m.notes && <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block truncate">{m.notes}</span>}
                                        <span className="text-xs text-zinc-500">{new Date(m.created_at).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <span className={`text-sm font-semibold tabular-nums shrink-0 ${m.delta >= 0 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                                        {m.delta >= 0 ? '+' : ''}{mostrar(m.delta)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                {onTransferir && (
                    <button type="button" onClick={onTransferir} className={`${BTN_SECUNDARIO} w-full`}>Transferir para outra caixinha</button>
                )}
            </div>
        </div>,
        document.body
    );
}

function TransferModal({ from, others, busy, onConfirm, onClose }: {
    from: CashEnvelope; others: CashEnvelope[]; busy: boolean;
    onConfirm: (toId: string, amount: number) => Promise<void>; onClose: () => void;
}) {
    // Fechar com algo digitado pergunta antes (passada de celular e fábrica).
    const saida = useSaidaProtegida(onClose);
    const { mostrar } = useMostrarValor();
    const [toId, setToId] = useState(others[0]?.id || '');
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const parsed = parseBRL(amount);
    const canConfirm = parsed > 0 && parsed <= from.balance && !!toId && !busy;

    const confirm = async () => {
        if (!canConfirm) return;
        try { await onConfirm(toId, parsed); }
        catch (e: any) { setError(mensagemDeErro(e, 'Falha na transferência')); }
    };

    return createPortal(
        <div className={JANELA} onClick={saida.pedirParaFechar}>
            <div className={`${CAIXA} max-w-sm p-6 space-y-4`} onClick={e => e.stopPropagation()} {...saida.aoMexer}>
                {saida.confirmacao}
                <Cabecalho onClose={saida.pedirParaFechar}>Transferir de {from.name}</Cabecalho>
                <p className="text-xs text-zinc-500">Disponível: {mostrar(from.balance)}</p>
                <div>
                    <Rotulo>Para</Rotulo>
                    <SearchableSelect
                        value={toId}
                        onChange={setToId}
                        options={others.map(o => ({ value: o.id, label: o.name }))}
                        placeholder={others.length === 0 ? 'Crie outra caixinha' : 'Para…'}
                    />
                </div>
                <div>
                    <Rotulo>Valor</Rotulo>
                    <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00"
                        className={`${CAMPO} text-right tabular-nums`} />
                </div>
                {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
                <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" onClick={saida.pedirParaFechar} className={BTN_SECUNDARIO}>Cancelar</button>
                    <button type="button" onClick={confirm} disabled={!canConfirm} className={BTN_PRINCIPAL}>Transferir</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function ProvisionModal({ envelopes, free, busy, onConfirm, onClose }: {
    envelopes: CashEnvelope[]; free: number; busy: boolean;
    onConfirm: (base: number) => Promise<void>; onClose: () => void;
}) {
    // Fechar com algo digitado pergunta antes (passada de celular e fábrica).
    const saida = useSaidaProtegida(onClose);
    const { mostrar } = useMostrarValor();
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const base = parseBRL(amount);

    // Mesma lógica da RPC fund_envelopes: aloca % por caixinha, na ordem,
    // nunca ultrapassando o livre disponível.
    const preview = (() => {
        let remainingFree = free;
        return envelopes
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map(e => {
                let amt = Math.round(base * (e.auto_fund_pct ?? 0) / 100 * 100) / 100;
                if (amt > remainingFree) amt = Math.max(0, remainingFree);
                remainingFree -= amt;
                return { envelope: e, amount: amt };
            });
    })();
    const totalAllocated = preview.reduce((s, p) => s + p.amount, 0);
    const canConfirm = base > 0 && totalAllocated > 0 && !busy;

    const confirm = async () => {
        if (!canConfirm) return;
        try { await onConfirm(base); }
        catch (e: any) { setError(mensagemDeErro(e, 'Falha ao distribuir')); }
    };

    return createPortal(
        <div className={JANELA} onClick={saida.pedirParaFechar}>
            <div className={`${CAIXA} max-w-md p-6 space-y-4`} onClick={e => e.stopPropagation()} {...saida.aoMexer}>
                {saida.confirmacao}
                <Cabecalho onClose={saida.pedirParaFechar}>
                    <span className="inline-flex items-center gap-2">
                        Distribuir um valor
                        <InfoTooltip iconSize={13}>
                            <p className="text-[11px] font-bold text-zinc-300 leading-relaxed mb-2">
                                Aplica de uma vez as reservas automáticas ("pague-se primeiro"): informe um valor-base — normalmente <strong>um recebimento</strong> — e cada caixinha com % configurado guarda sua fatia.
                            </p>
                            <p className="text-[10px] text-zinc-400 leading-relaxed mb-2">
                                Ex.: base R$ 1.000, Impostos 15% → R$ 150 vão para Impostos. Sai do <span className="text-emerald-400 font-black">livre</span> (nunca ultrapassa o disponível). É reserva virtual — <strong>não move dinheiro real</strong>.
                            </p>
                            <p className="text-[10px] text-amber-400/80 leading-relaxed">
                                ⚠ Distribua uma vez por recebimento — repetir com a mesma base reserva de novo.
                            </p>
                        </InfoTooltip>
                    </span>
                </Cabecalho>
                <p className="text-xs text-zinc-500">Guarda a % automática de cada caixinha sobre um valor-base.</p>

                <div>
                    <Rotulo>Valor-base (ex.: um recebimento)</Rotulo>
                    <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" autoFocus
                        className={`${CAMPO} text-right tabular-nums`} />
                    <p className="text-xs text-zinc-500 mt-1">Livre disponível: {mostrar(free)}</p>
                </div>

                <div className="space-y-2">
                    <p className="text-xs text-zinc-500">Prévia</p>
                    {preview.length === 0 && (
                        <p className="text-sm text-zinc-500">Nenhuma caixinha tem % automático. Defina em Editar.</p>
                    )}
                    {preview.map(({ envelope, amount: amt }) => (
                        <div key={envelope.id} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: envelope.color }} />
                                <span className="text-sm text-zinc-200 truncate">{envelope.name}</span>
                                <span className="text-xs text-zinc-500 shrink-0">({envelope.auto_fund_pct}%)</span>
                            </div>
                            <span className={`text-sm tabular-nums shrink-0 ${amt > 0 ? 'text-zinc-100' : 'text-zinc-500'}`}>{mostrar(amt)}</span>
                        </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-zinc-500">Total a guardar</span>
                        <span className="text-lg font-semibold tabular-nums text-white">{mostrar(totalAllocated)}</span>
                    </div>
                    {base > 0 && totalAllocated < base * envelopes.reduce((s, e) => s + (e.auto_fund_pct ?? 0), 0) / 100 - 0.01 && (
                        <p className="text-sm text-amber-400">⚠ Livre insuficiente para guardar o % completo de todas.</p>
                    )}
                </div>

                {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

                <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" onClick={saida.pedirParaFechar} className={BTN_SECUNDARIO}>Cancelar</button>
                    <button type="button" onClick={confirm} disabled={!canConfirm} className={BTN_PRINCIPAL}>
                        {busy ? 'Distribuindo…' : 'Distribuir'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
