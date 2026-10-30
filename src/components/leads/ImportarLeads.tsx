import React, { useMemo, useRef, useState } from 'react';
import {
    Upload, FileText, Check, AlertTriangle, Copy, ChevronDown, ChevronUp,
    Sparkles, ArrowRight, X,
} from 'lucide-react';
import {
    lerCsv, classificarImportacao, resumirImportacao,
    ROTULO_DA_CATEGORIA, EXPLICACAO_DA_CATEGORIA, COLUNAS_ESPERADAS,
} from '@/utils/importacaoDeLeads';
import type { Categoria, Classificacao, ClienteConhecido } from '@/utils/importacaoDeLeads';
import type { Lead } from '@/utils/funilDeLeads';
import { PRE_PROMPT_DO_CSV } from '@/utils/prePromptDoCsv';
import { CARTAO, ITEM, CAMPO, ROTULO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

import { mensagemDeErro } from '@/utils/errorHandling';
interface Props {
    clientes: ClienteConhecido[];
    leadsExistentes: Lead[];
    onImportar: (classificacao: Classificacao) => Promise<{ criados: number; completados: number } | null>;
    onPronto: () => void;
}

const TOM: Record<Categoria, string> = {
    'novo': 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20',
    'filial-de-cliente': 'text-amber-400 border-amber-500/30 bg-amber-950/20',
    'ja-lead': 'text-sky-400 border-sky-500/30 bg-sky-950/20',
    'ja-cliente': 'text-zinc-500 border-zinc-800 bg-zinc-950/40',
    'incompleto': 'text-rose-400 border-rose-500/30 bg-rose-950/20',
};

const ORDEM: Categoria[] = ['novo', 'filial-de-cliente', 'ja-lead', 'ja-cliente', 'incompleto'];

/**
 * Importação de leads em três passos: ler, conferir, gravar.
 *
 * NUNCA grava direto, e essa é a decisão central da tela. Já existem dezenas de
 * clientes cadastrados; um CSV de prospecção vai trazer alguns deles de volta, e
 * importá-los como leads cria um funil que mente — a taxa de conversão passa a
 * contar quem já tinha convertido antes de a lista existir.
 *
 * A conferência é onde aparece o caso que vale ouro: FILIAL de cliente
 * existente, achada pela raiz do CNPJ. É a venda mais fácil de qualquer lista, e
 * sem esse cruzamento ela entraria como uma linha igual a todas as outras.
 */
export const ImportarLeads: React.FC<Props> = ({
    clientes, leadsExistentes, onImportar, onPronto,
}) => {
    const [texto, setTexto] = useState('');
    const [nomeDoArquivo, setNomeDoArquivo] = useState('');
    const [gravando, setGravando] = useState(false);
    const [resultado, setResultado] = useState<{ criados: number; completados: number } | null>(null);
    const [erro, setErro] = useState('');
    const [promptAberto, setPromptAberto] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const [expandida, setExpandida] = useState<Categoria | null>(null);
    const arquivoRef = useRef<HTMLInputElement>(null);

    const classificacao = useMemo(() => {
        if (!texto.trim()) return null;
        return classificarImportacao(lerCsv(texto), clientes, leadsExistentes);
    }, [texto, clientes, leadsExistentes]);

    const lerArquivo = (f: File) => {
        setNomeDoArquivo(f.name);
        setResultado(null);
        setErro('');
        const leitor = new FileReader();
        leitor.onload = () => setTexto(String(leitor.result || ''));
        leitor.onerror = () => setErro('Não consegui ler o arquivo.');
        // UTF-8 explícito: o CSV vem de IA e da web, quase sempre em UTF-8. O
        // arquivo salvo pelo Excel em ANSI vai mostrar acento trocado na
        // conferência — que é exatamente onde se quer que isso apareça, antes
        // de gravar, e não depois.
        leitor.readAsText(f, 'UTF-8');
    };

    const copiarPrompt = async () => {
        try {
            await navigator.clipboard.writeText(PRE_PROMPT_DO_CSV);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        } catch {
            setErro('Não consegui copiar. Selecione o texto e copie à mão.');
        }
    };

    const gravar = async () => {
        if (!classificacao || classificacao.aImportar.length === 0) return;
        setGravando(true);
        setErro('');
        try {
            const r = await onImportar(classificacao);
            if (r === null) {
                setErro('Importação indisponível — rode supabase/leads_prospeccao.sql. Nada foi gravado.');
                return;
            }
            setResultado(r);
            setTexto('');
            setNomeDoArquivo('');
            onPronto();
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Falha ao importar'));
        } finally {
            setGravando(false);
        }
    };

    return (
        <div className="space-y-5 pb-10 ease-out animate-in fade-in duration-200">
            {/* ── Passo 0: o pré-prompt ──────────────────────────────────── */}
            <section className={`${CARTAO} overflow-hidden`}>
                <button
                    onClick={() => setPromptAberto(v => !v)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-zinc-900/40 transition-colors"
                >
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                        <Sparkles size={16} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white uppercase tracking-tight">
                            Lista bruta? Formate com IA antes
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                            Cole este prompt em qualquer IA, junto com a sua lista. Ele devolve o CSV
                            no formato exato desta tela.
                        </p>
                    </div>
                    {promptAberto ? <ChevronUp size={16} className="text-zinc-600 shrink-0" />
                                  : <ChevronDown size={16} className="text-zinc-600 shrink-0" />}
                </button>

                {promptAberto && (
                    <div className="px-5 pb-5 space-y-3">
                        <button
                            onClick={copiarPrompt}
                            className={BOTAO_PRINCIPAL}
                        >
                            {copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar o prompt</>}
                        </button>
                        <pre className="text-[10px] leading-relaxed text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap max-h-72 overflow-y-auto font-mono">
{PRE_PROMPT_DO_CSV}
                        </pre>
                        <p className="text-[10px] text-zinc-600 leading-snug">
                            A regra nº 1 é a que mais importa: <strong className="text-zinc-400">campo vazio é
                            melhor que campo inventado</strong>. Um telefone plausível e errado é pior que um
                            branco, porque alguém vai ligar.
                        </p>
                    </div>
                )}
            </section>

            {/* ── Passo 1: ler ───────────────────────────────────────────── */}
            <section className={`${CARTAO} p-5 space-y-3`}>
                <h3 className={`${ROTULO} flex items-center gap-2`}>
                    <FileText size={14} className="text-amber-500" /> 1. O arquivo
                </h3>

                <div className="flex items-center gap-2 flex-wrap">
                    <input
                        ref={arquivoRef}
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }}
                    />
                    <button
                        onClick={() => arquivoRef.current?.click()}
                        className={BOTAO_SECUNDARIO}
                    >
                        <Upload size={14} /> Escolher CSV
                    </button>
                    {nomeDoArquivo && (
                        <span className="flex items-center gap-2 text-[11px] text-zinc-500 font-medium">
                            {nomeDoArquivo}
                            <button
                                onClick={() => { setTexto(''); setNomeDoArquivo(''); }}
                                className={`${BOTAO_SECUNDARIO} w-10 px-0`}
                                title="Descartar"
                                aria-label="Descartar o arquivo"
                            >
                                <X size={18} />
                            </button>
                        </span>
                    )}
                </div>

                <p className="text-[10px] text-zinc-600">ou cole o CSV aqui:</p>
                <textarea
                    value={texto}
                    onChange={e => { setTexto(e.target.value); setResultado(null); }}
                    rows={4}
                    placeholder={COLUNAS_ESPERADAS.join(',')}
                    className={`${CAMPO} h-auto min-h-[104px] w-full py-3 font-mono resize-y`}
                />
            </section>

            {/* ── Passo 2: conferir ──────────────────────────────────────── */}
            {classificacao && classificacao.total > 0 && (
                <section className={`${CARTAO} p-5 space-y-4`}>
                    <h3 className={`${ROTULO} flex items-center gap-2`}>
                        <Check size={14} className="text-amber-500" /> 2. Confira antes de gravar
                    </h3>

                    {classificacao.faltando.length > 0 && (
                        <p className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/[0.07] border border-amber-500/25 rounded-xl px-4 py-3 leading-snug">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <span>
                                O arquivo não trouxe: <strong>{classificacao.faltando.join(', ')}</strong>.
                                Esses campos entram vazios — dá para importar assim e completar depois.
                            </span>
                        </p>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {ORDEM.map(cat => {
                            const n = classificacao.contagem[cat];
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setExpandida(expandida === cat ? null : cat)}
                                    disabled={n === 0}
                                    className={`rounded-xl border px-3 py-3 text-left transition-colors disabled:opacity-30 ${TOM[cat]} ${
                                        expandida === cat ? 'ring-1 ring-inset ring-current' : ''
                                    }`}
                                >
                                    <p className="text-xl font-black tabular-nums">{n}</p>
                                    <p className="text-[9px] font-black uppercase tracking-widest mt-0.5 leading-tight">
                                        {ROTULO_DA_CATEGORIA[cat]}
                                    </p>
                                </button>
                            );
                        })}
                    </div>

                    {expandida && (
                        <div className="space-y-2">
                            <p className="text-[11px] text-zinc-500 leading-snug">
                                {EXPLICACAO_DA_CATEGORIA[expandida]}
                            </p>
                            <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                                {classificacao.linhas
                                    .filter(l => l.categoria === expandida)
                                    .map(l => (
                                        <div
                                            key={l.numero}
                                            className={`${ITEM} flex items-center gap-3 px-3 py-2`}
                                        >
                                            <span className="text-[9px] font-mono text-zinc-700 w-8 shrink-0">
                                                {l.numero}
                                            </span>
                                            <span className="text-[11px] font-bold text-zinc-300 truncate flex-1">
                                                {l.lead.razao_social || '(sem razão social)'}
                                            </span>
                                            {l.clienteRelacionado && (
                                                <span className="text-[10px] text-zinc-600 truncate max-w-[40%] shrink-0">
                                                    → {l.clienteRelacionado.nome}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* ── Passo 3: gravar ────────────────────────────────────────── */}
            {classificacao && classificacao.total > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={gravar}
                        disabled={gravando || classificacao.aImportar.length === 0}
                        className={`${BOTAO_PRINCIPAL} h-auto min-h-10 max-w-full py-2`}
                    >
                        {gravando ? 'Gravando...' : resumirImportacao(classificacao)}
                        {!gravando && classificacao.aImportar.length > 0 && <ArrowRight size={14} />}
                    </button>
                    <p className="text-[10px] text-zinc-600">
                        Reimportar o mesmo arquivo não duplica nada — só preenche o que estiver vazio.
                    </p>
                </div>
            )}

            {resultado && (
                <p className="flex items-center gap-3 text-xs text-emerald-300 bg-emerald-500/[0.07] border border-emerald-500/25 rounded-xl px-4 py-3">
                    <Check size={14} />
                    {resultado.criados} {resultado.criados === 1 ? 'lead criado' : 'leads criados'}
                    {resultado.completados > 0 && `, ${resultado.completados} completados`}.
                </p>
            )}

            {erro && (
                <p className="flex items-start gap-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-xl px-4 py-3 leading-snug">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {erro}
                </p>
            )}
        </div>
    );
};

export default ImportarLeads;
