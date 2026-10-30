import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Layers, AlertTriangle, Check, Palette, Sparkles, ClipboardPaste, ArrowUp, ArrowDown } from 'lucide-react';
import SearchableSelect from '@/components/common/SearchableSelect';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { invalidarCustoDeReferencia } from '@/hooks/useTabelaVerdade';
import { useEscFecha } from '@/hooks/useEscFecha';
import { MAX_FAIXAS, type Catalogo } from '@/utils/tabelaVerdade';
import {
    montarNomeDeTecido, separarNomeDeTecido, limparCartela, CARTELA_PADRAO, interpretarListaDeCores,
} from '@/utils/nomeDeTecido';
import type { CorDaCartela } from '@/utils/nomeDeTecido';
import { ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE, BOTAO_SECUNDARIO, BOTAO_PERIGO } from '@/components/finance/ui/estilo';

import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
import { useAtalho } from '@/hooks/useAtalho';
/**
 * O tecido da tabela verdade (v3.1): nome, unidade, rendimento, faixas de cor (1 a 6, livres)
 * e a cartela que liga cada cor a uma faixa. Salva tudo numa chamada (salvar_tecido_tipo), que
 * cria o insumo de cada faixa nova e mantém insumo, cartela e nome andando juntos.
 *
 * Substitui o NovoTecidoModal (3 faixas fixas e custo digitado no insumo). Preço não mora aqui:
 * é a grade da tabela de preços, por condição de pagamento e com histórico.
 */

const Input = `${CAMPO} w-full uppercase`;
const Label = `${ROTULO_PEQUENO} block mb-2`;
/** Ponto de partida de tecido novo: o comum das tabelas de malharia. Renomeia ou tira à vontade. */
const FAIXAS_INICIAIS = ['Branco', 'Claras', 'Escuras'];

type FaixaUI = { id?: string; nome: string };

export function EditorDeTecido({ linhaId, tipoId, catalogo, onClose, onSalvou }: {
    linhaId: string; tipoId?: string; catalogo: Catalogo; onClose: () => void; onSalvou: () => void;
}) {
    const tipo = tipoId ? catalogo.tipos.find(t => t.id === tipoId) : undefined;
    const faixasDoTipo = tipo ? catalogo.faixas.filter(f => f.tipo_id === tipo.id).sort((a, b) => a.ordem - b.ordem) : [];
    const nomeDaFaixa = new Map(faixasDoTipo.map(f => [f.id, f.nome]));

    const [partes, setPartes] = useState(() => separarNomeDeTecido(tipo?.nome || ''));
    // Abrir e salvar sem mexer no nome não pode renomear o tecido (o nome antigo pode não seguir
    // o padrão montado, e renomear troca a chave que liga cartela e orçamento).
    const [mexeuNoNome, setMexeuNoNome] = useState(!tipo);
    const [unidade, setUnidade] = useState<'m' | 'kg'>(tipo?.unidade ?? 'm');
    const [rendimento, setRendimento] = useState(tipo?.rendimento_m_por_kg ? String(tipo.rendimento_m_por_kg) : '');
    const [faixas, setFaixas] = useState<FaixaUI[]>(() =>
        faixasDoTipo.length ? faixasDoTipo.map(f => ({ id: f.id, nome: f.nome })) : FAIXAS_INICIAIS.map(nome => ({ nome })));
    const [cores, setCores] = useState<CorDaCartela[]>(() => (catalogo.cores ?? [])
        .filter(c => nomeDaFaixa.has(c.faixa_id))
        .map(c => ({ nome: c.nome, hex: c.hex, faixa: nomeDaFaixa.get(c.faixa_id)! })));
    const [colando, setColando] = useState(false);
    const [textoColado, setTextoColado] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const saida = useSaidaProtegida(() => { if (!salvando) onClose(); });
    useEscFecha(true, saida.pedirParaFechar);

    const nome = mexeuNoNome ? montarNomeDeTecido(partes) : (tipo?.nome ?? '');
    const nomesDasFaixas = faixas.map(f => f.nome.trim()).filter(Boolean);
    const semFaixa = cores.filter(c => !nomesDasFaixas.some(f => f.toLowerCase() === c.faixa.toLowerCase())).length;

    /** Outros tecidos deste fornecedor com cartela — os que vale a pena copiar. */
    const outrosComCartela = useMemo(() => catalogo.tipos.filter(t => t.id !== tipoId
        && (catalogo.cores ?? []).some(c => catalogo.faixas.some(f => f.id === c.faixa_id && f.tipo_id === t.id))), [catalogo, tipoId]);

    const mudarParte = (campo: keyof typeof partes, valor: string) => { setMexeuNoNome(true); setPartes(p => ({ ...p, [campo]: valor.toUpperCase() })); };
    const acrescentarCores = (novas: CorDaCartela[]) => setCores(prev => limparCartela([...prev, ...novas]));
    const mexerNaCor = (i: number, campo: keyof CorDaCartela, valor: string) =>
        setCores(prev => prev.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)));
    const moverFaixa = (i: number, d: -1 | 1) => setFaixas(prev => {
        const j = i + d;
        if (j < 0 || j >= prev.length) return prev;
        const nova = [...prev]; [nova[i], nova[j]] = [nova[j], nova[i]]; return nova;
    });
    // Renomear a faixa leva as cores dela junto.
    const renomearFaixa = (i: number, novo: string) => {
        const antigo = faixas[i].nome;
        setFaixas(prev => prev.map((f, k) => (k === i ? { ...f, nome: novo } : f)));
        setCores(prev => prev.map(c => (c.faixa === antigo ? { ...c, faixa: novo } : c)));
    };

    const salvar = async () => {
        setErro('');
        if (!nome) { setErro('Dê ao menos um tipo ao tecido: é o nome que liga insumo, cartela e busca.'); return; }
        const lista = faixas.map(f => ({ ...f, nome: f.nome.trim() })).filter(f => f.nome);
        if (lista.length < 1 || lista.length > MAX_FAIXAS) { setErro(`O tecido tem de ter de 1 a ${MAX_FAIXAS} faixas.`); return; }
        const rend = Number(rendimento.replace(',', '.'));
        if (unidade === 'kg' && !(rend > 0)) { setErro('Tecido em kg precisa do rendimento (metros por kg).'); return; }
        const cartela = limparCartela(cores);
        if (semFaixa) { setErro(`${semFaixa} cor(es) numa faixa que não existe: mova antes de salvar.`); return; }
        setSalvando(true);
        try {
            await tabelaVerdadeRepository.salvarTipo({
                id: tipo?.id, linha_id: linhaId, nome, unidade,
                rendimento_m_por_kg: rend > 0 ? rend : null,
                composicao: partes.composicao || null,
                faixas: lista.map((f, i) => ({ id: f.id, nome: f.nome, ordem: i + 1 })),
                cores: cartela.map(c => ({ nome: c.nome, hex: c.hex, faixa: c.faixa })),
            });
            invalidarCustoDeReferencia();
            onSalvou();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Erro ao salvar o tecido.');
        } finally {
            setSalvando(false);
        }
    };

    useAtalho({ salvar: () => { if (!salvando) void salvar(); } });

    const opcoesDeFaixa = nomesDasFaixas.map(f => ({ value: f, label: f.toUpperCase() }));

    return <>{saida.confirmacao}{createPortal(
        <div className="fixed inset-0 bg-zinc-950/85 flex items-center justify-center z-sobreposto p-4 backdrop-blur-md" role="dialog" aria-modal="true">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" {...saida.aoMexer}>
                <div className="px-5 py-4 bg-zinc-950/50 border-b border-zinc-900 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl shrink-0"><Layers size={16} className="text-amber-500" /></div>
                        <div className="min-w-0">
                            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.2em]">{tipo ? 'Editar tecido' : 'Novo tecido'}</h3>
                            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-0.5 truncate">{nome || 'monte o nome abaixo'}</p>
                        </div>
                    </div>
                    <button onClick={saida.pedirParaFechar} aria-label="Fechar" title="Fechar" className={`${BOTAO_SECUNDARIO} w-11 px-0 shrink-0`}><X size={18} /></button>
                </div>

                <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar">
                    {erro && (
                        <div role="alert" className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl text-[11px] font-bold flex items-start gap-3">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {erro}
                        </div>
                    )}

                    <div>
                        <p className={`${ROTULO} mb-3`}>Identidade</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div><label htmlFor="tecido-tipo" className={Label}>Tipo *</label><input id="tecido-tipo" className={Input} placeholder="BRIM" value={partes.tipo || ''} onChange={e => mudarParte('tipo', e.target.value)} /></div>
                            <div><label htmlFor="tecido-composicao" className={Label}>Composição</label><input id="tecido-composicao" className={Input} placeholder="LEVE 100% ALGODÃO" value={partes.composicao || ''} onChange={e => mudarParte('composicao', e.target.value)} /></div>
                            <div><label htmlFor="tecido-marca" className={Label}>Marca</label><input id="tecido-marca" className={Input} placeholder="CEDRO" value={partes.marca || ''} onChange={e => mudarParte('marca', e.target.value)} /></div>
                            <div><label htmlFor="tecido-referencia" className={Label}>Referência</label><input id="tecido-referencia" className={Input} placeholder="CEDROPAC" value={partes.referencia || ''} onChange={e => mudarParte('referencia', e.target.value)} /></div>
                        </div>
                        {nome && <p className="text-[10px] text-zinc-500 mt-2.5 ml-1">Vai ficar: <b className="text-amber-500 font-mono">{nome}</b></p>}
                    </div>

                    <div>
                        <p className={`${ROTULO} mb-3`}>Como se compra</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className={Label}>Unidade</label>
                                <SearchableSelect value={unidade} onChange={(v) => setUnidade(v === 'kg' ? 'kg' : 'm')}
                                    options={[{ value: 'm', label: 'METRO' }, { value: 'kg', label: 'QUILO' }]} />
                            </div>
                            <div>
                                <label htmlFor="tecido-rendimento" className={Label}>Rendimento (m/kg){unidade === 'kg' ? ' *' : ''}</label>
                                <input id="tecido-rendimento" inputMode="decimal" className={Input} placeholder="3,20" value={rendimento} onChange={e => setRendimento(e.target.value)} />
                            </div>
                        </div>
                        <p className="text-[10px] text-zinc-600 mt-2 ml-1 leading-relaxed">
                            {unidade === 'kg'
                                ? <>Comprado em quilo, o custo por metro sai de <b>preço ÷ rendimento</b>.</>
                                : <>Em metro, o rendimento só é usado para converter frete cobrado por kg.</>}
                        </p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-3 mb-1">
                            <p className={ROTULO}>Faixas de cor</p>
                            <button type="button" disabled={faixas.length >= MAX_FAIXAS} className={`${BOTAO_SUAVE} shrink-0`}
                                onClick={() => setFaixas(prev => [...prev, { nome: '' }])}><Plus size={14} /> Faixa</button>
                        </div>
                        <p className="text-[10px] text-zinc-600 mb-3 leading-relaxed">
                            De 1 a {MAX_FAIXAS}, como a tabela do fornecedor. Cada faixa tem o seu preço na grade.
                            Faixa já usada (compra, sobra registrada, ficha ou orçamento) não pode sair.
                        </p>
                        <div className="space-y-2">
                            {faixas.map((f, i) => (
                                <div key={f.id ?? `nova-${i}`} className="flex items-center gap-2">
                                    <span className="w-6 shrink-0 text-center text-xs text-zinc-500">{i + 1}</span>
                                    <input className={`${CAMPO} flex-1 min-w-0`} placeholder="Ex.: Escuras" value={f.nome} aria-label={`Nome da faixa ${i + 1}`}
                                        onChange={e => renomearFaixa(i, e.target.value)} />
                                    <button type="button" aria-label="Subir faixa" disabled={i === 0} onClick={() => moverFaixa(i, -1)}
                                        className={`${BOTAO_SECUNDARIO} w-11 px-0 shrink-0`}><ArrowUp size={16} /></button>
                                    <button type="button" aria-label="Descer faixa" disabled={i === faixas.length - 1} onClick={() => moverFaixa(i, 1)}
                                        className={`${BOTAO_SECUNDARIO} w-11 px-0 shrink-0`}><ArrowDown size={16} /></button>
                                    <button type="button" aria-label={`Tirar a faixa ${f.nome || i + 1}`} disabled={faixas.length <= 1}
                                        onClick={() => setFaixas(prev => prev.filter((_, k) => k !== i))}
                                        className={`${BOTAO_PERIGO} w-11 px-0 shrink-0`}><Trash2 size={16} /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <Palette size={12} className="text-amber-500 shrink-0" />
                                <p className={ROTULO}>Cartela de cores</p>
                                <span className="text-[10px] text-zinc-600 uppercase tracking-widest truncate">{cores.length === 0 ? 'nenhuma cor' : `${cores.length} cores`}</span>
                            </div>
                            <button type="button" onClick={() => setCores(c => [...c, { nome: '', hex: '#CCCCCC', faixa: nomesDasFaixas[0] ?? '' }])}
                                className={`${BOTAO_SUAVE} shrink-0`}><Plus size={14} /> Cor</button>
                        </div>
                        {semFaixa > 0 && (
                            <p className="mb-3 text-[11px] font-bold text-amber-400 flex items-center gap-1.5"><AlertTriangle size={12} /> {semFaixa} cor(es) sem faixa: escolha a faixa de cada uma</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <button type="button" onClick={() => acrescentarCores(CARTELA_PADRAO.map(c => ({ ...c, faixa: nomesDasFaixas.includes(c.faixa) ? c.faixa : (nomesDasFaixas[0] ?? c.faixa) })))}
                                title="Traz as cores que quase todo uniforme tem" className={BOTAO_SECUNDARIO}><Sparkles size={14} /> Cartela padrão</button>
                            {outrosComCartela.length > 0 && (
                                <div className="w-56">
                                    <SearchableSelect value="" placeholder="COPIAR DE OUTRO TECIDO..."
                                        onChange={(id) => {
                                            if (!id) return;
                                            const deLa = new Map(catalogo.faixas.filter(f => f.tipo_id === id).map(f => [f.id, f.nome]));
                                            acrescentarCores((catalogo.cores ?? []).filter(c => deLa.has(c.faixa_id))
                                                .map(c => ({ nome: c.nome, hex: c.hex, faixa: deLa.get(c.faixa_id)! })));
                                        }}
                                        options={[{ value: '', label: 'COPIAR DE OUTRO TECIDO...' }, ...outrosComCartela.map(t => ({ value: t.id, label: t.nome.toUpperCase() }))]} />
                                </div>
                            )}
                            <button type="button" onClick={() => setColando(c => !c)} title="Colar a lista do mostruário, uma cor por linha"
                                className={colando ? BOTAO_SUAVE : BOTAO_SECUNDARIO}><ClipboardPaste size={14} /> Colar lista</button>
                            {cores.length > 0 && <button type="button" onClick={() => setCores([])} className={`${BOTAO_SECUNDARIO} ml-auto`}>Limpar</button>}
                        </div>
                        {colando && (
                            <div className={`mb-3 ${ITEM} p-3`}>
                                <textarea autoFocus className={`${CAMPO} w-full min-h-[7rem] py-2 font-mono resize-none`} value={textoColado}
                                    placeholder={'Uma cor por linha:\n\nAZUL MARINHO\nVERDE BANDEIRA #006B3F ; ESCURAS\nCINZA #808080'}
                                    onChange={e => setTextoColado(e.target.value)} />
                                <div className="flex items-center justify-between gap-3 mt-2">
                                    <p className="text-[10px] text-zinc-600 leading-snug">O <b>#hex</b> e a faixa depois de <b>;</b> são opcionais — sem eles a cor entra em cinza, na primeira faixa.</p>
                                    <button type="button" disabled={!textoColado.trim()} className={`${BOTAO_SUAVE} shrink-0`}
                                        onClick={() => { acrescentarCores(interpretarListaDeCores(textoColado, nomesDasFaixas[0] ?? 'Padrão', nomesDasFaixas)); setTextoColado(''); setColando(false); }}>
                                        Acrescentar
                                    </button>
                                </div>
                            </div>
                        )}
                        {cores.length === 0 ? (
                            <p className="text-[11px] text-zinc-600 leading-relaxed border border-dashed border-zinc-800 rounded-xl px-4 py-4">
                                Sem cartela, o orçamento pede a cor em texto livre e nada define a faixa de preço.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {cores.map((c, i) => {
                                    const orfa = !nomesDasFaixas.some(f => f.toLowerCase() === c.faixa.toLowerCase());
                                    return (
                                        <div key={i} className="flex items-center gap-2">
                                            <input type="color" value={c.hex} title="Cor da amostra" aria-label={`Amostra de ${c.nome || 'cor'}`} onChange={e => mexerNaCor(i, 'hex', e.target.value)}
                                                className="w-11 h-11 shrink-0 rounded-lg bg-transparent border border-zinc-800 cursor-pointer" />
                                            <input className={`${Input} flex-1 min-w-0`} placeholder="NOME DA COR" value={c.nome} onChange={e => mexerNaCor(i, 'nome', e.target.value.toUpperCase())} />
                                            <div className={`w-36 shrink-0 ${orfa ? 'rounded-xl ring-1 ring-amber-500/60' : ''}`}>
                                                <SearchableSelect value={orfa ? '' : c.faixa} onChange={v => mexerNaCor(i, 'faixa', v)} options={opcoesDeFaixa} placeholder="FAIXA..." />
                                            </div>
                                            <button type="button" title="Remover cor" aria-label="Remover cor" onClick={() => setCores(prev => prev.filter((_, k) => k !== i))}
                                                className={`${BOTAO_PERIGO} w-11 px-0 shrink-0`}><Trash2 size={18} /></button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-zinc-900 flex justify-end gap-3 shrink-0 bg-zinc-950/40">
                    <button onClick={saida.pedirParaFechar} className={BOTAO_SECUNDARIO}>Cancelar</button>
                    <button onClick={salvar} disabled={salvando} className={BOTAO_PRINCIPAL}><Check size={14} /> {salvando ? 'Salvando...' : 'Salvar tecido'}</button>
                </div>
            </div>
        </div>,
        document.body,
    )}</>;
}
