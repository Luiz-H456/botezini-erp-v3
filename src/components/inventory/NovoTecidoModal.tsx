import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Plus, Trash2, Layers, AlertTriangle, Check, Palette, Sparkles, ClipboardPaste,
} from 'lucide-react';
import { storageService } from '@/services/storage';
import { idService } from '@/services/idService';
import type { Insumo, FabricColor, Supplier } from '@/types';
import { SearchableSelect } from '@/components/common';
import {
    montarNomeDeTecido, separarNomeDeTecido, nomeDoInsumoDaFaixa, limparCartela,
    FAIXAS_DE_COR, CARTELA_PADRAO, interpretarListaDeCores,
} from '@/utils/nomeDeTecido';
import type { CorDaCartela, FaixaDeCor } from '@/utils/nomeDeTecido';
import { ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE, BOTAO_SECUNDARIO, BOTAO_PERIGO } from '@/components/finance/ui/estilo';

/**
 * Cadastro de um tecido inteiro numa tela só.
 *
 * Um tecido, no sistema, não é um registro: são até três insumos (uma faixa de
 * preço por grupo de cor) mais a cartela de cores que liga cada cor à sua faixa.
 * Até aqui isso só existia porque foi semeado por SQL — não havia como cadastrar
 * tecido pelo app, e quem precisava de um novo ficava sem cartela, sem faixa e
 * sem o seletor de cor no orçamento.
 *
 * O nome da família é montado a partir das partes (tipo, composição, marca,
 * referência) porque ele é a CHAVE que liga insumo, cartela e busca. Digitado
 * livremente, cada cadastro escreve de um jeito e a mesma peça vira três
 * tecidos distintos.
 */

const Input = `${CAMPO} w-full uppercase`;
const Label = `${ROTULO_PEQUENO} block mb-2`;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    /** Família já existente, para editar em vez de criar. */
    familiaExistente?: string;
    insumos: Insumo[];
    fabricColors: FabricColor[];
    suppliers?: Supplier[];
}

export const NovoTecidoModal: React.FC<Props> = ({
    isOpen, onClose, onSuccess, familiaExistente, insumos, fabricColors, suppliers = [],
}) => {
    const [partes, setPartes] = useState(() => separarNomeDeTecido(familiaExistente || ''));
    const [unidade, setUnidade] = useState<'m' | 'kg'>('m');
    const [rendimento, setRendimento] = useState('');
    const [fornecedor, setFornecedor] = useState('');
    /** Custo por faixa. Faixa sem custo simplesmente não gera insumo. */
    const [custos, setCustos] = useState<Record<FaixaDeCor, string>>({
        'Branco': '', 'Padrão': '', 'Especial': '',
    });
    const [cores, setCores] = useState<CorDaCartela[]>([]);
    const [colando, setColando] = useState(false);
    const [textoColado, setTextoColado] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    const familia = useMemo(() => montarNomeDeTecido(partes), [partes]);

    /** Famílias que já têm cartela — são elas que valem a pena copiar. */
    const familiasComCartela = useMemo(() => {
        const nomes = [...new Set(fabricColors.map(c => c.fabric_family).filter(Boolean))];
        return nomes.filter(n => n !== familiaExistente).sort();
    }, [fabricColors, familiaExistente]);

    /**
     * Acrescenta sem apagar o que já está na tela e sem repetir.
     *
     * Somar, e não substituir, é o que deixa combinar os atalhos: partir da
     * cartela padrão, copiar as extras de outro tecido e colar o resto do
     * mostruário — tudo na mesma sessão, sem perder o caminho andado.
     */
    const acrescentarCores = (novas: CorDaCartela[]) =>
        setCores(prev => limparCartela([...prev, ...novas]));

    // Abrir um tecido existente traz o que já está cadastrado, em vez de obrigar
    // a redigitar a cartela inteira para mexer numa cor.
    useEffect(() => {
        if (!isOpen) return;
        setErro('');
        setPartes(separarNomeDeTecido(familiaExistente || ''));

        if (!familiaExistente) {
            setCores([]);
            setCustos({ 'Branco': '', 'Padrão': '', 'Especial': '' });
            setUnidade('m'); setRendimento(''); setFornecedor('');
            return;
        }

        const daFamilia = insumos.filter(i => i.fabric_family === familiaExistente);
        const base = daFamilia[0];
        if (base) {
            setUnidade((base.unit === 'kg' ? 'kg' : 'm'));
            setRendimento(base.rendimento ? String(base.rendimento) : '');
            setFornecedor(base.supplier_id || '');
        }
        setCustos({
            'Branco': String(daFamilia.find(i => i.color_tier === 'Branco')?.average_unit_cost ?? ''),
            'Padrão': String(daFamilia.find(i => i.color_tier === 'Padrão')?.average_unit_cost ?? ''),
            'Especial': String(daFamilia.find(i => i.color_tier === 'Especial')?.average_unit_cost ?? ''),
        });
        setCores(fabricColors
            .filter(c => c.fabric_family === familiaExistente)
            .map(c => ({ nome: c.color_name, hex: c.hex, faixa: c.color_tier as FaixaDeCor })));
    }, [isOpen, familiaExistente, insumos, fabricColors]);

    const mexerNaCor = (i: number, campo: keyof CorDaCartela, valor: string) =>
        setCores(prev => prev.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)));

    const salvar = async () => {
        setErro('');
        if (!familia) { setErro('Dê ao menos um tipo ao tecido — é o nome que liga insumo, cartela e busca.'); return; }

        const cartela = limparCartela(cores);
        const comCusto = FAIXAS_DE_COR.filter(f => parseFloat(custos[f]) > 0);
        if (comCusto.length === 0) {
            setErro('Informe o custo de ao menos uma faixa: sem custo o tecido não entra em nenhum cálculo de preço.');
            return;
        }

        // Cor apontando para faixa sem insumo ficaria sem preço no orçamento.
        const orfas = [...new Set(cartela.filter(c => !(comCusto as readonly string[]).includes(c.faixa)).map(c => c.faixa))];
        if (orfas.length > 0) {
            setErro(`Há cores na faixa ${orfas.join(' e ')}, mas essa faixa está sem custo. Preencha o custo ou mova as cores.`);
            return;
        }

        setSalvando(true);
        try {
            // Um insumo por faixa com custo. Reaproveita o que já existe para não
            // duplicar o tecido a cada edição.
            for (const faixa of comCusto) {
                const jaExiste = insumos.find(
                    i => i.fabric_family === familia && i.color_tier === faixa);
                const insumo: Partial<Insumo> = {
                    id: jaExiste?.id || idService.generateUUID(),
                    name: nomeDoInsumoDaFaixa(familia, faixa),
                    fabric_family: familia,
                    color_tier: faixa,
                    category: 'Tecidos',
                    unit: unidade,
                    rendimento: unidade === 'kg' ? (parseFloat(rendimento) || 1) : undefined,
                    average_unit_cost: parseFloat(custos[faixa]) || 0,
                    supplier_id: fornecedor || undefined,
                    // Faixa que já existe mantém o saldo do banco (o objeto em memória pode estar velho).
                    ...(jaExiste ? {} : { current_stock: 0 }),
                    min_stock: jaExiste?.min_stock ?? 0,
                };
                await storageService.saveInsumo(insumo);
            }

            await storageService.saveFabricColors(familia, cartela.map(c => {
                const antiga = fabricColors.find(
                    x => x.fabric_family === familia && x.color_name === c.nome);
                return {
                    id: antiga?.id,
                    color_name: c.nome, hex: c.hex, color_tier: c.faixa,
                };
            }));

            onSuccess();
            onClose();
        } catch (e: any) {
            setErro(e?.message || 'Erro ao salvar o tecido.');
        } finally {
            setSalvando(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/85 flex items-center justify-center z-sobreposto p-4 backdrop-blur-md">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
                <div className="px-5 py-4 bg-zinc-950/50 border-b border-zinc-900 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl shrink-0">
                            <Layers size={16} className="text-amber-500" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.2em]">
                                {familiaExistente ? 'Editar tecido' : 'Novo tecido'}
                            </h3>
                            <p className="text-[9px] text-zinc-600 uppercase tracking-widest mt-0.5 truncate">
                                {familia || 'monte o nome abaixo'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" title="Fechar" className={`${BOTAO_SECUNDARIO} w-10 px-0 shrink-0`}>
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar">
                    {erro && (
                        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl text-[10px] font-bold flex items-start gap-3">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            {erro}
                        </div>
                    )}

                    {/* ── Identidade ── */}
                    <div>
                        <p className={`${ROTULO} mb-3`}>Identidade</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                                <label className={Label}>Tipo *</label>
                                <input className={Input} placeholder="MALHA" value={partes.tipo || ''}
                                    onChange={e => setPartes(p => ({ ...p, tipo: e.target.value.toUpperCase() }))} />
                            </div>
                            <div>
                                <label className={Label}>Composição</label>
                                <input className={Input} placeholder="PV ANTI PILLING" value={partes.composicao || ''}
                                    onChange={e => setPartes(p => ({ ...p, composicao: e.target.value.toUpperCase() }))} />
                            </div>
                            <div>
                                <label className={Label}>Marca</label>
                                <input className={Input} placeholder="GUIMATEX" value={partes.marca || ''}
                                    onChange={e => setPartes(p => ({ ...p, marca: e.target.value.toUpperCase() }))} />
                            </div>
                            <div>
                                <label className={Label}>Referência</label>
                                <input className={Input} placeholder="167" value={partes.referencia || ''}
                                    onChange={e => setPartes(p => ({ ...p, referencia: e.target.value.toUpperCase() }))} />
                            </div>
                        </div>
                        {familia && (
                            <p className="text-[10px] text-zinc-500 mt-2.5 ml-1">
                                Vai ficar: <b className="text-amber-500 font-mono">{familia}</b>
                            </p>
                        )}
                    </div>

                    {/* ── Compra ── */}
                    <div>
                        <p className={`${ROTULO} mb-3`}>Como se compra</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label className={Label}>Unidade</label>
                                <SearchableSelect
                                    value={unidade}
                                    onChange={(v) => setUnidade(v === 'kg' ? 'kg' : 'm')}
                                    options={[{ value: 'm', label: 'METRO' }, { value: 'kg', label: 'QUILO' }]}
                                />
                            </div>
                            <div>
                                <label className={Label}>
                                    Rendimento (m/kg){unidade === 'kg' ? ' *' : ''}
                                </label>
                                <input type="number" step="0.01" className={`${Input} ${unidade !== 'kg' ? 'opacity-40' : ''}`}
                                    disabled={unidade !== 'kg'} placeholder="3.20" value={rendimento}
                                    onChange={e => setRendimento(e.target.value)} />
                            </div>
                            <div>
                                <label className={Label}>Fornecedor</label>
                                <SearchableSelect
                                    value={fornecedor} onChange={setFornecedor}
                                    options={[{ value: '', label: 'NÃO INFORMADO' },
                                    ...suppliers.map(s => ({ value: s.id, label: (s.company_name || '').toUpperCase() }))]}
                                    placeholder="FORNECEDOR..."
                                />
                            </div>
                        </div>
                        {unidade === 'kg' && (
                            <p className="text-[9px] text-zinc-600 mt-2 ml-1 leading-relaxed">
                                Comprado em quilo, o custo por metro sai de <b>custo ÷ rendimento</b> — é esse valor
                                que a calculadora de custo do produto usa.
                            </p>
                        )}
                    </div>

                    {/* ── Faixas de preço ── */}
                    <div>
                        <p className={`${ROTULO} mb-1`}>Custo por faixa de cor</p>
                        <p className="text-[9px] text-zinc-600 mb-3 leading-relaxed">
                            O mesmo tecido custa diferente conforme a cor. Preencha só as faixas que existem —
                            faixa sem custo não vira insumo e não aparece no orçamento.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {FAIXAS_DE_COR.map(f => (
                                <div key={f}>
                                    <label className={Label}>{f} (R$/{unidade})</label>
                                    <input type="number" step="0.01" className={`${Input} font-mono text-amber-500`}
                                        placeholder="0.00" value={custos[f]}
                                        onChange={e => setCustos(c => ({ ...c, [f]: e.target.value }))} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Cartela ── */}
                    <div>
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <Palette size={12} className="text-amber-500 shrink-0" />
                                <p className={ROTULO}>
                                    Cartela de cores
                                </p>
                                <span className="text-[9px] text-zinc-700 uppercase tracking-widest truncate">
                                    {cores.length === 0 ? 'nenhuma cor' : `${cores.length} cores`}
                                </span>
                            </div>
                            <button type="button"
                                onClick={() => setCores(c => [...c, { nome: '', hex: '#CCCCCC', faixa: 'Padrão' }])}
                                className={`${BOTAO_SUAVE} shrink-0`}>
                                <Plus size={14} /> Cor
                            </button>
                        </div>

                        {/* ── Atalhos ──
                            Digitar cor por cor é o passo mais chato do cadastro:
                            uma cartela de fornecedor tem dezenas, e quase todo
                            tecido de uniforme repete o mesmo núcleo. Os três
                            atalhos somam à lista atual em vez de substituí-la,
                            então dá para combinar os três. */}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <button type="button"
                                onClick={() => acrescentarCores(CARTELA_PADRAO)}
                                title="Traz as cores que quase todo uniforme tem"
                                className={BOTAO_SECUNDARIO}>
                                <Sparkles size={14} /> Cartela padrão
                            </button>

                            {familiasComCartela.length > 0 && (
                                <div className="w-56">
                                    <SearchableSelect
                                        value=""
                                        onChange={(fam) => {
                                            if (!fam) return;
                                            acrescentarCores(fabricColors
                                                .filter(c => c.fabric_family === fam)
                                                .map(c => ({
                                                    nome: c.color_name,
                                                    hex: c.hex,
                                                    faixa: c.color_tier as FaixaDeCor,
                                                })));
                                        }}
                                        options={[
                                            { value: '', label: 'COPIAR DE OUTRO TECIDO...' },
                                            ...familiasComCartela.map(f => ({ value: f, label: f })),
                                        ]}
                                        placeholder="COPIAR DE OUTRO TECIDO..."
                                    />
                                </div>
                            )}

                            <button type="button"
                                onClick={() => setColando(c => !c)}
                                title="Colar a lista do mostruário, uma cor por linha"
                                className={colando ? BOTAO_SUAVE : BOTAO_SECUNDARIO}>
                                <ClipboardPaste size={14} /> Colar lista
                            </button>

                            {cores.length > 0 && (
                                <button type="button"
                                    onClick={() => setCores([])}
                                    className={`${BOTAO_SECUNDARIO} ml-auto`}>
                                    Limpar
                                </button>
                            )}
                        </div>

                        {colando && (
                            <div className={`mb-3 ${ITEM} p-3`}>
                                <textarea
                                    autoFocus
                                    className={`${CAMPO} w-full min-h-[7rem] py-2 font-mono resize-none`}
                                    placeholder={'Uma cor por linha:\n\nAZUL MARINHO\nVERDE BANDEIRA #006B3F ; ESPECIAL\nCINZA #808080'}
                                    value={textoColado}
                                    onChange={e => setTextoColado(e.target.value)}
                                />
                                <div className="flex items-center justify-between gap-3 mt-2">
                                    <p className="text-[9px] text-zinc-600 leading-snug">
                                        O <b>#hex</b> e a faixa depois de <b>;</b> são opcionais — sem eles a cor entra
                                        em cinza, na faixa Padrão, e você ajusta na lista.
                                    </p>
                                    <button type="button"
                                        disabled={!textoColado.trim()}
                                        onClick={() => {
                                            acrescentarCores(interpretarListaDeCores(textoColado));
                                            setTextoColado('');
                                            setColando(false);
                                        }}
                                        className={`${BOTAO_SUAVE} shrink-0`}>
                                        Acrescentar
                                    </button>
                                </div>
                            </div>
                        )}

                        {cores.length === 0 ? (
                            <p className="text-[10px] text-zinc-600 leading-relaxed border border-dashed border-zinc-800 rounded-xl px-4 py-4">
                                Sem cartela, o orçamento pede a cor em texto livre e nada define a faixa de preço.
                                Comece pela <b className="text-zinc-400">cartela padrão</b> acima, copie a de um tecido
                                parecido ou cole a lista do mostruário — depois é só ajustar.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {cores.map((c, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <input type="color" value={c.hex} title="Cor da amostra"
                                            onChange={e => mexerNaCor(i, 'hex', e.target.value)}
                                            className="w-9 h-9 shrink-0 rounded-lg bg-transparent border border-zinc-800 cursor-pointer" />
                                        <input className={`${Input} flex-1 min-w-0`} placeholder="NOME DA COR"
                                            value={c.nome}
                                            onChange={e => mexerNaCor(i, 'nome', e.target.value.toUpperCase())} />
                                        <div className="w-36 shrink-0">
                                            <SearchableSelect
                                                value={c.faixa}
                                                onChange={v => mexerNaCor(i, 'faixa', v)}
                                                options={FAIXAS_DE_COR.map(f => ({ value: f, label: f.toUpperCase() }))}
                                            />
                                        </div>
                                        <button type="button" title="Remover cor" aria-label="Remover cor"
                                            onClick={() => setCores(prev => prev.filter((_, k) => k !== i))}
                                            className={`${BOTAO_PERIGO} w-10 px-0 shrink-0`}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-zinc-900 flex justify-end gap-3 shrink-0 bg-zinc-950/40">
                    <button onClick={onClose}
                        className={BOTAO_SECUNDARIO}>
                        Cancelar
                    </button>
                    <button onClick={salvar} disabled={salvando}
                        className={BOTAO_PRINCIPAL}>
                        <Check size={14} /> {salvando ? 'Salvando...' : 'Salvar tecido'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default NovoTecidoModal;
