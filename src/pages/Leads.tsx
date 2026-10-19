import React, { useState, useMemo } from 'react';
import {
    ListChecks, KanbanSquare, Upload, TrendingUp, RefreshCw, AlertTriangle,
    Check, Database, Users, Building2, Clock, Target, X,
} from 'lucide-react';
import { useLeads } from '@/hooks/useLeads';
import {
    ROTULO_DO_MOTIVO_NA_FILA, ROTULO_DA_ETAPA, nomeDoLead,
} from '@/utils/funilDeLeads';
import type { Lead, EtapaDoLead, MotivoNaFila } from '@/utils/funilDeLeads';
import { CartaoDoLead } from '@/components/leads/CartaoDoLead';
import { AlertasDaProspeccao } from '@/components/leads/AlertasDaProspeccao';
import {
    filtrarLeads, valoresDisponiveis, contarPorSegmento, filtroEstaAtivo,
    FAIXAS_DE_PORTE, FAIXAS_DE_CAPITAL, FILTRO_VAZIO, type FiltroDeProspeccao,
} from '@/utils/filtroDeProspeccao';
import { MoverLeadModal } from '@/components/leads/MoverLeadModal';
import { ImportarLeads } from '@/components/leads/ImportarLeads';
import { IndicadorRecarga } from '@/components/common/IndicadorRecarga';
import { InfoTooltip } from '@/components/common';
import type { Classificacao } from '@/utils/importacaoDeLeads';
import { storageService } from '@/services/storage';
import type { CompanyProfile } from '@/types';
import { CARTAO, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_SUAVE, BOTAO_SECUNDARIO, pilula } from '@/components/finance/ui/estilo';

const SELETOR = `${CAMPO} cursor-pointer`;

type Aba = 'hoje' | 'funil' | 'importar' | 'conversao';

const ABAS: { id: Aba; rotulo: string; icone: React.ElementType }[] = [
    { id: 'hoje', rotulo: 'Hoje', icone: ListChecks },
    { id: 'funil', rotulo: 'Funil', icone: KanbanSquare },
    { id: 'importar', rotulo: 'Importar', icone: Upload },
    { id: 'conversao', rotulo: 'Conversão', icone: TrendingUp },
];

const TOM_DO_MOTIVO: Record<MotivoNaFila, string> = {
    'acao-vencida': 'text-rose-400 border-rose-500/30 bg-rose-950/20',
    'acao-de-hoje': 'text-amber-400 border-amber-500/30 bg-amber-950/20',
    'nunca-tocado': 'text-sky-400 border-sky-500/30 bg-sky-950/20',
    'esquecido': 'text-zinc-500 border-zinc-800 bg-zinc-950/40',
};

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(0)}%`);

interface Props {
    /** Leva ao cadastro de clientes para concluir a conversão do lead. */
    onNavigate?: (view: 'masterdata' | 'budgets', termo?: string) => void;
    companyProfile?: CompanyProfile | null;
}

/**
 * Prospecção — a etapa anterior ao orçamento.
 *
 * Mora na seção Pedidos, ao lado de Orçamentos, porque é literalmente o passo
 * antes dele: uma empresa que ainda não pediu proposta. Separá-la em outra
 * seção faria o caminho natural do trabalho atravessar o menu.
 *
 * Abre em HOJE e não no funil de propósito. O quadro é bonito e responde "como
 * está a carteira"; a fila responde "o que eu faço agora", que é a pergunta das
 * oito da manhã — e é o que separa esta tela da planilha que ela substitui.
 */
export default function Leads({ onNavigate, companyProfile }: Props) {
    const v = useLeads();
    const [aba, setAba] = useState<Aba>('hoje');
    const [movendo, setMovendo] = useState<{ lead: Lead; destino: EtapaDoLead } | null>(null);
    const [convertendo, setConvertendo] = useState<string | null>(null);
    const [aviso, setAviso] = useState('');
    const [filtro, setFiltro] = useState<FiltroDeProspeccao>(FILTRO_VAZIO);

    /**
     * As opcoes saem da BASE, e nao de uma lista fixa: um seletor com as 27 UFs
     * quando a carteira tem tres obriga a pessoa a procurar dentro do proprio
     * filtro — o problema que o filtro deveria resolver, um nivel acima.
     */
    const opcoes = useMemo(() => valoresDisponiveis(v.leads), [v.leads]);
    const porSegmento = useMemo(() => contarPorSegmento(v.leads), [v.leads]);

    // As colunas do funil filtradas. O filtro atravessa as etapas de proposito:
    // "so as escolas" e uma pergunta sobre a carteira inteira, nao sobre uma
    // coluna — e ver as escolas paradas em cada etapa e justamente o ponto.
    const colunasFiltradas = useMemo(
        () => v.colunas.map(col => ({ ...col, leads: filtrarLeads(col.leads, filtro) })),
        [v.colunas, filtro]);

    const nomeDaCasa = companyProfile?.name;

    const importar = async (c: Classificacao) => {
        const r = await storageService.importarLeads(c.aImportar.map(l => l.lead));
        await v.recarregar();
        return r;
    };

    /**
     * Lead vira cliente sem redigitar nada.
     *
     * Se converter significasse preencher o cadastro de novo, ninguém
     * converteria — e o funil pararia de refletir a realidade no dia seguinte.
     * O cadastro é criado com o que o lead já tem, e o lead recebe o client_id
     * em vez de sumir: é isso que mantém a taxa de conversão calculável.
     */
    const virarCliente = async (lead: Lead) => {
        setConvertendo(lead.id);
        setAviso('');
        try {
            const cliente = await storageService.saveClient({
                company_name: lead.razao_social,
                cnpj: lead.cnpj || undefined,
                contact_person: lead.contato_nome || undefined,
                phone: lead.telefone || undefined,
                email: lead.email || undefined,
                address: [lead.cidade, lead.uf].filter(Boolean).join(' / ') || undefined,
                notes: [
                    lead.notas,
                    lead.site && `Site: ${lead.site}`,
                    lead.segmento && `Segmento: ${lead.segmento}`,
                    lead.porte_funcionarios && `Porte: ${lead.porte_funcionarios} funcionários`,
                ].filter(Boolean).join('\n') || undefined,
            } as never);

            const id = (cliente as { id?: string } | null)?.id;
            if (!id) throw new Error('O cadastro foi criado, mas sem id — confira em Cadastros.');

            await v.mover(lead.id, 'cliente', { client_id: id });
            setAviso(`${nomeDoLead(lead)} virou cliente. Confira o cadastro e complete o que faltar.`);
        } catch (e: any) {
            setAviso(e?.message || 'Falha ao converter o lead');
        } finally {
            setConvertendo(null);
        }
    };

    // ── estados de borda ────────────────────────────────────────────────────
    if (v.carregando) {
        return (
            <div className="text-center py-16 text-zinc-600 flex flex-col items-center gap-4">
                <RefreshCw size={24} className="animate-spin text-amber-500" />
                <span className={ROTULO}>
                    Levantando a prospecção...
                </span>
            </div>
        );
    }

    if (v.migrado === false) {
        return (
            <div className="flex items-start gap-3 bg-amber-500/[0.07] border border-amber-500/25 rounded-2xl px-5 py-4 max-w-3xl">
                <Database size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-black text-white uppercase tracking-tight">
                        A tabela de leads ainda não existe
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                        Rode <code className="text-amber-400 font-mono">supabase/leads_prospeccao.sql</code> no
                        SQL Editor do Supabase. Nada mais do sistema depende dela — o resto do ERP funciona
                        normalmente até lá.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-20 ease-out animate-in fade-in duration-200">
            <div className="flex items-center gap-2 flex-wrap border-b border-zinc-800 pb-3">
                {ABAS.map(a => {
                    const Icone = a.icone;
                    const ativa = aba === a.id;
                    return (
                        <button
                            key={a.id}
                            onClick={() => setAba(a.id)}
                            className={pilula(ativa)}
                        >
                            <Icone size={14} /> {a.rotulo}
                            {a.id === 'hoje' && v.fila.length > 0 && (
                                <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-amber-500 text-black text-[9px] tabular-nums">
                                    {v.fila.length}
                                </span>
                            )}
                        </button>
                    );
                })}
                <span className="ml-auto"><IndicadorRecarga ativo={v.recarregando} /></span>
            </div>

            {(v.erro || aviso) && (
                <p className={`flex items-start gap-2 text-xs rounded-xl px-4 py-3 leading-snug ${
                    v.erro
                        ? 'text-rose-300 bg-rose-950/40 border border-rose-900/60'
                        : 'text-emerald-300 bg-emerald-500/[0.07] border border-emerald-500/25'
                }`}>
                    {v.erro ? <AlertTriangle size={14} className="shrink-0 mt-0.5" /> : <Check size={14} className="shrink-0 mt-0.5" />}
                    {v.erro || aviso}
                </p>
            )}

            {/* ── HOJE ───────────────────────────────────────────────────── */}
            {aba === 'hoje' && (
                v.fila.length === 0 ? (
                    <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-5 py-4">
                        <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-black text-white uppercase tracking-tight">
                                Nada na fila de hoje
                            </p>
                            <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed max-w-2xl">
                                {v.leads.length === 0
                                    ? 'Importe um CSV na aba Importar para começar a prospecção.'
                                    : 'Todos os leads vivos têm ação marcada para outro dia. Eles voltam sozinhos quando a data chegar.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {v.fila.map(item => (
                            <div key={item.lead.id} className="flex items-stretch gap-2">
                                <div
                                    className={`w-32 shrink-0 rounded-xl border px-3 py-3 flex flex-col justify-center ${TOM_DO_MOTIVO[item.motivo]}`}
                                    title={ROTULO_DO_MOTIVO_NA_FILA[item.motivo]}
                                >
                                    <p className="text-[9px] font-black uppercase tracking-widest leading-tight">
                                        {ROTULO_DO_MOTIVO_NA_FILA[item.motivo]}
                                    </p>
                                    {item.diasDeAtraso > 0 && (
                                        <p className="text-[10px] font-mono font-bold mt-0.5 tabular-nums">
                                            {item.diasDeAtraso}d
                                        </p>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <CartaoDoLead
                                        lead={item.lead}
                                        nomeDaCasa={nomeDaCasa}
                                        onMover={destino => setMovendo({ lead: item.lead, destino })}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* O que a fila não mostra: quem esfriou, e quais leads são a mesma
                empresa. Fica embaixo dela de propósito — a pergunta das nove da
                manhã é "para quem eu ligo", e a resposta é a fila. */}
            {aba === 'hoje' && (
                <AlertasDaProspeccao
                    leads={v.leads}
                    onAbrir={lead => setMovendo({ lead, destino: lead.status as EtapaDoLead })}
                />
            )}

            {/* ── FUNIL ──────────────────────────────────────────────────── */}
            {/* Filtros. A tela nao tinha NENHUM: a lista inteira, todo dia, na
                mesma ordem. Ate trinta leads da para varrer com o olho; passando
                disso, quem quer ligar para as escolas hoje procura as escolas no
                meio dos hospitais — e acaba ligando para quem esta mais perto do
                topo, que nao e a mesma coisa que ligar para quem interessa. */}
            {aba === 'funil' && v.leads.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <input
                        value={filtro.busca}
                        onChange={e => setFiltro(f => ({ ...f, busca: e.target.value }))}
                        placeholder="Empresa ou cidade"
                        className={`${CAMPO} flex-1 min-w-[160px]`}
                    />

                    <select
                        value={filtro.segmento}
                        onChange={e => setFiltro(f => ({ ...f, segmento: e.target.value }))}
                        className={SELETOR}
                    >
                        <option value="">Todos os segmentos</option>
                        {opcoes.segmentos.map((sg: string) => (
                            <option key={sg} value={sg}>{sg} ({porSegmento[sg] || 0})</option>
                        ))}
                    </select>

                    <select
                        value={filtro.faixaDePorte}
                        onChange={e => setFiltro(f => ({ ...f, faixaDePorte: e.target.value as any }))}
                        className={SELETOR}
                    >
                        <option value="">Qualquer porte</option>
                        {FAIXAS_DE_PORTE.map(fx => (
                            <option key={fx.id} value={fx.id}>{fx.rotulo}</option>
                        ))}
                    </select>

                    {/* Capital social só aparece quando ALGUM lead tem o dado.
                        Enquanto as planilhas antigas não forem reimportadas, a
                        coluna fica vazia na base inteira — e um seletor que só
                        oferece "sem capital informado" é um controle que promete
                        um corte e não corta nada. */}
                    {v.leads.some(l => Number(l.capital_social) > 0) && (
                        <select
                            value={filtro.faixaDeCapital}
                            onChange={e => setFiltro(f => ({ ...f, faixaDeCapital: e.target.value as any }))}
                            className={SELETOR}
                        >
                            <option value="">Qualquer capital</option>
                            {FAIXAS_DE_CAPITAL.map(fx => (
                                <option key={fx.id} value={fx.id}>{fx.rotulo}</option>
                            ))}
                        </select>
                    )}

                                        {opcoes.ufs.length > 1 && (
                        <select value={filtro.uf}
                            onChange={e => setFiltro(f => ({ ...f, uf: e.target.value }))}
                            className={SELETOR}>
                            <option value="">Todos os estados</option>
                            {opcoes.ufs.map((u: string) => <option key={u} value={u}>{u}</option>)}
                        </select>
                    )}

                    {opcoes.origens.length > 1 && (
                        <select value={filtro.origem}
                            onChange={e => setFiltro(f => ({ ...f, origem: e.target.value }))}
                            className={SELETOR}>
                            <option value="">Toda origem</option>
                            {opcoes.origens.map((o: string) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    )}

                    {filtroEstaAtivo(filtro) && (
                        <button
                            onClick={() => setFiltro(FILTRO_VAZIO)}
                            className={BOTAO_SECUNDARIO}
                        >
                            <X size={14} />
                            {colunasFiltradas.reduce((n, c) => n + c.leads.length, 0)} de {v.leads.length}
                        </button>
                    )}
                </div>
            )}

            {aba === 'funil' && (
                <div className="flex gap-3 overflow-x-auto pb-4">
                    {colunasFiltradas.map(col => (
                        <section
                            key={col.etapa.id}
                            className={`${CARTAO} w-64 shrink-0 p-4 flex flex-col gap-2`}
                        >
                            <header className="px-1">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className={ROTULO}>
                                        {col.etapa.rotulo}
                                    </h3>
                                    <span className="text-[10px] font-black text-zinc-600 tabular-nums">
                                        {col.leads.length}
                                    </span>
                                </div>
                                <p className="text-[9px] text-zinc-600 mt-0.5 leading-tight">
                                    {col.etapa.descricao}
                                    {col.etapa.bola === 'nossa' && (
                                        <span className="text-amber-500/70 font-black"> · a bola é sua</span>
                                    )}
                                </p>
                            </header>

                            <div className="flex flex-col gap-2 max-h-[62vh] overflow-y-auto">
                                {col.leads.map(lead => (
                                    <div key={lead.id}>
                                        <CartaoDoLead
                                            lead={lead}
                                            nomeDaCasa={nomeDaCasa}
                                            onMover={destino => setMovendo({ lead, destino })}
                                            compacto
                                        />
                                        {lead.status === 'orcando' && (
                                            <button
                                                onClick={() => virarCliente(lead)}
                                                disabled={convertendo === lead.id}
                                                className={`${BOTAO_SUAVE} w-full mt-1`}
                                            >
                                                <Building2 size={14} className="text-emerald-400" />
                                                {convertendo === lead.id ? 'Criando cadastro...' : 'Virou cliente'}
                                            </button>
                                        )}
                                        {lead.status === 'cliente' && lead.client_id && onNavigate && (
                                            <button
                                                onClick={() => onNavigate('masterdata')}
                                                className={`${BOTAO_SECUNDARIO} w-full mt-1`}
                                            >
                                                Ver o cadastro
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {col.leads.length === 0 && (
                                    <p className="text-[10px] text-zinc-700 italic text-center py-6">vazia</p>
                                )}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            {/* ── IMPORTAR ───────────────────────────────────────────────── */}
            {aba === 'importar' && (
                <ImportarLeads
                    clientes={v.clientes}
                    leadsExistentes={v.leads}
                    onImportar={importar}
                    onPronto={() => setAba('hoje')}
                />
            )}

            {/* ── CONVERSÃO ──────────────────────────────────────────────── */}
            {aba === 'conversao' && (
                <div className="space-y-5">
                    <div className={`${CARTAO} p-5`}>
                        <div className="flex items-start justify-between gap-6 flex-wrap">
                            <div>
                                <h2 className={`${ROTULO} flex items-center gap-2`}>
                                    De cem leads, quantos fecham
                                    <InfoTooltip>
                                        Sobre TODOS os leads já importados, incluindo os descartados. É o
                                        número que diz se prospectar vale a pena — e ele só existe porque o
                                        lead continua no funil depois de virar cliente.
                                    </InfoTooltip>
                                </h2>
                                <p className="text-5xl font-black tabular-nums mt-2 text-amber-400">
                                    {pct(v.conversao.taxaFinal)}
                                </p>
                                <p className="text-xs text-zinc-500 font-medium mt-1">
                                    {v.conversao.clientes} de {v.conversao.total} leads
                                    {v.conversao.descartados > 0 && ` · ${v.conversao.descartados} descartados`}
                                </p>
                            </div>
                            {v.ciclo !== null && (
                                <div className="text-right">
                                    <p className={`${ROTULO_PEQUENO} flex items-center justify-end gap-2`}>
                                        <Clock size={12} /> Ciclo típico
                                    </p>
                                    <p className="text-2xl font-black text-zinc-300 tabular-nums mt-1">
                                        {v.ciclo} dias
                                    </p>
                                    <p className="text-[10px] text-zinc-600">da importação ao fechamento</p>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-zinc-800/80 mt-5 pt-4 space-y-2">
                            <p className={ROTULO_PEQUENO}>
                                Onde eles param
                            </p>
                            {v.conversao.passos.map(p => (
                                <div key={`${p.de}-${p.para}`} className="flex items-center gap-3 text-[11px]">
                                    <span className="text-zinc-400 w-44 shrink-0 truncate">
                                        {ROTULO_DA_ETAPA[p.de]} → {ROTULO_DA_ETAPA[p.para]}
                                    </span>
                                    <div className="flex-1 h-1.5 bg-zinc-800/60 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-amber-500 rounded-full transition-[width] duration-500"
                                            style={{ width: `${(p.taxa || 0) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-zinc-600 tabular-nums shrink-0 w-20 text-right">
                                        {p.seguiram} de {p.entraram}
                                    </span>
                                    <span className="font-mono font-black text-zinc-300 tabular-nums w-10 text-right shrink-0">
                                        {pct(p.taxa)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {([
                            { titulo: 'Por origem', icone: Target, dados: v.porOrigem },
                            { titulo: 'Por segmento', icone: Users, dados: v.porSegmento },
                        ]).map(({ titulo, icone: Icone, dados }) => (
                            <section key={titulo} className={`${CARTAO} p-5 space-y-3`}>
                                <h3 className={`${ROTULO} flex items-center gap-2`}>
                                    <Icone size={14} className="text-amber-500" /> {titulo}
                                </h3>
                                {dados.length === 0 && (
                                    <p className="text-[11px] text-zinc-600 italic py-4 text-center">sem dados ainda</p>
                                )}
                                {dados.map(d => (
                                    <div key={d.chave} className="flex items-center gap-3 text-[11px]">
                                        <span className="text-zinc-300 font-bold truncate flex-1 capitalize">{d.chave}</span>
                                        <span className="text-zinc-600 tabular-nums shrink-0">
                                            {d.clientes}/{d.total}
                                        </span>
                                        <span className="font-mono font-black text-zinc-300 tabular-nums w-10 text-right shrink-0">
                                            {pct(d.taxa)}
                                        </span>
                                    </div>
                                ))}
                            </section>
                        ))}
                    </div>

                    <section className={`${CARTAO} p-5 space-y-3`}>
                        <h3 className={`${ROTULO} flex items-center gap-2`}>
                            <AlertTriangle size={14} className="text-rose-500/70" /> Por que não fecharam
                        </h3>
                        {v.perdas.length === 0 ? (
                            <p className="text-[11px] text-zinc-600 italic py-4 text-center">nenhum descarte registrado</p>
                        ) : (
                            <>
                                <p className="text-[11px] text-zinc-500 leading-snug">
                                    Perder por preço mexe na margem; perder por prazo mexe na fábrica. São
                                    decisões opostas, e é por isso que o motivo é obrigatório.
                                </p>
                                {v.perdas.map(m => (
                                    <div key={m.motivo} className="flex items-center gap-3 text-[11px]">
                                        <span className="text-zinc-300 font-bold truncate flex-1">{m.motivo}</span>
                                        <div className="w-32 h-1.5 bg-zinc-800/60 rounded-full overflow-hidden shrink-0">
                                            <div className="h-full bg-rose-500/70 rounded-full" style={{ width: `${m.fatia * 100}%` }} />
                                        </div>
                                        <span className="font-mono font-black text-zinc-400 tabular-nums w-8 text-right shrink-0">
                                            {m.quantidade}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}
                    </section>
                </div>
            )}

            {movendo && (
                <MoverLeadModal
                    lead={movendo.lead}
                    destino={movendo.destino}
                    onCancelar={() => setMovendo(null)}
                    onConfirmar={async extras => {
                        await v.mover(movendo.lead.id, movendo.destino, extras);
                        setMovendo(null);
                    }}
                />
            )}
        </div>
    );
}
