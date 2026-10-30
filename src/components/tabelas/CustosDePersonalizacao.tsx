import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Calculator, Plus, Trash2 } from 'lucide-react';
import SearchableSelect from '@/components/common/SearchableSelect';
import { ConfirmModal } from '@/components/finance';
import { storageService } from '@/services/storage';
import { custosDePersonalizacaoRepository as repo, type CustoDtfDb, type LinhaDeSilkDb } from '@/repositories/custosDePersonalizacaoRepository';
import { custoBordado, custoDtf, custoSilk, encaixeDtf } from '@/utils/custosDePersonalizacao';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { useArtesBordado, useNotasPersonalizacao } from '@/hooks/usePersonalizacao';
import { useToast } from '@/hooks/useToast';
import { parseBRL } from '@/utils/currency';
import { mensagemDeErro } from '@/utils/errorHandling';
import { CARTAO, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_SECUNDARIO, BOTAO_SUAVE, pilula } from '@/components/finance/ui/estilo';

const fmt = (v: number | null | undefined, casas = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(casas).replace('.', ','));
const num = (t: string) => parseBRL(t);

function useEstamparias() {
    const { data = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => storageService.getSuppliers(), staleTime: 1000 * 60 * 5 });
    return data as { id: string; company_name: string }[];
}

function SemMigracao({ arquivo }: { arquivo: string }) {
    return (
        <div className={`${CARTAO} p-5 space-y-2`}>
            <p className="text-amber-500 font-black uppercase text-xs tracking-[0.2em] flex items-center gap-2"><AlertTriangle size={16} /> Migração pendente</p>
            <p className="text-zinc-400 text-sm">Rode <code className="text-amber-400">supabase/{arquivo}</code> no SQL Editor. Ele só cria tabelas novas.</p>
        </div>
    );
}

/** Apagar da tabela não tem desfazer: o botão diz o verbo e a mensagem diz o que se perde. */
type Apagando = { titulo: string; mensagem: string; rotulo: string; acao: () => Promise<void> } | null;
function ConfirmarApagar({ alvo, fechar }: { alvo: Apagando; fechar: () => void }) {
    return (
        <ConfirmModal isOpen={!!alvo} title={alvo?.titulo ?? ''} message={alvo?.mensagem ?? ''} confirmLabel={alvo?.rotulo} isDanger
            onConfirm={() => { const a = alvo; fechar(); void a?.acao(); }} onClose={fechar} />
    );
}

function Cabecalho({ titulo, texto }: { titulo: string; texto: string }) {
    return (
        <div className={`${CARTAO} p-4`}>
            <h2 className="text-sm font-black text-white uppercase tracking-widest">{titulo}</h2>
            <p className={`${ROTULO_PEQUENO} mt-1`}>{texto}</p>
        </div>
    );
}

// ── Silk ──────────────────────────────────────────────────────────────────────────────────────

/** Tamanhos que as estamparias costumam tabelar. Atalho de digitação: o campo é livre. */
const TAMANHOS_COMUNS = ['10X10', 'A6', 'A5', 'A4', 'A3', 'PEITO', 'COSTAS'];

export function CustoSilk() {
    const estamparias = useEstamparias();
    const nome = useMemo(() => new Map(estamparias.map(e => [e.id, e.company_name])), [estamparias]);
    const [grade, setGrade] = useState<LinhaDeSilkDb[] | null | undefined>(undefined);
    const [estampariaId, setEstampariaId] = useState('');
    const [novoTamanho, setNovoTamanho] = useState('');
    const [maxCores, setMaxCores] = useState(4);
    const [calc, setCalc] = useState({ tamanho: '', cores: '1', qtd: '100' });
    const [apagando, setApagando] = useState<Apagando>(null);
    const { mostrar } = useMostrarValor();
    const { showToast } = useToast();

    const carregar = useCallback(async () => {
        try { setGrade(await repo.silk()); } catch (e) { showToast(mensagemDeErro(e, 'Não consegui ler a grade de silk.'), 'error'); setGrade([]); }
    }, [showToast]);
    useEffect(() => { void carregar(); }, [carregar]);

    const daEstamparia = (grade ?? []).filter(l => l.fornecedor_id === estampariaId);
    const tamanhos = [...new Set(daEstamparia.map(l => l.tamanho))];
    const colunas = Math.max(maxCores, ...daEstamparia.map(l => l.cores), 1);
    const celula = (t: string, c: number) => daEstamparia.find(l => l.tamanho === t && l.cores === c);
    const todosTamanhos = [...new Set((grade ?? []).map(l => l.tamanho))].sort();
    const resultado = calc.tamanho ? custoSilk(grade ?? [], calc.tamanho, Number(calc.cores), Math.max(0, Math.floor(num(calc.qtd)))) : [];

    const gravar = async (tamanho: string, cores: number, texto: string) => {
        const atual = celula(tamanho, cores);
        const v = texto.trim() === '' ? null : num(texto);
        try {
            if (v === null) { if (atual) await repo.apagarSilk(estampariaId, tamanho, cores); }
            else if (!atual || Math.abs(atual.valor - v) > 0.00005) await repo.gravarSilk({ fornecedor_id: estampariaId, tamanho, cores, valor: v });
            else return;
            await carregar();
        } catch (e) { showToast(mensagemDeErro(e, 'Não consegui gravar o valor.'), 'error'); }
    };
    const acrescentarTamanho = async (t: string) => {
        const tam = t.trim().toUpperCase();
        if (!tam || tamanhos.includes(tam) || !estampariaId) return;
        // O tamanho nasce com a coluna de 1 cor em zero: é a linha que a grade precisa para aparecer.
        try { await repo.gravarSilk({ fornecedor_id: estampariaId, tamanho: tam, cores: 1, valor: 0 }); setNovoTamanho(''); await carregar(); }
        catch (e) { showToast(mensagemDeErro(e, 'Não consegui criar o tamanho.'), 'error'); }
    };

    if (grade === undefined) return <p className="p-8 text-center text-zinc-600 text-xs">Carregando…</p>;
    if (grade === null) return <SemMigracao arquivo="custos_personalizacao_v3_e.sql" />;

    return (
        <div className="space-y-4">
            <Cabecalho titulo="Silk por estamparia" texto="Quanto cada estamparia cobra por peça, por tamanho e número de cores. Célula vazia = não faz." />
            <div className={`${CARTAO} p-4 space-y-3`}>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-72 max-w-full">
                        <span className={`${ROTULO_PEQUENO} block mb-1`}>Estamparia</span>
                        <SearchableSelect value={estampariaId} onChange={setEstampariaId} placeholder="ESCOLHA A ESTAMPARIA"
                            options={[{ value: '', label: 'ESCOLHA A ESTAMPARIA' }, ...estamparias.map(e => ({ value: e.id, label: e.company_name }))]} />
                    </div>
                    {estampariaId && <button type="button" className={BOTAO_SECUNDARIO} onClick={() => setMaxCores(colunas + 1)} disabled={colunas >= 12}><Plus size={14} /> Coluna de cor</button>}
                </div>
                {estampariaId && (<>
                    <div className="overflow-x-auto">
                        <table className="text-sm">
                            <thead><tr className="text-zinc-500">
                                <th className="text-left font-bold p-2">Tamanho</th>
                                {Array.from({ length: colunas }, (_, i) => <th key={i} className="text-right font-bold p-2 whitespace-nowrap">{i + 1} cor{i ? 'es' : ''}</th>)}
                                <th />
                            </tr></thead>
                            <tbody>
                                {tamanhos.length === 0 && <tr><td colSpan={colunas + 2} className="p-3 text-zinc-500 text-xs">Sem tamanho ainda: comece por um dos comuns abaixo.</td></tr>}
                                {tamanhos.map(t => (
                                    <tr key={t} className="border-t border-zinc-800">
                                        <td className="p-2 font-bold text-zinc-200 whitespace-nowrap">{t}</td>
                                        {Array.from({ length: colunas }, (_, i) => {
                                            const c = celula(t, i + 1);
                                            return (
                                                <td key={i} className="p-1">
                                                    <input key={`${t}-${i}-${c?.valor ?? ''}`} inputMode="decimal" aria-label={`Silk ${t} ${i + 1} cor(es)`} placeholder="—"
                                                        className={`${CAMPO} w-24 text-right`} defaultValue={c ? fmt(c.valor) : ''} onBlur={e => void gravar(t, i + 1, e.target.value)} />
                                                </td>
                                            );
                                        })}
                                        <td className="p-1">
                                            <button type="button" aria-label={`Tirar o tamanho ${t}`} title="Tirar o tamanho" className={`${BOTAO_SECUNDARIO} w-11 px-0`}
                                                onClick={() => setApagando({
                                                    titulo: `Tirar o tamanho ${t}?`, rotulo: `Tirar ${t}`,
                                                    mensagem: `Os valores de ${t} desta estamparia (todas as cores) saem da grade. Esta ação não tem desfazer.`,
                                                    acao: async () => { try { await repo.apagarSilk(estampariaId, t); await carregar(); } catch (e) { showToast(mensagemDeErro(e, 'Não consegui tirar.'), 'error'); } },
                                                })}>
                                                <Trash2 size={16} className="text-rose-400" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {TAMANHOS_COMUNS.filter(t => !tamanhos.includes(t)).map(t => (
                            <button key={t} type="button" className={pilula(false)} onClick={() => void acrescentarTamanho(t)}><Plus size={12} /> {t}</button>
                        ))}
                        <input className={`${CAMPO} w-32 uppercase`} placeholder="OUTRO…" aria-label="Novo tamanho" value={novoTamanho}
                            onChange={e => setNovoTamanho(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void acrescentarTamanho(novoTamanho); }} />
                        <button type="button" className={BOTAO_SUAVE} disabled={!novoTamanho.trim()} onClick={() => void acrescentarTamanho(novoTamanho)}>Acrescentar</button>
                    </div>
                </>)}
            </div>

            <div className={`${CARTAO} p-4 space-y-3`}>
                <p className={`${ROTULO} flex items-center gap-2`}><Calculator size={14} className="text-amber-500" /> Quanto custa</p>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-40"><span className={`${ROTULO_PEQUENO} block mb-1`}>Tamanho</span>
                        <SearchableSelect value={calc.tamanho} onChange={v => setCalc(c => ({ ...c, tamanho: v }))} placeholder="TAMANHO"
                            options={[{ value: '', label: 'TAMANHO' }, ...todosTamanhos.map(t => ({ value: t, label: t }))]} /></div>
                    <label className="w-24"><span className={`${ROTULO_PEQUENO} block mb-1`}>Cores</span>
                        <input className={`${CAMPO} w-full text-right`} inputMode="numeric" value={calc.cores} onChange={e => setCalc(c => ({ ...c, cores: e.target.value }))} /></label>
                    <label className="w-28"><span className={`${ROTULO_PEQUENO} block mb-1`}>Peças</span>
                        <input className={`${CAMPO} w-full text-right`} inputMode="numeric" value={calc.qtd} onChange={e => setCalc(c => ({ ...c, qtd: e.target.value }))} /></label>
                </div>
                {calc.tamanho && (resultado.length === 0
                    ? <p className="text-xs text-zinc-500">Nenhuma estamparia tem {calc.tamanho} com {calc.cores} cor(es) na grade.</p>
                    : <ul className="space-y-1">{resultado.map((r, i) => (
                        <li key={r.fornecedor_id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                            <span className={i === 0 ? 'text-emerald-400 font-bold' : 'text-zinc-300'}>{nome.get(r.fornecedor_id) ?? 'Estamparia'}</span>
                            <span className="font-mono text-zinc-200">{mostrar(r.porPeca)}/peça</span>
                            <span className="font-mono text-zinc-500">total {mostrar(r.total)}</span>
                        </li>))}</ul>)}
            </div>
            <ConfirmarApagar alvo={apagando} fechar={() => setApagando(null)} />
        </div>
    );
}

// ── DTF ───────────────────────────────────────────────────────────────────────────────────────

/** O filme visto de cima: as primeiras linhas do encaixe, em escala. */
function MapaDoRolo({ larguraUtilCm, espacoCm, enc, quantidade }: { larguraUtilCm: number; espacoCm: number; enc: NonNullable<ReturnType<typeof encaixeDtf>>; quantidade: number }) {
    const linhas = Math.min(enc.linhas, 6);
    const alturaCm = linhas * enc.alturaNoRoloCm + (linhas - 1) * espacoCm;
    const pecas: { x: number; y: number }[] = [];
    for (let l = 0; l < linhas; l++) for (let c = 0; c < enc.porLinha && pecas.length < quantidade; c++) {
        pecas.push({ x: c * (enc.larguraNoRoloCm + espacoCm), y: l * (enc.alturaNoRoloCm + espacoCm) });
    }
    return (
        <figure className="space-y-1">
            <svg viewBox={`0 0 ${larguraUtilCm} ${alturaCm}`} className="w-full max-w-md border border-zinc-700 bg-zinc-950" role="img"
                aria-label={`Mapa do rolo: ${enc.porLinha} por linha, ${enc.linhas} linhas`}>
                {pecas.map((p, i) => <rect key={i} x={p.x} y={p.y} width={enc.larguraNoRoloCm} height={enc.alturaNoRoloCm} fill="#f59e0b" fillOpacity={0.35} stroke="#f59e0b" strokeWidth={0.2} />)}
            </svg>
            <figcaption className="text-[10px] text-zinc-500">{larguraUtilCm} cm de largura útil{enc.linhas > linhas ? ` · mostrando ${linhas} de ${enc.linhas} linhas` : ''}{enc.girada ? ' · arte deitada' : ''}</figcaption>
        </figure>
    );
}

export function CustoDtf() {
    const estamparias = useEstamparias();
    const nome = useMemo(() => new Map(estamparias.map(e => [e.id, e.company_name])), [estamparias]);
    const [lista, setLista] = useState<CustoDtfDb[] | null | undefined>(undefined);
    const [nova, setNova] = useState('');
    const [arte, setArte] = useState({ largura: '10', altura: '8', qtd: '50' });
    const [apagando, setApagando] = useState<Apagando>(null);
    const { mostrar } = useMostrarValor();
    const { showToast } = useToast();

    const carregar = useCallback(async () => {
        try { setLista(await repo.dtf()); } catch (e) { showToast(mensagemDeErro(e, 'Não consegui ler as estamparias de DTF.'), 'error'); setLista([]); }
    }, [showToast]);
    useEffect(() => { void carregar(); }, [carregar]);

    const gravar = async (d: CustoDtfDb, campo: keyof CustoDtfDb, texto: string) => {
        const v = num(texto);
        if (campo === 'largura_util_cm' && !(v > 0)) { showToast('A largura útil do rolo precisa ser maior que zero.', 'error'); return; }
        if (Math.abs(Number(d[campo]) - v) < 0.00005) return;
        try { await repo.gravarDtf({ ...d, [campo]: v }); await carregar(); }
        catch (e) { showToast(mensagemDeErro(e, 'Não consegui gravar.'), 'error'); }
    };
    const acrescentar = async (id: string) => {
        if (!id) return;
        // Ponto de partida comum de rolo DTF: 58 cm úteis, 1 cm entre artes. O valor do metro é dele.
        try { await repo.gravarDtf({ fornecedor_id: id, largura_util_cm: 58, valor_metro_linear: 0, espaco_entre_cm: 1, frete: 0 }); setNova(''); await carregar(); }
        catch (e) { showToast(mensagemDeErro(e, 'Não consegui acrescentar.'), 'error'); }
    };

    if (lista === undefined) return <p className="p-8 text-center text-zinc-600 text-xs">Carregando…</p>;
    if (lista === null) return <SemMigracao arquivo="custos_personalizacao_v3_e.sql" />;

    const q = Math.max(0, Math.floor(num(arte.qtd)));
    const comparacao = lista.map(d => {
        const enc = encaixeDtf({ larguraUtilCm: d.largura_util_cm, espacoCm: d.espaco_entre_cm, larguraCm: num(arte.largura), alturaCm: num(arte.altura), quantidade: q });
        return { d, enc, custo: enc ? custoDtf(enc, { valorMetroLinear: d.valor_metro_linear, frete: d.frete }, q) : null };
    }).sort((a, b) => (a.custo?.total ?? Infinity) - (b.custo?.total ?? Infinity));
    const melhor = comparacao.find(c => c.enc && c.custo);

    return (
        <div className="space-y-4">
            <Cabecalho titulo="DTF por estamparia" texto="O rolo tem largura fixa e é cobrado por metro linear: o sistema encaixa as artes e diz quantos metros o lote gasta." />
            <div className={`${CARTAO} p-4 space-y-3`}>
                <div className="overflow-x-auto">
                    <table className="text-sm">
                        <thead><tr className="text-zinc-500">
                            <th className="text-left font-bold p-2">Estamparia</th><th className="text-right font-bold p-2">Largura útil (cm)</th>
                            <th className="text-right font-bold p-2">R$ / metro linear</th><th className="text-right font-bold p-2">Espaço entre artes (cm)</th>
                            <th className="text-right font-bold p-2">Frete por pedido</th><th />
                        </tr></thead>
                        <tbody>
                            {lista.length === 0 && <tr><td colSpan={6} className="p-3 text-zinc-500 text-xs">Nenhuma estamparia de DTF ainda: acrescente abaixo.</td></tr>}
                            {lista.map(d => (
                                <tr key={d.fornecedor_id} className="border-t border-zinc-800">
                                    <td className="p-2 text-zinc-200 font-bold whitespace-nowrap">{nome.get(d.fornecedor_id) ?? 'Estamparia'}</td>
                                    {(['largura_util_cm', 'valor_metro_linear', 'espaco_entre_cm', 'frete'] as const).map(campo => (
                                        <td key={campo} className="p-1">
                                            <input key={`${d.fornecedor_id}-${campo}-${d[campo]}`} inputMode="decimal" aria-label={`${campo} de ${nome.get(d.fornecedor_id) ?? 'estamparia'}`}
                                                className={`${CAMPO} w-28 text-right`} defaultValue={fmt(d[campo], campo === 'valor_metro_linear' ? 2 : campo === 'frete' ? 2 : 1)}
                                                onBlur={e => void gravar(d, campo, e.target.value)} />
                                        </td>
                                    ))}
                                    <td className="p-1">
                                        <button type="button" aria-label={`Tirar ${nome.get(d.fornecedor_id) ?? 'estamparia'}`} title="Tirar" className={`${BOTAO_SECUNDARIO} w-11 px-0`}
                                            onClick={() => setApagando({
                                                titulo: `Tirar ${nome.get(d.fornecedor_id) ?? 'a estamparia'} do DTF?`, rotulo: 'Tirar do DTF',
                                                mensagem: 'O valor do metro, a largura do rolo, o espaço e o frete desta estamparia saem da tabela. Esta ação não tem desfazer.',
                                                acao: async () => { try { await repo.apagarDtf(d.fornecedor_id); await carregar(); } catch (e) { showToast(mensagemDeErro(e, 'Não consegui tirar.'), 'error'); } },
                                            })}>
                                            <Trash2 size={16} className="text-rose-400" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="w-72 max-w-full">
                    <SearchableSelect value={nova} onChange={v => { setNova(v); void acrescentar(v); }} placeholder="+ ESTAMPARIA DE DTF"
                        options={[{ value: '', label: '+ ESTAMPARIA DE DTF' }, ...estamparias.filter(e => !lista.some(d => d.fornecedor_id === e.id)).map(e => ({ value: e.id, label: e.company_name }))]} />
                </div>
            </div>

            <div className={`${CARTAO} p-4 space-y-3`}>
                <p className={`${ROTULO} flex items-center gap-2`}><Calculator size={14} className="text-amber-500" /> Quantas cabem e quanto custa</p>
                <div className="flex flex-wrap items-end gap-3">
                    {([['largura', 'Largura da arte (cm)'], ['altura', 'Altura da arte (cm)'], ['qtd', 'Peças']] as const).map(([k, r]) => (
                        <label key={k} className="w-36"><span className={`${ROTULO_PEQUENO} block mb-1`}>{r}</span>
                            <input className={`${CAMPO} w-full text-right`} inputMode="decimal" value={arte[k]} onChange={e => setArte(a => ({ ...a, [k]: e.target.value }))} /></label>
                    ))}
                </div>
                {lista.length > 0 && q > 0 && (<>
                    <ul className="space-y-1">
                        {comparacao.map(({ d, enc, custo }) => (
                            <li key={d.fornecedor_id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                                <span className={melhor?.d === d ? 'text-emerald-400 font-bold' : 'text-zinc-300'}>{nome.get(d.fornecedor_id) ?? 'Estamparia'}</span>
                                {enc && custo ? (<>
                                    <span className="text-zinc-400">{enc.porLinha} por linha · {enc.linhas} linha(s) · {fmt(custo.metros)} m</span>
                                    <span className="font-mono text-zinc-200">{mostrar(custo.porPeca)}/peça</span>
                                    <span className="font-mono text-zinc-500">total {mostrar(custo.total)}</span>
                                    {d.valor_metro_linear <= 0 && <span className="text-[11px] text-amber-400">sem valor do metro</span>}
                                </>) : <span className="text-[11px] text-rose-400">a arte não cabe no rolo de {fmt(d.largura_util_cm, 1)} cm</span>}
                            </li>
                        ))}
                    </ul>
                    {melhor?.enc && <MapaDoRolo larguraUtilCm={melhor.d.largura_util_cm} espacoCm={melhor.d.espaco_entre_cm} enc={melhor.enc} quantidade={q} />}
                    {melhor?.enc && <p className="text-[10px] text-zinc-500">Aproveitamento do filme: {(melhor.enc.aproveitamento * 100).toFixed(0)}%.</p>}
                </>)}
            </div>
            <ConfirmarApagar alvo={apagando} fechar={() => setApagando(null)} />
        </div>
    );
}

// ── Bordado ───────────────────────────────────────────────────────────────────────────────────

export function CustoBordado() {
    const { data: artes = [] } = useArtesBordado();
    const { data: notas = [] } = useNotasPersonalizacao();
    const { mostrar } = useMostrarValor();
    const bordados = artes.filter(a => (a.tecnica ?? 'bordado') === 'bordado');
    const n = notas.find(x => x.tecnica === 'bordado');
    const [arteId, setArteId] = useState('');
    const [pontosTexto, setPontosTexto] = useState('');
    const [qtd, setQtd] = useState('50');
    const arte = bordados.find(a => a.id === arteId);
    const pontos = arte?.pontos ?? (pontosTexto ? Math.round(num(pontosTexto)) : null);
    const c = custoBordado({ pontos, quantidade: Math.floor(num(qtd)), precoPorMil: n?.preco_por_mil_pontos, valorMinimo: n?.valor_minimo, valorDaArte: arte ? 0 : n?.valor_da_arte });

    return (
        <div className="space-y-4">
            <Cabecalho titulo="Bordado" texto="Programação da arte (uma vez) + por peça: pontos ÷ 1.000 × valor do milheiro, com o mínimo por peça. Os valores vêm de Personalização › Notas › Bordado." />
            <div className={`${CARTAO} p-4 space-y-3`}>
                {!n?.preco_por_mil_pontos && !n?.valor_minimo && (
                    <p className="text-[11px] font-bold text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> Defina o valor do milheiro e o mínimo em Personalização › Notas › Bordado.</p>
                )}
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-72 max-w-full"><span className={`${ROTULO_PEQUENO} block mb-1`}>Estampa cadastrada</span>
                        <SearchableSelect value={arteId} onChange={setArteId} placeholder="— ARTE NOVA (digite os pontos) —"
                            options={[{ value: '', label: '— ARTE NOVA (digite os pontos) —' }, ...bordados.map(a => ({ value: a.id, label: `${a.nome}${a.pontos ? ` · ${a.pontos.toLocaleString('pt-BR')} pts` : ''}` }))]} /></div>
                    {!arte && <label className="w-32"><span className={`${ROTULO_PEQUENO} block mb-1`}>Pontos</span>
                        <input className={`${CAMPO} w-full text-right`} inputMode="numeric" value={pontosTexto} onChange={e => setPontosTexto(e.target.value)} placeholder="8000" /></label>}
                    <label className="w-28"><span className={`${ROTULO_PEQUENO} block mb-1`}>Peças</span>
                        <input className={`${CAMPO} w-full text-right`} inputMode="numeric" value={qtd} onChange={e => setQtd(e.target.value)} /></label>
                </div>
                {arte && !arte.pontos && <p className="text-[11px] text-amber-400">Esta estampa não tem os pontos cadastrados: a conta usa só o mínimo.</p>}
                {c ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            ['Por peça', mostrar(c.porPeca) + (c.aplicouMinimo ? ' (mínimo)' : '')],
                            ['Programação da arte', arte ? 'já feita' : mostrar(c.arte)],
                            ['Total do lote', mostrar(c.total)],
                            ['Por peça, com a arte', mostrar(c.porPecaComArte)],
                        ].map(([r, v]) => (
                            <div key={r} className="bg-zinc-950/50 rounded-xl p-3"><p className={ROTULO_PEQUENO}>{r}</p><p className="font-mono font-black text-white text-sm mt-1">{v}</p></div>
                        ))}
                    </div>
                ) : <p className="text-xs text-zinc-500">Informe os pontos (ou escolha uma estampa com pontos) para a conta sair.</p>}
            </div>
        </div>
    );
}
