import { useState, useMemo } from 'react';
import {
    ArrowLeft, Pencil, LayoutGrid, FileText, Wallet,
    Camera, Loader2, AlertTriangle, Phone, Mail, MapPin, Save,
    Eye, ExternalLink, Repeat, TrendingUp, ImagePlus,
} from 'lucide-react';
import type { Client, Budget, CompanyProfile } from '@/types';
import { ContatosDoCliente } from '@/components/masterdata/ContatosDoCliente';
import { formatCurrency, formatDate } from '@/utils';
import { storageService } from '@/services/storage';
import { useDossieDoCliente } from '@/hooks/useDossieDoCliente';
import { ClientScoreBadge } from '@/components/finance/ClientScoreBadge';
import { FotosDoCliente } from '@/components/masterdata/FotosDoCliente';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { msgLembreteDeVencimento } from '@/utils/mensagensCliente';
import { BudgetPreviewModal } from '@/components/budgets/BudgetPreviewModal';
import { GraficoDePedidos } from '@/components/masterdata/GraficoDePedidos';
import { Miniatura, FotoAmpliada } from '@/components/common/GaleriaDeFotos';
import { PainelDoContrato } from '@/components/masterdata/PainelDoContrato';
import { Indicador } from '@/components/finance/ui/Indicador';
import { CARTAO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE, BOTAO_SECUNDARIO, pilula } from '@/components/finance/ui/estilo';

interface Props {
    cliente: Client;
    onVoltar: () => void;
    onEditar: () => void;
    /** Recarrega a lista de cadastros depois de salvar aqui dentro. */
    onSalvou: () => void;
    /** Sai para a tela de Orçamentos, já buscando por este número. */
    onAbrirOrcamento?: (serial: string) => void;
    companyProfile?: CompanyProfile | null;
}

type Aba = 'visao' | 'historico' | 'dinheiro' | 'fotos' | 'contrato';

const ABAS: { id: Aba; label: string; icon: any }[] = [
    { id: 'visao', label: 'Visão geral', icon: LayoutGrid },
    { id: 'historico', label: 'Histórico', icon: FileText },
    { id: 'dinheiro', label: 'Dinheiro', icon: Wallet },
    { id: 'fotos', label: 'Fotos', icon: Camera },
    { id: 'contrato', label: 'Contrato', icon: Repeat },
];

const ROTULO_STATUS: Record<string, string> = {
    Draft: 'Rascunho', Sent: 'Enviado', Approved: 'Aprovado', Converted: 'Pedido',
};

/** Rodapé "em produção" dos cartões de dinheiro a receber: pedido não entregue não vence. */
const rodapeEmProducao = (v: number) => (v > 0 ? `em produção: ${formatCurrency(v)}` : undefined);

const Vazio = ({ texto }: { texto: string }) => (
    <p className="text-[11px] text-zinc-600 font-bold py-8 text-center">{texto}</p>
);

/**
 * Tudo o que a casa sabe de um cliente, numa tela só.
 *
 * Substitui a lista em vez de abrir um modal: são cinco abas de conteúdo
 * agregado, e modal é a forma do app para "editar meia dúzia de campos". O
 * cadastro em si continua no modal de edição, alcançável pelo botão Editar —
 * esta página é para CONSULTAR, e a separação evita que ela vire um formulário
 * gigante onde nada se acha.
 */
export function PaginaDoCliente({ cliente, onVoltar, onEditar, onSalvou, onAbrirOrcamento, companyProfile }: Props) {
    const [aba, setAba] = useState<Aba>('visao');
    const { dossie, entregas, orcamentosCompletos, carregando, erro, recarregar } = useDossieDoCliente(cliente.id);
    const [preview, setPreview] = useState<Budget | null>(null);
    const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

    // Fotos e notas são editáveis aqui mesmo: são o tipo de informação que
    // aparece durante a consulta ("ah, o logo mudou"), e mandar a pessoa abrir
    // o modal de cadastro para colar uma foto quebraria o fluxo.
    const [rascunhoNotas, setRascunhoNotas] = useState(cliente.notes || '');
    const [fotos, setFotos] = useState<string[]>(cliente.reference_photos || []);
    const [salvando, setSalvando] = useState(false);
    const [salvoAgora, setSalvoAgora] = useState(false);

    const notasMudaram = rascunhoNotas !== (cliente.notes || '');

    const salvar = async (patch: Partial<Client>) => {
        setSalvando(true);
        try {
            await storageService.saveClient({ ...cliente, ...patch } as Client);
            setSalvoAgora(true);
            setTimeout(() => setSalvoAgora(false), 2000);
            onSalvou();
        } catch (e) {
            console.error('Falha ao salvar o cliente', e);
        } finally {
            setSalvando(false);
        }
    };

    const contasEmAberto = useMemo(
        () => (dossie?.contas || [])
            // Pedido não entregue não vence: lembrar dele é a cobrança que a regra proíbe.
            .filter(c => (c.remaining_amount || 0) > 0 && !c.cancelled_at && c.type === 'receivable' && !c.awaiting_delivery)
            // Vencimento mais próximo primeiro: é essa que se cobra.
            .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')),
        [dossie]);

    return (
        <div className="ease-out animate-in slide-in-from-bottom-2 duration-200 space-y-5">

            {/* ── Cabeçalho ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                    <button onClick={onVoltar} title="Voltar para a lista"
                        className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white hover:border-zinc-700 transition-all shrink-0">
                        <ArrowLeft size={16} />
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-xl font-black text-white uppercase tracking-tight truncate">
                            {cliente.company_name}
                        </h2>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px] font-bold text-zinc-500">
                            {cliente.category && (
                                <span className="bg-zinc-950/50 border border-zinc-800 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                                    {cliente.category}
                                </span>
                            )}
                            {cliente.contact_person && <span>{cliente.contact_person}</span>}
                            {cliente.phone && <span className="flex items-center gap-1"><Phone size={12} /> {cliente.phone}</span>}
                            {cliente.email && <span className="flex items-center gap-1"><Mail size={12} /> {cliente.email}</span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <ClientScoreBadge clientId={cliente.id} />
                    <button onClick={onEditar}
                        className={BOTAO_SECUNDARIO}>
                        <Pencil size={13} /> Editar cadastro
                    </button>
                </div>
            </div>

            {/* ── Abas ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1 overflow-x-auto chips-scroll">
                {ABAS.map(a => (
                    <button key={a.id} onClick={() => setAba(a.id)} className={pilula(aba === a.id)}>
                        <a.icon size={13} /> {a.label}
                    </button>
                ))}
            </div>

            {erro && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-[10px] font-bold flex items-center gap-2">
                    <AlertTriangle size={14} /> {erro}
                    <button onClick={recarregar} className="ml-auto underline">tentar de novo</button>
                </div>
            )}

            {carregando && !dossie && (
                <div className="flex items-center justify-center gap-2 py-16 text-zinc-600">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Carregando o histórico</span>
                </div>
            )}

            {dossie && (
                <>
                    {/* ── Visão geral ───────────────────────────────────── */}
                    {aba === 'visao' && (
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <Indicador rotulo="Total em pedidos" valor={formatCurrency(dossie.totalEmPedidos)}
                                    sub={`${dossie.pedidos.length} pedido${dossie.pedidos.length === 1 ? '' : 's'}`} />
                                <Indicador rotulo="Já recebido" valor={formatCurrency(dossie.totalRecebido)} tom="emerald" />
                                <Indicador rotulo="A receber" valor={formatCurrency(dossie.aReceber)}
                                    tom={dossie.aReceber > 0 ? undefined : 'emerald'}
                                    sub={rodapeEmProducao(dossie.emProducao)} />
                                <Indicador rotulo="Vencido" valor={formatCurrency(dossie.vencido)}
                                    tom={dossie.vencido > 0 ? 'rose' : 'emerald'}
                                    sub={dossie.vencido > 0 ? 'passou do vencimento' : 'nada em atraso'} />
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                <Indicador rotulo="Ticket médio"
                                    valor={dossie.ticketMedio !== null ? formatCurrency(dossie.ticketMedio) : '—'}
                                    sub={dossie.ticketMedio === null ? 'nenhum pedido ainda' : 'por pedido'} />
                                <Indicador rotulo="Taxa de fechamento"
                                    valor={dossie.taxaDeFechamento !== null ? `${Math.round(dossie.taxaDeFechamento * 100)}%` : '—'}
                                    sub={dossie.taxaDeFechamento !== null
                                        ? `${dossie.orcamentosFechados.length} de ${dossie.orcamentosConsiderados} enviados`
                                        : 'nenhum orçamento enviado'} />
                                <Indicador rotulo="Último pedido"
                                    valor={dossie.ultimoPedidoEm ? formatDate(dossie.ultimoPedidoEm) : '—'}
                                    sub={dossie.ultimoOrcamentoEm ? `último orçamento em ${formatDate(dossie.ultimoOrcamentoEm)}` : undefined} />
                            </div>

                            {(cliente.address || cliente.cnpj) && (
                                <div className={`${CARTAO} p-4 space-y-1.5`}>
                                    {cliente.cnpj && (
                                        <p className="text-[11px] font-bold text-zinc-400">
                                            CNPJ <span className="font-mono text-zinc-300">{cliente.cnpj}</span>
                                            {cliente.inscricao_estadual && (
                                                <span className="ml-3 border-l border-zinc-700 pl-3">IE <span className="font-mono text-zinc-300">{cliente.inscricao_estadual}</span></span>
                                            )}
                                        </p>
                                    )}
                                    {cliente.address && (
                                        <p className="text-[11px] font-bold text-zinc-400 flex items-start gap-1.5">
                                            <MapPin size={12} className="mt-0.5 shrink-0" /> {cliente.address}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* ── Ritmo de compra ── */}
                            <div className={`${CARTAO} p-5 space-y-4`}>
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                        <TrendingUp size={12} className="text-amber-500" /> Pedidos no tempo
                                    </p>
                                    {dossie.padrao.intervaloMedioDias !== null && (
                                        <p className={`text-[10px] font-black uppercase tracking-widest ${dossie.padrao.atrasado ? 'text-amber-500' : 'text-zinc-500'}`}>
                                            {dossie.padrao.atrasado
                                                ? `Atrasado — ${dossie.padrao.diasDesdeUltimo} dias sem pedir`
                                                : `Compra a cada ~${dossie.padrao.intervaloMedioDias} dias`}
                                        </p>
                                    )}
                                </div>

                                <GraficoDePedidos serie={dossie.porMes} />

                                {dossie.padrao.intervaloMedioDias !== null ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                                        <div>
                                            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Intervalo típico</p>
                                            <p className="text-sm font-black font-mono text-white mt-0.5">{dossie.padrao.intervaloMedioDias}d</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Faixa observada</p>
                                            <p className="text-sm font-black font-mono text-zinc-400 mt-0.5">
                                                {dossie.padrao.menorIntervalo}–{dossie.padrao.maiorIntervalo}d
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Próximo estimado</p>
                                            <p className={`text-sm font-black font-mono mt-0.5 ${dossie.padrao.atrasado ? 'text-amber-500' : 'text-white'}`}>
                                                {dossie.padrao.proximoPedidoEstimado ? formatDate(dossie.padrao.proximoPedidoEstimado) : '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Base do cálculo</p>
                                            <p className="text-sm font-black font-mono text-zinc-500 mt-0.5">
                                                {dossie.padrao.baseDeCalculo} intervalo{dossie.padrao.baseDeCalculo > 1 ? 's' : ''}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-zinc-600 font-bold leading-relaxed">
                                        {dossie.padrao.diasDesdeUltimo !== null
                                            ? `Um pedido só não forma padrão — faz ${dossie.padrao.diasDesdeUltimo} dias desde ele. Com o segundo, aparece a estimativa.`
                                            : 'Sem pedidos ainda para estimar um ritmo.'}
                                    </p>
                                )}
                            </div>

                            {/* A agenda do cliente. Compras, RH e financeiro são
                                conversas diferentes, e o campo único do cadastro
                                cabia uma pessoa só. */}
                            <ContatosDoCliente
                                clientId={cliente.id}
                                contatoAntigo={cliente.contact_person}
                            />

                            {/* Anotações: editáveis aqui mesmo, no fluxo da consulta. */}
                            <div className={`${CARTAO} p-5 space-y-3`}>
                                <p className={ROTULO}>Anotações</p>
                                <p className="text-[10px] text-zinc-600 font-bold leading-relaxed">
                                    Modelo combinado, posição do bordado, jeito de pedir — o que se repete a cada
                                    orçamento deste cliente e hoje vive só na memória de quem atende.
                                </p>
                                <textarea
                                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3 text-[12px] text-zinc-200 outline-none focus:border-amber-500/30 transition-all min-h-[220px] resize-y leading-relaxed"
                                    placeholder="Ex.: sempre pede manga longa. Bordado no peito esquerdo, 8 cm. Prefere entrega às sextas."
                                    value={rascunhoNotas}
                                    onChange={(e) => setRascunhoNotas(e.target.value)}
                                />
                                <div className="flex items-center justify-end gap-3">
                                    {salvoAgora && <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Salvo</span>}
                                    <button
                                        onClick={() => salvar({ notes: rascunhoNotas })}
                                        disabled={!notasMudaram || salvando}
                                        className={BOTAO_PRINCIPAL}>
                                        {salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                        Salvar anotações
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Histórico ─────────────────────────────────────── */}
                    {aba === 'historico' && (
                        <div className="space-y-6">
                            <section className="space-y-3">
                                <p className={ROTULO}>Peças</p>
                                <div className={`${CARTAO} overflow-hidden`}>
                                    {dossie.pecas.length === 0 ? (
                                        <Vazio texto="Nenhuma peça orçada para este cliente ainda." />
                                    ) : (
                                        <table className="w-full text-left text-[11px]">
                                            <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                                <tr>
                                                    <th className="p-4">Peça</th>
                                                    <th className="p-4">Orçadas</th>
                                                    <th className="p-4">Fechadas</th>
                                                    <th className="p-4">Preço médio</th>
                                                    <th className="p-4">Último preço</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-900">
                                                {dossie.pecas.map(pc => (
                                                    <tr key={pc.produto} className="hover:bg-zinc-800/40 transition-colors">
                                                        <td className="p-4 font-black text-zinc-200 uppercase tracking-tight">
                                                            {pc.produto}
                                                            <span className="block text-[9px] font-bold text-zinc-600 normal-case tracking-normal mt-0.5">
                                                                em {pc.aparicoes} orçamento{pc.aparicoes > 1 ? 's' : ''}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 font-mono text-zinc-300">{pc.quantidadeOrcada}</td>
                                                        <td className="p-4 font-mono text-emerald-400">{pc.quantidadeFechada}</td>
                                                        <td className="p-4 font-mono text-zinc-300">{formatCurrency(pc.precoMedio)}</td>
                                                        <td className="p-4 font-mono text-zinc-400">
                                                            {formatCurrency(pc.ultimoPreco)}
                                                            {pc.ultimaData && (
                                                                <span className="block text-[9px] text-zinc-600">{formatDate(pc.ultimaData)}</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                    {dossie.pecas.length > 0 && (
                                        <p className="px-4 py-3 text-[9px] text-zinc-600 font-bold border-t border-zinc-900 leading-relaxed">
                                            Preço médio ponderado pela quantidade — o pedido grande é que define o
                                            preço que a relação pratica.
                                        </p>
                                    )}
                                </div>
                            </section>
                            <section className="space-y-3">
                                <p className={ROTULO}>Orçamentos</p>
                                <div className={`${CARTAO} overflow-hidden`}>
                                    {dossie.orcamentos.length === 0 ? <Vazio texto="Nenhum orçamento para este cliente." /> : (
                                        <table className="w-full text-left text-[11px]">
                                            <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                                <tr><th className="p-4">Número</th><th className="p-4">Data</th><th className="p-4">Valor</th><th className="p-4">Situação</th><th className="p-4 text-right">Ver</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-900">
                                                {dossie.orcamentos.map(o => {
                                                    const fechado = o.status === 'Approved' || o.status === 'Converted';
                                                    return (
                                                        <tr key={o.id} className="group hover:bg-zinc-800/40 transition-colors">
                                                            <td className="p-4">
                                                                {/* O numero leva para a tela de Orcamentos ja
                                                                    buscando por ele: e o gesto que a pessoa
                                                                    tenta primeiro ao ver um numero destacado. */}
                                                                {onAbrirOrcamento && o.serial_number ? (
                                                                    <button onClick={() => onAbrirOrcamento(o.serial_number as string)}
                                                                        title="Abrir na tela de Orcamentos"
                                                                        className="font-mono text-amber-500 font-black hover:underline flex items-center gap-1.5">
                                                                        #{o.serial_number}
                                                                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                    </button>
                                                                ) : (
                                                                    <span className="font-mono text-amber-500 font-black">#{o.serial_number}</span>
                                                                )}
                                                            </td>
                                                            <td className="p-4 text-zinc-400">{o.date ? formatDate(o.date) : '—'}</td>
                                                            <td className="p-4 font-mono text-zinc-300">{formatCurrency(o.total_amount || 0)}</td>
                                                            <td className="p-4">
                                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${fechado
                                                                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                                                    : 'text-zinc-500 border-zinc-800 bg-zinc-950'}`}>
                                                                    {ROTULO_STATUS[o.status || ''] || o.status}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                {orcamentosCompletos.find(x => x.id === o.id) && (
                                                                    <button onClick={() => setPreview(orcamentosCompletos.find(x => x.id === o.id))}
                                                                        title="Ver o orcamento sem sair daqui"
                                                                        className="p-2 rounded-lg text-zinc-600 hover:text-amber-500 hover:bg-amber-500/10 transition-colors opacity-0 group-hover:opacity-100">
                                                                        <Eye size={14} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </section>
                            <section className="space-y-3">
                                <p className={ROTULO}>Pedidos</p>
                                <div className={`${CARTAO} overflow-hidden`}>
                                    {dossie.pedidos.length === 0 ? <Vazio texto="Nenhum pedido para este cliente." /> : (
                                        <table className="w-full text-left text-[11px]">
                                            <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                                <tr><th className="p-4">Pedido</th><th className="p-4">Aberto em</th><th className="p-4">Prazo</th><th className="p-4">Valor</th><th className="p-4">Situação</th><th className="p-4 text-right">Orçamento</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-900">
                                                {dossie.pedidos.map(p => (
                                                    <tr key={p.id} className="group hover:bg-zinc-800/40 transition-colors">
                                                        <td className="p-4 font-mono text-amber-500 font-black">#{p.order_number}</td>
                                                        <td className="p-4 text-zinc-400">{p.created_at ? formatDate(p.created_at) : '—'}</td>
                                                        <td className="p-4 text-zinc-400">{p.deadline ? formatDate(p.deadline) : '—'}</td>
                                                        <td className="p-4 font-mono text-zinc-300">{formatCurrency(p.total_amount || 0)}</td>
                                                        <td className="p-4 text-[9px] font-black uppercase tracking-widest text-zinc-400">{p.status || '—'}</td>
                                                        <td className="p-4 text-right">
                                                            {(() => {
                                                                // O pedido nasce de um orcamento; e ele que
                                                                // guarda a proposta detalhada para conferir.
                                                                const origem = orcamentosCompletos.find(
                                                                    o => o.generated_order_number === p.order_number
                                                                        || o.id === (p as any).budget_id);
                                                                if (!origem) return <span className="text-[10px] text-zinc-700">—</span>;
                                                                return (
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        <span className="font-mono text-[10px] text-zinc-600">#{origem.serial_number}</span>
                                                                        <button onClick={() => setPreview(origem)} title="Ver o orcamento de origem"
                                                                            className="p-2 rounded-lg text-zinc-600 hover:text-amber-500 hover:bg-amber-500/10 transition-colors">
                                                                            <Eye size={14} />
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </section>
                            <section className="space-y-3">
                                <p className={ROTULO}>Entregas</p>
                                <div className={`${CARTAO} overflow-hidden`}>
                                    {entregas.length === 0 ? (
                                        <Vazio texto="Nenhuma entrega apurada. A data real vem do apontamento de expedição no PCP." />
                                    ) : (
                                        <table className="w-full text-left text-[11px]">
                                            <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                                <tr><th className="p-4">Pedido</th><th className="p-4">Entregue em</th><th className="p-4">Prazo</th><th className="p-4">Atraso</th><th className="p-4">Peças</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-900">
                                                {entregas.map(e => (
                                                    <tr key={e.order_id} className="hover:bg-zinc-800/40 transition-colors">
                                                        <td className="p-4 font-mono text-amber-500 font-black">#{e.pedido}</td>
                                                        <td className="p-4 text-zinc-300">{formatDate(e.entregueEm)}</td>
                                                        <td className="p-4 text-zinc-400">{e.prazo ? formatDate(e.prazo) : '—'}</td>
                                                        <td className="p-4 font-mono font-black">
                                                            {e.diasDeAtraso === null ? <span className="text-zinc-600">—</span>
                                                                : e.diasDeAtraso > 0 ? <span className="text-rose-400">+{e.diasDeAtraso}d</span>
                                                                    : <span className="text-emerald-400">{e.diasDeAtraso === 0 ? 'no dia' : `${e.diasDeAtraso}d`}</span>}
                                                        </td>
                                                        <td className="p-4 font-mono text-zinc-400">{e.pecas}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {/* ── Dinheiro ──────────────────────────────────────── */}
                    {aba === 'dinheiro' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <Indicador rotulo="Recebido" valor={formatCurrency(dossie.totalRecebido)} tom="emerald" />
                                <Indicador rotulo="Em aberto" valor={formatCurrency(dossie.aReceber)}
                                    sub={rodapeEmProducao(dossie.emProducao)} />
                                <Indicador rotulo="Vencido" valor={formatCurrency(dossie.vencido)} tom={dossie.vencido > 0 ? 'rose' : 'emerald'} />
                            </div>

                            {contasEmAberto.length > 0 && (
                                <div className="flex justify-end">
                                    <BotaoMensagem
                                        titulo="Lembrete de vencimento"
                                        telefone={cliente.phone}
                                        // A conta que vence primeiro é a que se cobra;
                                        // mandar o total somado misturaria parcelas com
                                        // vencimentos diferentes numa cobrança só.
                                        texto={msgLembreteDeVencimento(cliente, {
                                            description: contasEmAberto[0].description,
                                            remaining_amount: contasEmAberto[0].remaining_amount,
                                            due_date: contasEmAberto[0].due_date,
                                        })}
                                    />
                                </div>
                            )}

                            <div className={`${CARTAO} overflow-hidden`}>
                                {dossie.contas.length === 0 ? <Vazio texto="Nenhuma conta lançada para este cliente." /> : (
                                    <table className="w-full text-left text-[11px]">
                                        <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                            <tr><th className="p-4">Descrição</th><th className="p-4">Vencimento</th><th className="p-4">Valor</th><th className="p-4">Pago</th><th className="p-4">Falta</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-900">
                                            {dossie.contas.map(c => {
                                                const cancelada = !!c.cancelled_at || c.derived_status === 'cancelled';
                                                return (
                                                    <tr key={c.id} className={`hover:bg-zinc-800/40 transition-colors ${cancelada ? 'opacity-40' : ''}`}>
                                                        <td className="p-4 text-zinc-300 font-bold">
                                                            {c.description}
                                                            {cancelada && <span className="ml-2 text-[8px] font-black uppercase text-rose-500">cancelada</span>}
                                                            {/* Pedido ainda não entregue: fora dos cartões de vencido e a receber. */}
                                                            {c.awaiting_delivery && <span className={`${ROTULO_PEQUENO} ml-2`}>em produção</span>}
                                                        </td>
                                                        <td className="p-4 text-zinc-400">{c.due_date ? formatDate(c.due_date) : '—'}</td>
                                                        <td className="p-4 font-mono text-zinc-300">{formatCurrency(c.original_amount || 0)}</td>
                                                        <td className="p-4 font-mono text-emerald-400">{formatCurrency(c.paid_amount || 0)}</td>
                                                        <td className="p-4 font-mono text-amber-500">{formatCurrency(c.remaining_amount || 0)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Contrato ──────────────────────────────────────── */}
                    {aba === 'contrato' && (
                        <PainelDoContrato
                            clientId={cliente.id}
                            pecas={dossie.pecas}
                            intervaloMedioDias={dossie.padrao.intervaloMedioDias}
                        />
                    )}

                    {/* ── Fotos ─────────────────────────────────────────── */}
                    {aba === 'fotos' && (
                        <div className="space-y-4">
                            <div className={`${CARTAO} p-5`}>
                                <FotosDoCliente
                                    photos={fotos}
                                    onChange={(novas) => { setFotos(novas); salvar({ reference_photos: novas }); }}
                                    clientId={cliente.id}
                                />
                            </div>

                            {/* ── Importar dos orçamentos ──
                                A arte quase sempre chega anexada a um orçamento e morre ali.
                                Trazer para o cadastro é o que a faz valer para os próximos —
                                e copiar o CAMINHO em vez de reenviar o arquivo evita uma
                                segunda cópia do mesmo binário no bucket. */}
                            {(() => {
                                const jaSalvas = new Set(fotos);
                                const disponiveis = dossie.fotosDosOrcamentos.filter(f => !jaSalvas.has(f));
                                if (dossie.fotosDosOrcamentos.length === 0) return null;
                                return (
                                    <div className={`${CARTAO} p-5 space-y-3`}>
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                                <ImagePlus size={12} className="text-amber-500" />
                                                Fotos dos orçamentos deste cliente
                                            </p>
                                            {disponiveis.length > 0 && (
                                                <button
                                                    onClick={() => {
                                                        const novas = [...fotos, ...disponiveis];
                                                        setFotos(novas);
                                                        salvar({ reference_photos: novas });
                                                    }}
                                                    disabled={salvando}
                                                    className={BOTAO_SUAVE}>
                                                    Guardar todas ({disponiveis.length})
                                                </button>
                                            )}
                                        </div>

                                        {disponiveis.length === 0 ? (
                                            <p className="text-[10px] text-zinc-600 font-bold">
                                                Todas as fotos dos orçamentos já estão guardadas no cadastro.
                                            </p>
                                        ) : (
                                            <>
                                                <p className="text-[10px] text-zinc-600 font-bold leading-relaxed">
                                                    Clique na foto para ver grande. Guardar traz para o cadastro do
                                                    cliente, e ela passa a valer para os próximos orçamentos.
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {disponiveis.map(caminho => (
                                                        <div key={caminho} className="space-y-1">
                                                            <Miniatura
                                                                path={caminho}
                                                                onOpen={() => setFotoAmpliada(caminho)}
                                                                nomeParaBaixar={cliente.company_name}
                                                            />
                                                            <button
                                                                onClick={() => {
                                                                    const novas = [...fotos, caminho];
                                                                    setFotos(novas);
                                                                    salvar({ reference_photos: novas });
                                                                }}
                                                                disabled={salvando}
                                                                className="w-20 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest bg-zinc-950/60 text-zinc-500 border border-zinc-800 hover:text-amber-500 hover:border-amber-500/30 transition-colors disabled:opacity-40">
                                                                Guardar
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </>
            )}

            {preview && (
                <BudgetPreviewModal
                    budget={preview}
                    client={cliente}
                    companyProfile={companyProfile}
                    onClose={() => setPreview(null)}
                    // Imprimir sai da tela de Orçamentos, que é quem tem o
                    // serviço de PDF montado; aqui o preview é para conferir.
                    onPrint={() => {
                        setPreview(null);
                        if (onAbrirOrcamento && preview.serial_number) onAbrirOrcamento(preview.serial_number);
                    }}
                />
            )}

            {fotoAmpliada && <FotoAmpliada path={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
        </div>
    );
}

export default PaginaDoCliente;
