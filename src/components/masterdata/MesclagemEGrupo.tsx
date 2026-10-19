import React, { useMemo } from 'react';
import { Link2, Building2 } from 'lucide-react';
import { SearchableSelect } from '@/components/common';
import {
    candidatosDeCliente, duplicatasDe, nomesDeGrupo, membrosDoGrupo,
} from '@/utils/apelidosDeCliente';
import type { Client } from '@/types';

interface Props {
    data: Partial<Client>;
    onChange: (data: Partial<Client>) => void;
    /** Todos os clientes, para achar duplicatas e grupos existentes. */
    clientes: Client[];
}

/**
 * Duplicata e grupo econômico — as duas relações entre clientes.
 *
 * Ficam juntas na tela porque a pergunta que a pessoa faz é a mesma ("esses
 * dois cadastros têm a ver um com o outro?"), mas o painel deixa claro que a
 * resposta se divide em duas muito diferentes:
 *
 *   MESMA empresa cadastrada duas vezes  → mesclar
 *   Empresas diferentes do mesmo dono    → agrupar
 *
 * Confundir as duas custa caro: mesclar matriz com filial junta CNPJs distintos
 * e a nota sai errada; agrupar uma duplicata conta o mesmo faturamento duas
 * vezes no total do grupo.
 */
export const MesclagemEGrupo: React.FC<Props> = ({ data, onChange, clientes }) => {
    const candidatos = useMemo(
        () => candidatosDeCliente(data as any, clientes as any),
        [data, clientes]);

    const duplicatasDeste = useMemo(
        () => duplicatasDe(data.id, clientes as any),
        [data.id, clientes]);

    const grupos = useMemo(() => nomesDeGrupo(clientes as any), [clientes]);

    const irmaos = useMemo(
        () => membrosDoGrupo(data.grupo_economico, clientes as any)
            .filter(c => c.id !== data.id),
        [data.grupo_economico, data.id, clientes]);

    const oficial = clientes.find(c => c.id === data.canonical_client_id);

    return (
        <div className="bg-zinc-950/40 border border-zinc-800/80 p-4 rounded-2xl space-y-5">

            {/* ── Grupo econômico ──────────────────────────────────────── */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <Building2 size={12} className="text-amber-500 shrink-0" />
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                        Grupo econômico
                    </span>
                </div>
                <p className="text-[10px] text-zinc-600 font-bold leading-relaxed mb-2">
                    Para matriz e filiais, ou empresas do mesmo dono. Elas continuam clientes
                    separados — cada uma com seu CNPJ, sua nota e sua conta — mas ganham uma
                    página com o total do grupo.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <SearchableSelect
                        value={data.grupo_economico || ''}
                        onChange={(v) => onChange({ ...data, grupo_economico: v || null })}
                        options={[
                            { value: '', label: '— SEM GRUPO —' },
                            ...grupos.map(g => ({ value: g, label: g.toUpperCase() })),
                        ]}
                        placeholder="ESCOLHER GRUPO..."
                    />
                    <input
                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-200 outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-700"
                        placeholder="OU DIGITE UM GRUPO NOVO"
                        value={data.grupo_economico || ''}
                        onChange={(e) => onChange({ ...data, grupo_economico: e.target.value || null })}
                    />
                </div>
                {irmaos.length > 0 && (
                    <p className="text-[10px] text-zinc-500 font-bold mt-2 leading-relaxed">
                        No mesmo grupo:{' '}
                        <b className="text-zinc-300">{irmaos.map(c => c.company_name).join(', ')}</b>.
                    </p>
                )}
            </div>

            {/* ── Duplicata ────────────────────────────────────────────── */}
            {data.id && (candidatos.length > 0 || data.canonical_client_id || duplicatasDeste.length > 0) && (
                <div className="border-t border-zinc-800/70 pt-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Link2 size={12} className="text-amber-500 shrink-0" />
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                            Mesma empresa, cadastrada duas vezes
                        </span>
                    </div>

                    {data.canonical_client_id ? (
                        <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                            <p className="text-[10px] text-amber-500/90 leading-snug min-w-0">
                                Este cadastro é o mesmo que{' '}
                                <b>{oficial?.company_name || '(cliente removido)'}</b>.
                                O histórico dos dois é contado junto.
                            </p>
                            <button type="button"
                                onClick={() => onChange({ ...data, canonical_client_id: null })}
                                className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-rose-400 shrink-0 px-2 py-1">
                                Desfazer
                            </button>
                        </div>
                    ) : duplicatasDeste.length > 0 ? (
                        <p className="text-[10px] text-zinc-500 leading-snug">
                            Este é o cadastro oficial de{' '}
                            <b className="text-zinc-300">{duplicatasDeste.map(c => c.company_name).join(', ')}</b>.
                            O histórico de todos é somado aqui.
                        </p>
                    ) : (
                        <>
                            <p className="text-[10px] text-zinc-600 font-bold leading-relaxed mb-2">
                                Nada é apagado: o cadastro vira apelido do oficial, os orçamentos antigos
                                continuam onde estão, e histórico e financeiro passam a somar os dois como
                                um só. <b className="text-zinc-500">Filial não é duplicata</b> — para
                                matriz e filial, use o grupo acima.
                            </p>
                            <div className="space-y-1.5">
                                {candidatos.slice(0, 4).map(c => (
                                    <div key={c.cliente.id} className="flex items-center justify-between gap-3">
                                        <span className="text-[10px] font-bold text-zinc-300 truncate min-w-0">
                                            {c.cliente.company_name}
                                            {c.mesmoCnpj && (
                                                <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-amber-500">
                                                    mesmo CNPJ
                                                </span>
                                            )}
                                            {!c.mesmoCnpj && c.mesmoNomeNormalizado && (
                                                <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-amber-500/70">
                                                    mesmo nome
                                                </span>
                                            )}
                                        </span>
                                        <button type="button"
                                            onClick={() => onChange({ ...data, canonical_client_id: c.cliente.id })}
                                            className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-colors shrink-0">
                                            É a mesma
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
