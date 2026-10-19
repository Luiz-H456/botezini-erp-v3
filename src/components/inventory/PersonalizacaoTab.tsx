import React, { useState } from 'react';
import { Table2, Palette, History, StickyNote, AlertTriangle } from 'lucide-react';
import {
    usePersonalizacaoMigrada,
    usePrecosPersonalizacao,
    useArtesBordado,
    useHistoricoPersonalizacao,
    useNotasPersonalizacao,
} from '@/hooks/usePersonalizacao';
import TabelaDePrecos from './TabelaDePrecos';
import ArtesBordadoPanel from './ArtesBordadoPanel';
import HistoricoPersonalizacao from './HistoricoPersonalizacao';
import NotasPersonalizacao from './NotasPersonalizacao';
import DivergenciaPanel from './DivergenciaPanel';
import { pilula } from '@/components/finance/ui/estilo';

type SubAba = 'tabela' | 'artes' | 'historico' | 'notas';

const SUBABAS: { id: SubAba; label: string; icon: React.ElementType }[] = [
    { id: 'tabela', label: 'Tabela de Preços', icon: Table2 },
    { id: 'artes', label: 'Artes de Bordado', icon: Palette },
    { id: 'historico', label: 'Histórico', icon: History },
    { id: 'notas', label: 'Notas', icon: StickyNote },
];

const PersonalizacaoTab: React.FC = () => {
    const [sub, setSub] = useState<SubAba>('tabela');

    const { data: migrada, isLoading: carregandoMigracao } = usePersonalizacaoMigrada();
    const { data: precos = [] } = usePrecosPersonalizacao();
    const { data: artes = [] } = useArtesBordado();
    const { data: historico = [] } = useHistoricoPersonalizacao();
    const { data: notas = [] } = useNotasPersonalizacao();

    if (carregandoMigracao) {
        return <div className="p-12 text-center text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">Carregando personalização...</div>;
    }

    // Sem a migração as quatro tabelas não existem. Mostrar formulários que
    // vão falhar no salvar seria pior do que dizer o que falta.
    if (migrada === false) {
        return (
            <div className="bg-amber-950/10 border border-amber-900/40 rounded-2xl p-5 space-y-3">
                <p className="text-amber-500 font-black uppercase text-xs tracking-[0.2em] flex items-center gap-3">
                    <AlertTriangle size={18} /> Migração pendente
                </p>
                <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">
                    As tabelas de personalização ainda não existem no banco. Rode o arquivo{' '}
                    <code className="text-amber-400 bg-zinc-900 px-2 py-0.5 rounded">supabase/personalizacao_precos_e_artes.sql</code>{' '}
                    no SQL Editor do Supabase. Ele é puramente aditivo — cria quatro tabelas novas e não altera nada do que já existe.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <DivergenciaPanel precos={precos} historico={historico} />

            {/* flex-wrap no lugar de overflow-x-auto: aba que não coube some sem
                deixar rastro, e ninguém rola um menu que não parece rolável.
                Quebrando em duas linhas, todas continuam à vista. */}
            <div className="flex flex-wrap items-center gap-1">
                {SUBABAS.map(a => (
                    <button key={a.id} onClick={() => setSub(a.id)} className={pilula(sub === a.id)}>
                        <a.icon size={14} strokeWidth={sub === a.id ? 2.5 : 2} /> {a.label}
                    </button>
                ))}
            </div>

            {sub === 'tabela' && <TabelaDePrecos precos={precos} />}
            {sub === 'artes' && <ArtesBordadoPanel artes={artes} notas={notas} />}
            {sub === 'historico' && <HistoricoPersonalizacao historico={historico} artes={artes} precos={precos} />}
            {sub === 'notas' && <NotasPersonalizacao notas={notas} />}
        </div>
    );
};

export default PersonalizacaoTab;
