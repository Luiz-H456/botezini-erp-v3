import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Trash2, Gauge, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/common';
import { usePcpCapacity } from '@/hooks/pcp/usePcpCapacity';
import { ProductionSector } from '@/types/pcp';
import { capacidadeMensal } from '@/utils/capacityCalendar';
import { getTodayStr } from '@/utils/date';
import { CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_SUAVE, BOTAO_SECUNDARIO, BOTAO_PRINCIPAL } from '@/components/finance/ui/estilo';

import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
const COLORS = ['#71717a', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6'];

export function CapacityPanel() {
    const cap = usePcpCapacity();
    const [editing, setEditing] = useState<Partial<ProductionSector> | null>(null);
    const [confirmDel, setConfirmDel] = useState<ProductionSector | null>(null);

    if (cap.loading) {
        return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>;
    }

    if (cap.sectors.length === 0) {
        return (
            <div className="text-center py-16 space-y-3">
                <Gauge size={32} className="text-zinc-700 mx-auto" />
                {/* Com erro, a lista vazia não é prova de que não há setor: mostra o erro, não o convite. */}
                {cap.error ? (
                    <div className="max-w-md mx-auto space-y-3">
                        <p className="text-xs text-rose-400 font-bold">{cap.error}</p>
                        <button type="button" onClick={() => void cap.reload()} className={BOTAO_SECUNDARIO}>Tentar de novo</button>
                    </div>
                ) : (<>
                    <p className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">Nenhum setor configurado</p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                        Aplique <code className="text-amber-400">supabase/pcp_phase1_capacity_sectors.sql</code> no Supabase
                        (semeia os 6 estágios atuais) ou crie um setor abaixo.
                    </p>
                    <button onClick={() => setEditing({ color: COLORS[0], weekly_capacity_pieces: 350, sort_order: 0 })}
                        className={BOTAO_SUAVE}>
                        <Plus size={14} /> Novo setor
                    </button>
                </>)}
                {editing && <SectorForm initial={editing} busy={cap.busy} onSave={async d => { await cap.saveSector(d); setEditing(null); }} onClose={() => setEditing(null)} />}
            </div>
        );
    }

    // Gargalo = menor capacidade semanal cadastrada (> 0).
    const positivas = cap.sectors.map(s => s.weekly_capacity_pieces).filter(c => c > 0);
    const gargalo = positivas.length ? Math.min(...positivas) : 0;

    return (
        <div className="space-y-6">
            {/* Capacidade mensal: sai do gargalo da linha. A ocupação mora em Como estamos indo › Fábrica. */}
            <div className={`${CARTAO} p-5`}>
                <p className={ROTULO}>Capacidade mensal</p>
                <p className="text-2xl font-black text-white font-mono mt-2">
                    {gargalo > 0 ? capacidadeMensal(gargalo, getTodayStr().slice(0, 7)).mensal.toLocaleString('pt-BR') : '—'}
                    <span className={`${ROTULO_PEQUENO} ml-2`}>peças</span>
                </p>
                <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                    Sai do gargalo da linha: o setor com a menor capacidade semanal cadastrada, multiplicado pelas semanas do mês.
                    A fábrica não produz mais que o setor mais lento.
                </p>
                <p className={`${ROTULO_PEQUENO} mt-2`}>
                    {gargalo > 0 ? `Gargalo de ${gargalo} pç/semana.` : 'Nenhum setor com capacidade cadastrada.'}
                </p>
            </div>

            {cap.error && <div className="text-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl"><p className="text-xs text-rose-400 font-bold">{cap.error}</p></div>}

            {/* Configuração de setores */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className={ROTULO}>Setores &amp; capacidade semanal</h3>
                    <button onClick={() => setEditing({ color: COLORS[cap.sectors.length % COLORS.length], weekly_capacity_pieces: 350, sort_order: cap.sectors.length })}
                        className={BOTAO_SUAVE}>
                        <Plus size={13} /> Novo setor
                    </button>
                </div>
                <div className="space-y-2">
                    {cap.sectors.map(s => (
                        <div key={s.id} className={`${ITEM} flex items-center justify-between px-3 py-2.5`}>
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                                <span className="text-xs font-bold text-zinc-200 truncate">{s.name}</span>
                                <span className="text-[10px] font-mono text-zinc-600">#{s.sort_order}</span>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                <span className="text-[11px] font-mono text-zinc-400">{s.weekly_capacity_pieces} pç/sem</span>
                                <button onClick={() => setEditing(s)} aria-label={`Editar ${s.name}`} className="p-1 text-zinc-600 hover:text-white"><Pencil size={13} /></button>
                                <button onClick={() => setConfirmDel(s)} aria-label={`Excluir ${s.name}`} className="p-1 text-zinc-600 hover:text-rose-500"><Trash2 size={13} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Config global */}
            <ConfigBar
                workingDays={cap.config.working_days}
                overtime={cap.config.overtime_enabled}
                busy={cap.busy}
                onSave={(wd, ot) => cap.saveConfig({ ...cap.config, working_days: wd, overtime_enabled: ot })}
            />

            {editing && <SectorForm initial={editing} busy={cap.busy} onSave={async d => { await cap.saveSector(d); setEditing(null); }} onClose={() => setEditing(null)} />}

            <ConfirmDialog
                isOpen={!!confirmDel}
                title="Excluir setor"
                message={confirmDel ? `Excluir o setor "${confirmDel.name}"? Pedidos parados nele não serão apagados, mas perdem a referência de estágio.` : ''}
                variant="danger"
                confirmLabel="Excluir"
                isLoading={cap.busy}
                onConfirm={async () => { if (confirmDel) { await cap.deleteSector(confirmDel.id); setConfirmDel(null); } }}
                onCancel={() => setConfirmDel(null)}
            />
        </div>
    );
}

function ConfigBar({ workingDays, overtime, busy, onSave }: {
    workingDays: number; overtime: boolean; busy: boolean; onSave: (wd: number, ot: boolean) => void;
}) {
    const [wd, setWd] = useState(String(workingDays));
    const [ot, setOt] = useState(overtime);
    return (
        <div className={`${ITEM} flex items-center gap-4 flex-wrap p-4`}>
            <span className={ROTULO_PEQUENO}>Configuração</span>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
                Dias úteis/semana
                <input type="number" min={1} max={7} value={wd} onChange={e => setWd(e.target.value)}
                    className={`${CAMPO} w-16 text-right font-mono`} />
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={ot} onChange={e => setOt(e.target.checked)} className="accent-amber-500" />
                Hora extra habilitada
            </label>
            <button onClick={() => onSave(Number(wd) || 5, ot)} disabled={busy}
                className={`${BOTAO_SECUNDARIO} ml-auto`}>
                Salvar config
            </button>
        </div>
    );
}

function SectorForm({ initial, busy, onSave, onClose }: {
    initial: Partial<ProductionSector>; busy: boolean;
    onSave: (d: Partial<ProductionSector>) => Promise<void>; onClose: () => void;
}) {
    // Fechar com algo digitado pergunta antes (passada de celular e fábrica).
    const saida = useSaidaProtegida(onClose);
    const [name, setName] = useState(initial.name || '');
    const [cap, setCap] = useState(String(initial.weekly_capacity_pieces ?? 350));
    const [order, setOrder] = useState(String(initial.sort_order ?? 0));
    const [color, setColor] = useState(initial.color || COLORS[0]);

    const save = () => {
        if (!name.trim()) return;
        onSave({ ...initial, name: name.trim(), weekly_capacity_pieces: Number(cap) || 0, sort_order: Number(order) || 0, color });
    };

    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-modal flex items-center justify-center p-4 ease-out animate-in fade-in duration-200" onClick={saida.pedirParaFechar}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-md ease-out animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()} {...saida.aoMexer}>
                {saida.confirmacao}
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                    <h3 className="text-white font-black uppercase tracking-tight">{initial.id ? 'Editar' : 'Novo'} Setor</h3>
                    <button onClick={saida.pedirParaFechar} className="p-2 text-zinc-500 hover:text-white"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className={`${ROTULO_PEQUENO} block mb-1.5`}>Nome *</label>
                        <input value={name} onChange={e => setName(e.target.value)} autoFocus
                            className={`${CAMPO} w-full`} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1.5`}>Capacidade (pç/semana)</label>
                            <input type="number" min={0} value={cap} onChange={e => setCap(e.target.value)}
                                className={`${CAMPO} w-full text-right font-mono`} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1.5`}>Ordem</label>
                            <input type="number" min={0} value={order} onChange={e => setOrder(e.target.value)}
                                className={`${CAMPO} w-full text-right font-mono`} />
                        </div>
                    </div>
                    <div>
                        <label className={`${ROTULO_PEQUENO} block mb-1.5`}>Cor</label>
                        <div className="flex gap-2 flex-wrap">
                            {COLORS.map(c => (
                                <button key={c} onClick={() => setColor(c)}
                                    className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`}
                                    style={{ background: c }} />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 px-5 py-4 border-t border-zinc-800">
                    <button onClick={saida.pedirParaFechar} className={`${BOTAO_SECUNDARIO} flex-1`}>Cancelar</button>
                    <button onClick={save} disabled={busy || !name.trim()}
                        className={`${BOTAO_PRINCIPAL} flex-1`}>Salvar</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
