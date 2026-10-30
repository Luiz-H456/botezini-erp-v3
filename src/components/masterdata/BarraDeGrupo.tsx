import React, { useState, useMemo } from 'react';
import { Building2, X, Loader2, Check } from 'lucide-react';
import { SearchableSelect } from '@/components/common';
import { nomesDeGrupo, papelNoGrupo, ROTULO_DO_PAPEL } from '@/utils/apelidosDeCliente';
import type { Client } from '@/types';

interface Props {
    selecionados: Client[];
    todosOsClientes: Client[];
    onLimpar: () => void;
    /** Grava o grupo em todos os selecionados. */
    onAplicar: (grupo: string | null) => Promise<void>;
}

/**
 * Ação em lote: pega os clientes marcados e põe todos no mesmo grupo.
 *
 * Antes, montar um grupo de quatro filiais exigia abrir quatro cadastros e
 * digitar o mesmo nome quatro vezes — com o risco de "Grupo Granja" numa e
 * "grupo granja" noutra, criando dois grupos que deveriam ser um.
 *
 * A prévia dos papéis aparece antes de gravar porque é a conferência que
 * importa: se o que a pessoa marcou não tem uma matriz, ou tem empresas de
 * raízes de CNPJ diferentes, ela vê isso ANTES e pode corrigir a seleção.
 */
export const BarraDeGrupo: React.FC<Props> = ({
    selecionados, todosOsClientes, onLimpar, onAplicar,
}) => {
    const [nome, setNome] = useState('');
    const [salvando, setSalvando] = useState(false);

    const grupos = useMemo(() => nomesDeGrupo(todosOsClientes as any), [todosOsClientes]);

    // Papéis calculados sobre a SELEÇÃO, não sobre o grupo já salvo: é a
    // prévia do que vai virar, e é isso que se está conferindo.
    const previa = useMemo(
        () => selecionados.map(c => ({
            cliente: c,
            papel: papelNoGrupo(c as any, selecionados as any),
        })),
        [selecionados]);

    const temMatriz = previa.some(p => p.papel === 'matriz');

    if (selecionados.length === 0) return null;

    const aplicar = async (valor: string | null) => {
        setSalvando(true);
        try {
            await onAplicar(valor);
            setNome('');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="bg-amber-500/[0.06] border border-amber-500/30 rounded-2xl p-4 mb-4 space-y-3 ease-out animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                    <Building2 size={13} />
                    {selecionados.length} empresa{selecionados.length === 1 ? '' : 's'} selecionada{selecionados.length === 1 ? '' : 's'}
                </p>
                <button onClick={onLimpar}
                    className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                    <X size={14} /> Limpar seleção
                </button>
            </div>

            {/* Prévia dos papéis — a conferência antes de gravar. */}
            <div className="flex flex-wrap gap-1.5">
                {previa.map(({ cliente, papel }) => (
                    <span key={cliente.id}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${papel === 'matriz'
                            ? 'text-amber-500 border-amber-500/40 bg-amber-500/10'
                            : papel === 'filial'
                                ? 'text-zinc-400 border-zinc-700 bg-zinc-900'
                                : 'text-sky-400/90 border-sky-500/30 bg-sky-500/10'}`}>
                        {cliente.company_name}
                        <span className="ml-1.5 uppercase tracking-widest text-[10px] font-black opacity-80">
                            {ROTULO_DO_PAPEL[papel]}
                        </span>
                    </span>
                ))}
            </div>

            {!temMatriz && selecionados.length > 1 && (
                <p className="text-[10px] text-zinc-500 font-bold leading-relaxed">
                    Nenhuma matriz nesta seleção — são empresas de CNPJs sem raiz em comum. O grupo
                    funciona igual, mas a hierarquia não vai aparecer; se faltou a matriz, marque-a
                    também.
                </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                <SearchableSelect
                    value=""
                    onChange={(v) => v && aplicar(v)}
                    options={[
                        { value: '', label: '— GRUPO EXISTENTE —' },
                        ...grupos.map(g => ({ value: g, label: g.toUpperCase() })),
                    ]}
                    placeholder="PÔR NUM GRUPO EXISTENTE..."
                />
                <input
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-200 outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-700"
                    placeholder="OU CRIAR: EX. GRUPO GRANJA"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && nome.trim()) aplicar(nome.trim()); }}
                />
                <div className="flex gap-2">
                    <button
                        onClick={() => nome.trim() && aplicar(nome.trim())}
                        disabled={!nome.trim() || salvando}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 disabled:bg-zinc-800 disabled:text-zinc-500">
                        {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
                        Criar grupo
                    </button>
                    <button
                        onClick={() => aplicar(null)}
                        disabled={salvando}
                        title="Tirar as selecionadas de qualquer grupo"
                        className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-rose-400 transition-colors disabled:opacity-40">
                        Tirar
                    </button>
                </div>
            </div>
        </div>
    );
};
