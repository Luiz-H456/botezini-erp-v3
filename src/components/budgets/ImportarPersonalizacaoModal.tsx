import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEscFecha } from '@/hooks/useEscFecha';
import { X, Table2, Palette, Search, Plus, Info } from 'lucide-react';
import { BudgetCustomization, TecnicaPersonalizacao } from '@/types';
import { formatCurrency } from '@/utils';
import { idService } from '@/services/idService';
import {
    usePrecosPersonalizacao, useArtesBordado, useNotasPersonalizacao,
} from '@/hooks/usePersonalizacao';
import {
    ROTULO_TECNICA, precoDaTabela, sugerirPrecoBordado, coresDaArte,
} from '@/utils/personalizacao';

/**
 * De qual técnica vem cada `type` do orçamento.
 *
 * O orçamento nasceu com quatro tipos ('Embroidery' | 'ScreenPrint' | 'DTF' |
 * 'Other') e a personalização com quatro técnicas — parecidos, não iguais:
 * sublimação não tem tipo próprio no orçamento e cai em 'Other'. Traduzir aqui,
 * num lugar só, evita que cada tela invente sua própria correspondência.
 */
const TIPO_DO_ORCAMENTO: Record<TecnicaPersonalizacao, BudgetCustomization['type']> = {
    bordado: 'Embroidery',
    silk: 'ScreenPrint',
    dtf: 'DTF',
    sublimacao: 'Other',
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Quantidade de peças do orçamento — decide a faixa de preço da tabela. */
    quantidadeSugerida: number;
    onImportar: (linhas: BudgetCustomization[]) => void;
}

const ImportarPersonalizacaoModal: React.FC<Props> = ({
    isOpen, onClose, quantidadeSugerida, onImportar,
}) => {
    const [origem, setOrigem] = useState<'tabela' | 'artes'>('tabela');
    const [busca, setBusca] = useState('');

    const { data: precos = [] } = usePrecosPersonalizacao();
    const { data: artes = [] } = useArtesBordado();
    const { data: notas = [] } = useNotasPersonalizacao();

    const notasBordado = notas.find(n => n.tecnica === 'bordado') || { tecnica: 'bordado' as const };
    const qtd = Math.max(1, quantidadeSugerida || 1);

    const precosVisiveis = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return precos
            .filter(p => p.is_active !== false)
            .filter(p => !q || p.descricao.toLowerCase().includes(q) || ROTULO_TECNICA[p.tecnica].toLowerCase().includes(q));
    }, [precos, busca]);

    const artesVisiveis = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return artes.filter(a => !q ||
            a.nome?.toLowerCase().includes(q) ||
            a.cliente_nome?.toLowerCase().includes(q));
    }, [artes, busca]);

    useEscFecha(isOpen, onClose);

    if (!isOpen) return null;

    const importarPreco = (id: string) => {
        const p = precos.find(x => x.id === id);
        if (!p) return;
        // O preço que entra é o da faixa que vale para a quantidade DESTE
        // orçamento, não o da linha clicada: clicar em "bordado peito" com 200
        // peças deve trazer o preço de 200 peças.
        const daFaixa = precoDaTabela(precos as any, p.tecnica, qtd);
        const valor = daFaixa && daFaixa.descricao === p.descricao ? daFaixa.valor : p.valor;
        adicionar(p.tecnica, p.descricao, valor);
    };

    const importarArte = (id: string) => {
        const a = artes.find(x => x.id === id);
        if (!a) return;
        const sug = sugerirPrecoBordado(a.pontos, notasBordado);
        const daTabela = precoDaTabela(precos as any, 'bordado', qtd);
        // A tabela ganha da fórmula: ela é a decisão registrada, a fórmula é só
        // o palpite para quando não existe decisão.
        adicionar('bordado', a.nome, daTabela ? daTabela.valor : (sug.valor ?? 0));
    };

    const adicionar = (tecnica: TecnicaPersonalizacao, descricao: string, unit: number) => {
        onImportar([{
            id: idService.generateUUID(),
            type: TIPO_DO_ORCAMENTO[tecnica],
            description: descricao.toUpperCase(),
            position: '',
            quantity: qtd,
            unit_price: unit,
            total: Math.round((qtd * unit + Number.EPSILON) * 100) / 100,
        }]);
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-sobreposto flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm ease-out animate-in fade-in duration-200"
            onClick={onClose}>
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-full flex flex-col ease-out animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}>
                <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b border-zinc-800">
                    <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Importar personalização</h3>
                        <p className="text-[10px] text-zinc-500 mt-1">
                            Preço para <b className="text-amber-500">{qtd}</b> peça{qtd > 1 ? 's' : ''} — a faixa da tabela é escolhida por essa quantidade.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all"><X size={18} /></button>
                </div>

                <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
                    <div className="flex gap-1">
                        {([['tabela', 'Tabela de preços', Table2], ['artes', 'Artes de bordado', Palette]] as const).map(([id, label, Icone]) => (
                            <button key={id} type="button" onClick={() => setOrigem(id)}
                                className={`text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border flex items-center gap-2 transition-all ${origem === id
                                    ? 'bg-amber-500 text-black border-amber-500'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'}`}>
                                <Icone size={13} /> {label}
                            </button>
                        ))}
                    </div>
                    <div className="relative flex-1">
                        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..."
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-amber-500/50" />
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>
                </div>

                <div className="overflow-y-auto min-h-0 flex-1 divide-y divide-zinc-800/50">
                    {origem === 'tabela' && precosVisiveis.length === 0 && (
                        <p className="p-12 text-center text-zinc-500 text-sm">
                            Nenhum preço tabelado. Cadastre em <b className="text-zinc-300">Estoque → Personalização → Tabela de Preços</b>.
                        </p>
                    )}
                    {origem === 'artes' && artesVisiveis.length === 0 && (
                        <p className="p-12 text-center text-zinc-500 text-sm">
                            Nenhuma arte cadastrada. Cadastre em <b className="text-zinc-300">Estoque → Personalização → Artes de Bordado</b>.
                        </p>
                    )}

                    {origem === 'tabela' && precosVisiveis.map(p => {
                        const daFaixa = precoDaTabela(precos as any, p.tecnica, qtd);
                        const valeAgora = !!daFaixa && daFaixa.descricao === p.descricao;
                        return (
                            <button key={p.id} type="button" onClick={() => importarPreco(p.id)}
                                className="w-full text-left px-6 py-4 hover:bg-zinc-900/60 transition-all flex items-center gap-4 group">
                                <span className="text-[9px] uppercase font-black tracking-widest text-amber-500 bg-amber-950/30 border border-amber-900/40 px-2 py-1 rounded-full shrink-0">
                                    {ROTULO_TECNICA[p.tecnica]}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-white text-xs font-bold truncate">{p.descricao}</p>
                                    <p className="text-[10px] text-zinc-500">
                                        por {p.unidade || 'peça'}
                                        {(p.faixa_min || p.faixa_max) && ` · faixa ${p.faixa_min ?? 0}–${p.faixa_max ?? '∞'}`}
                                        {!valeAgora && daFaixa && ' · outra faixa vale para esta quantidade'}
                                    </p>
                                </div>
                                <span className="font-mono font-black text-amber-500 text-sm shrink-0">{formatCurrency(p.valor)}</span>
                                <Plus size={16} className="text-zinc-700 group-hover:text-amber-500 transition-colors shrink-0" />
                            </button>
                        );
                    })}

                    {origem === 'artes' && artesVisiveis.map(a => {
                        const sug = sugerirPrecoBordado(a.pontos, notasBordado);
                        const daTabela = precoDaTabela(precos as any, 'bordado', qtd);
                        const valor = daTabela ? daTabela.valor : sug.valor;
                        return (
                            <button key={a.id} type="button" onClick={() => importarArte(a.id)}
                                className="w-full text-left px-6 py-4 hover:bg-zinc-900/60 transition-all flex items-center gap-4 group">
                                <div className="min-w-0 flex-1">
                                    <p className="text-white text-xs font-bold truncate">{a.nome}</p>
                                    <p className="text-[10px] text-zinc-500 truncate">
                                        {a.cliente_nome || 'Arte genérica'}
                                        {a.pontos ? ` · ${a.pontos.toLocaleString('pt-BR')} pontos` : ''}
                                        {coresDaArte(a.cores_linha).length ? ` · ${coresDaArte(a.cores_linha).length} cores` : ''}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="font-mono font-black text-amber-500 text-sm">
                                        {valor !== null ? formatCurrency(valor) : '—'}
                                    </span>
                                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider">
                                        {daTabela ? 'da tabela' : 'sugerido'}
                                    </p>
                                </div>
                                <Plus size={16} className="text-zinc-700 group-hover:text-amber-500 transition-colors shrink-0" />
                            </button>
                        );
                    })}
                </div>

                <div className="shrink-0 px-6 py-4 border-t border-zinc-800">
                    <p className="text-[10px] text-zinc-500 flex items-start gap-2">
                        <Info size={12} className="text-amber-500 mt-0.5 shrink-0" />
                        O valor entra como ponto de partida e continua editável na linha do orçamento. Nada aqui trava o preço.
                    </p>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default ImportarPersonalizacaoModal;
