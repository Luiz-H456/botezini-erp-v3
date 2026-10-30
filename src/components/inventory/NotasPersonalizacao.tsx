import React, { useState, useEffect } from 'react';
import { Check, StickyNote, Info } from 'lucide-react';
import { PersonalizacaoNotas, TecnicaPersonalizacao } from '@/types';
import { TECNICAS, ROTULO_TECNICA, sugerirPrecoBordado } from '@/utils/personalizacao';
import { usePersonalizacaoMutations } from '@/hooks/usePersonalizacao';
import { useToast } from '@/hooks/useToast';
import { CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL } from '@/components/finance/ui/estilo';

const inputCls = `${CAMPO} w-full font-mono text-right`;

/** Só o bordado cobra por mil pontos — DTF é metro, silk e sublimação são peça. */
const COBRA_POR_PONTOS: Record<TecnicaPersonalizacao, boolean> = {
    bordado: true, dtf: false, silk: false, sublimacao: false,
};

const DICA: Record<TecnicaPersonalizacao, string> = {
    bordado: 'Ex: R$ 3,00 por mil pontos, mínimo R$ 8,00 por peça, arte R$ 150 uma vez por logo.',
    dtf: 'Ex: valor do metro corrido, largura útil da folha, quanto rende por peça.',
    silk: 'Ex: valor por cor, custo da matriz/tela, tiragem mínima que compensa.',
    sublimacao: 'Ex: valor por peça, o que muda em poliéster claro e escuro.',
};

interface Props { notas: PersonalizacaoNotas[]; }

const NotasPersonalizacao: React.FC<Props> = ({ notas }) => {
    const { saveNotas } = usePersonalizacaoMutations();
    const { showToast } = useToast();
    const [rascunho, setRascunho] = useState<Record<string, Partial<PersonalizacaoNotas>>>({});

    // O servidor é a fonte da verdade; o rascunho só existe entre digitar e
    // salvar. Sem este efeito, salvar em uma técnica deixaria as outras
    // exibindo o que veio da carga anterior.
    useEffect(() => {
        const base: Record<string, Partial<PersonalizacaoNotas>> = {};
        for (const t of TECNICAS) base[t] = { ...(notas.find(n => n.tecnica === t) || { tecnica: t }) };
        setRascunho(base);
    }, [notas]);

    const salvar = async (tecnica: TecnicaPersonalizacao) => {
        try {
            await saveNotas.mutateAsync({ ...rascunho[tecnica], tecnica });
            showToast(`Notas de ${ROTULO_TECNICA[tecnica]} salvas.`, 'success');
        } catch (e: any) { showToast(e.message || 'Erro ao salvar', 'error'); }
    };

    const set = (t: TecnicaPersonalizacao, campo: keyof PersonalizacaoNotas, v: any) =>
        setRascunho(r => ({ ...r, [t]: { ...r[t], [campo]: v } }));

    const num = (v: string) => v === '' ? null : Number(v);

    return (
        <div className="space-y-4">
            <div className={`${CARTAO} p-5`}>
                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
                    <StickyNote className="text-amber-500" size={18} /> Notas por Técnica
                </h3>
                <p className={`${ROTULO} mt-2`}>
                    Suas regras de bolso. O preço por mil pontos vira sugestão no cadastro de artes — sugestão, nunca imposição.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {TECNICAS.map(t => {
                    const n = rascunho[t] || {};
                    const exemplo = COBRA_POR_PONTOS[t]
                        ? sugerirPrecoBordado(10000, { tecnica: t, preco_por_mil_pontos: n.preco_por_mil_pontos, valor_minimo: n.valor_minimo })
                        : null;
                    return (
                        <div key={t} className={`${CARTAO} p-5 space-y-4`}>
                            <div className="flex items-center justify-between">
                                <span className={ROTULO}>{ROTULO_TECNICA[t]}</span>
                                <button onClick={() => salvar(t)} disabled={saveNotas.isPending}
                                    className={BOTAO_PRINCIPAL}>
                                    <Check size={14} /> Salvar
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {COBRA_POR_PONTOS[t] && (
                                    <div>
                                        <label className={`${ROTULO_PEQUENO} block mb-1`}>R$ / mil pontos</label>
                                        <input type="number" step="0.01" className={inputCls} placeholder="—"
                                            value={n.preco_por_mil_pontos ?? ''}
                                            onChange={e => set(t, 'preco_por_mil_pontos', num(e.target.value))} />
                                    </div>
                                )}
                                <div>
                                    <label className={`${ROTULO_PEQUENO} block mb-1`} title="Piso por peça: bordado pequeno é quase todo setup">Valor mínimo</label>
                                    <input type="number" step="0.01" className={inputCls} placeholder="—"
                                        value={n.valor_minimo ?? ''} onChange={e => set(t, 'valor_minimo', num(e.target.value))} />
                                </div>
                                <div>
                                    <label className={`${ROTULO_PEQUENO} block mb-1`} title="Cobrança única do primeiro pedido — não entra no preço por peça">Valor da arte</label>
                                    <input type="number" step="0.01" className={inputCls} placeholder="—"
                                        value={n.valor_da_arte ?? ''} onChange={e => set(t, 'valor_da_arte', num(e.target.value))} />
                                </div>
                            </div>

                            {exemplo && (
                                <p className={`text-[10px] text-zinc-500 ${ITEM} px-3 py-2 flex items-start gap-2`}>
                                    <Info size={12} className="text-amber-500 mt-0.5 shrink-0" />
                                    <span>Simulação com 10.000 pontos: {exemplo.memoria}</span>
                                </p>
                            )}

                            <div>
                                <label className={`${ROTULO_PEQUENO} block mb-1`}>Anotações gerais</label>
                                <textarea rows={5}
                                    className={`${CAMPO} w-full min-h-[8rem] py-2 resize-y`}
                                    placeholder={DICA[t]}
                                    value={n.notas || ''} onChange={e => set(t, 'notas', e.target.value)} />
                            </div>
                        </div>
                    );
                })}
            </div>

        </div>
    );
};

export default NotasPersonalizacao;
