import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Building2, User, Package, DollarSign, Calendar, FileText, CreditCard, ImageOff, Camera, AlertTriangle } from 'lucide-react';
import { Budget, Client, CompanyProfile } from '@/types';
import { formatCurrency, formatDate, addBusinessDays, getTodayStr } from '@/utils';
import { descreverCondicao } from '@/utils/condicaoDePagamento';
import { conferirPlano } from '@/utils/planoDoPedido';
import { dadosBancariosDoOrcamento } from '@/utils/perfilDaEmpresa';
import { Miniatura, FotoAmpliada } from '@/components/common/GaleriaDeFotos';

interface Props {
    budget: Budget;
    client?: Client;
    companyProfile?: CompanyProfile | null;
    onClose: () => void;
    /** Gera com as fotos de referência (padrão). */
    onPrint: () => void;
    /** Versão sem imagem. Só definido quando o orçamento tem fotos anexadas. */
    onPrintWithoutPhotos?: () => void;
}

const translateCustType = (type: string): string => {
    const map: Record<string, string> = {
        Embroidery: 'Bordado',
        ScreenPrint: 'Silk/Estampa',
        DTF: 'DTF',
        Other: 'Outro',
    };
    return map[type] || type;
};

export const BudgetPreviewModal: React.FC<Props> = ({ budget, client, companyProfile, onClose, onPrint, onPrintWithoutPhotos }) => {
    const subtotalBase = (budget.subtotal_items || 0) + (budget.subtotal_customizations || 0) + (budget.subtotal_extras || 0);
    // A pré-visualização nunca mostrava as fotos anexadas — só o PDF final as
    // trazia. Quem conferia antes de gerar via aqui um orçamento "sem foto
    // nenhuma", mesmo com fotos salvas, e o botão "SEM FOTOS" ao lado (que
    // troca a versão do PDF a gerar) lia como se fosse essa mesma constatação.
    const fotos = budget.reference_photos || [];
    const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
    /**
     * A condição de pagamento lida do PLANO.
     *
     * A tela mostrava sempre dois quadros — "Entrada (x%)" e "Saldo na Entrega"
     * — montados a partir de `down_payment_value`/`delivery_payment_value`. Com
     * plano de N parcelas esses campos guardam "primeira parcela" e "soma das
     * demais", então um 30/60/90 aparecia como "Entrada (33%) R$ 466,67" (não
     * há entrada nenhuma) e um "à vista em 30 dias" como "Entrada (100%)" com o
     * total inteiro. O PDF já mostrava o plano correto; a tela e o papel
     * discordavam sobre o que foi combinado.
     */
    const condicao = descreverCondicao(budget, getTodayStr());
    const hasPaymentInfo = condicao.parcelas.length > 0;
    // A pré-visualização é a última parada antes do cliente. Se o plano não
    // fecha com o total, é aqui que precisa aparecer — o PDF vai omiti-lo.
    const conferencia = conferirPlano(budget.payment_plan, budget.total_amount ?? 0);
    const planoDesatualizado = (budget.payment_plan?.length ?? 0) > 0 && !conferencia.confere;
    const hasNotes = !!(budget.notes && budget.notes.trim());
    const banco = dadosBancariosDoOrcamento(companyProfile || {});
    const hasBankInfo = !!(banco.bank_name || banco.account_number || banco.pix_key);
    const deliveryDays = budget.delivery_time_days || 20;
    const estimatedDate = addBusinessDays(budget.date || '', deliveryDays);

    /**
     * Em portal, para o `fixed` nao depender de quem esta acima na arvore.
     *
     * `position: fixed` deixa de ser relativo a JANELA quando qualquer
     * ancestral tem transform, filter, backdrop-filter, contain ou
     * will-change — e a previa e montada la no fundo da arvore da pagina,
     * onde nenhum autor de componente sabe o que os pais fazem. Sem o portal,
     * bastava um ancestral novo ganhar um desses para a previa encolher para
     * dentro da area de conteudo e o X sair da tela.
     *
     * O dialogo de confirmacao desta mesma pagina ja fazia assim.
     */
    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-sobreposto flex items-center justify-center p-2 ease-out animate-in fade-in duration-200 overflow-hidden">
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden ease-out animate-in zoom-in-95 duration-200 relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>

                {/* Modal Header */}
                <div className="bg-zinc-900/50 border-b border-zinc-800 px-6 py-3 flex justify-between items-center shrink-0 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-lg shadow-amber-900/10">
                            <FileText size={20} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-lg font-black text-white uppercase tracking-tighter leading-none">
                                PREVISÃO DA PROPOSTA
                            </span>
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-1">Ref: {budget.serial_number}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onPrint}
                            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-amber-900/20 group"
                        >
                            <Printer size={14} className="group-hover:scale-110 transition-transform" /> GERAR PDF
                        </button>
                        {onPrintWithoutPhotos && (
                            // Rótulo antigo era "SEM FOTOS" — lido como um status
                            // ("isto não tem fotos"), não como a ação que é
                            // ("gerar OMITINDO as fotos que existem"). A confusão
                            // piorava porque a pré-visualização não mostrava foto
                            // nenhuma para contradizer a leitura errada.
                            <button
                                onClick={onPrintWithoutPhotos}
                                title={`Gera o PDF sem as ${fotos.length} foto${fotos.length > 1 ? 's' : ''} de referência anexada${fotos.length > 1 ? 's' : ''}`}
                                className="flex items-center gap-2 bg-zinc-950 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                            >
                                <ImageOff size={14} /> OMITIR FOTOS
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 transition-all flex items-center justify-center active:scale-90"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Preview Content */}
                <div className="flex-1 overflow-y-auto bg-zinc-950 p-6 custom-scrollbar">
                    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl max-w-4xl mx-auto overflow-hidden shadow-2xl relative">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-3xl rounded-full translate-x-32 -translate-y-32"></div>

                        {/* Document Header Simulation */}
                        <div className="flex flex-col md:flex-row border-b border-zinc-800">
                            <div className="flex-1 bg-zinc-900/50 p-6 flex items-center gap-6">
                                {companyProfile?.logo_url ? (
                                    <div className="w-24 h-24 rounded-2xl bg-white p-2 flex items-center justify-center shadow-xl">
                                        <img src={companyProfile.logo_url} alt="Logo" className="w-full h-full object-contain" />
                                    </div>
                                ) : (
                                    <div className="w-20 h-20 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 shadow-inner">
                                        <Building2 size={32} />
                                    </div>
                                )}
                                <div>
                                    <h1 className="text-xl font-black text-white uppercase tracking-tighter">{companyProfile?.name || 'SUA EMPRESA'}</h1>
                                    <div className="flex flex-col mt-2 gap-1">
                                        {companyProfile?.cnpj && <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">CNPJ: {companyProfile.cnpj}</span>}
                                        {companyProfile?.address && <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-relaxed max-w-xs">{companyProfile.address}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="w-full md:w-64 bg-amber-500 p-6 flex flex-col justify-center gap-4 relative overflow-hidden">
                                <div className="absolute -right-8 -bottom-8 text-black/5">
                                    <FileText size={160} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-black/60">Tipo de Documento</p>
                                    <p className="text-xl font-black uppercase text-black">Orçamento Comercial</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-black/40 tracking-widest">Número</p>
                                    <p className="text-sm font-black text-black">{budget.serial_number}</p>
                                </div>
                                <div className="flex gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-black/40 tracking-widest">Emissão</p>
                                        <p className="text-[11px] font-black text-black">{formatDate(budget.date)}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-black/40 tracking-widest">Validade</p>
                                        <p className="text-[11px] font-black text-black">
                                            {budget.validity_days > 0 ? `${budget.validity_days} DIAS` : 'SEM VALIDADE'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Client Section */}
                        <div className="px-6 sm:px-10 py-8 border-b border-zinc-800/50 flex flex-col md:flex-row gap-8">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-4">
                                    <User size={16} className="text-amber-500" />
                                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Destinatário da Proposta</p>
                                </div>
                                {client ? (
                                    <div className="space-y-4">
                                        <div>
                                            {/* `break-words` porque razão social vem com
                                                palavra única e longa ("SUPERMERCADOS...LTDA"):
                                                sem quebra dentro da palavra ela transborda a
                                                coluna em tela estreita. O tamanho também cede
                                                um degrau no celular. */}
                                            <p className="text-xl sm:text-2xl font-black text-white uppercase tracking-tighter break-words leading-tight">{client.company_name}</p>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                                {client.cnpj && <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">CNPJ: {client.cnpj}</span>}
                                                {client.category && <span className="text-[10px] font-black text-amber-500/80 uppercase tracking-widest bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">{client.category}</span>}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            {client.contact_person && <p className="text-xs font-black text-zinc-300 uppercase tracking-widest">{client.contact_person}</p>}
                                            {client.phone && <p className="text-xs font-medium text-zinc-500">{client.phone}</p>}
                                            {client.email && <p className="text-xs font-medium text-zinc-500">{client.email}</p>}
                                        </div>
                                        {client.address && (
                                            <div className="pt-2">
                                                <p className="text-[10px] font-black text-zinc-700 uppercase tracking-widest mb-1">Endereço de Entrega/Faturamento</p>
                                                <p className="text-xs text-zinc-500 leading-relaxed max-w-sm">{client.address}</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-xl">
                                        <p className="text-xs text-rose-500 font-black uppercase tracking-widest">Atenção: Cliente não vinculado ou removido</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Items Section */}
                        {(budget.items || []).length > 0 && (
                            <div className="px-10 py-8 border-b border-zinc-800/50">
                                <div className="flex items-center gap-3 mb-6">
                                    <Package size={16} className="text-amber-500" />
                                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Detalhamento de Produtos</p>
                                </div>
                                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-950/50 border-b border-zinc-800">
                                                <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">PRODUTO / REFERÊNCIA</th>
                                                <th className="px-4 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center">ESPECIFICAÇÕES</th>
                                                <th className="px-4 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center">TAM</th>
                                                <th className="px-4 py-4 text-[9px] font-black text-amber-500 uppercase tracking-widest text-center">QTD</th>
                                                <th className="px-4 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-right">VALOR UNIT.</th>
                                                <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-right">TOTAL ITEM</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/50">
                                            {budget.items.map((item, i) => (
                                                <tr key={i} className="hover:bg-zinc-800/30 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <span className="text-[11px] font-black text-white uppercase tracking-wider">{item.product_name}</span>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <span className="text-[10px] font-medium text-zinc-500 uppercase">
                                                            {`${item.model || ''} ${item.fabric || ''} ${item.color || ''}`.trim() || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                                                            {item.size}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <span className="text-[11px] font-black text-amber-500">{item.quantity}</span>
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <span className="text-[10px] font-medium text-zinc-400">{formatCurrency(item.unit_price)}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="text-[11px] font-black text-white">{formatCurrency(item.total)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Customizations */}
                        {(budget.customizations || []).length > 0 && (
                            <div className="px-10 py-8 border-b border-zinc-800/50">
                                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em] mb-4">Personalizações de Arte</p>
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-950/20 border-b border-zinc-800">
                                                <th className="px-6 py-3 text-[8px] font-black text-zinc-600 uppercase tracking-widest">TÉCNICA</th>
                                                <th className="px-4 py-3 text-[8px] font-black text-zinc-600 uppercase tracking-widest">DESCRIÇÃO</th>
                                                <th className="px-4 py-3 text-[8px] font-black text-zinc-600 uppercase tracking-widest text-center">POSIÇÃO</th>
                                                <th className="px-4 py-3 text-[8px] font-black text-zinc-600 uppercase tracking-widest text-center">QTD</th>
                                                <th className="px-6 py-3 text-[8px] font-black text-zinc-600 uppercase tracking-widest text-right">SUBTOTAL</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/30">
                                            {budget.customizations.map((c) => (
                                                <tr key={c.id} className="hover:bg-zinc-800/20 transition-colors">
                                                    <td className="px-6 py-3">
                                                        <span className="text-[10px] font-black text-white uppercase tracking-widest">{translateCustType(c.type)}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-[10px] font-medium text-zinc-500 uppercase">{c.description || '-'}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase">{c.position || '-'}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="text-[10px] font-bold text-zinc-300">{c.quantity}</span>
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-black text-zinc-300 text-[10px]">
                                                        {formatCurrency(c.total)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Extras */}
                        {(budget.extras || []).length > 0 && (
                            <div className="px-10 py-8 border-b border-zinc-800/50">
                                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em] mb-4">Serviços e Taxas Adicionais</p>
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-950/20 border-b border-zinc-800">
                                                <th className="px-6 py-3 text-[8px] font-black text-zinc-600 uppercase tracking-widest">DESCRIÇÃO DO SERVIÇO</th>
                                                <th className="px-4 py-3 text-[8px] font-black text-zinc-600 uppercase tracking-widest text-center">QTD</th>
                                                <th className="px-6 py-3 text-[8px] font-black text-zinc-600 uppercase tracking-widest text-right">SUBTOTAL</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/30">
                                            {budget.extras.map((e) => (
                                                <tr key={e.id} className="hover:bg-zinc-800/20 transition-colors">
                                                    <td className="px-6 py-3 font-medium text-zinc-400 text-xs uppercase">{e.description || '-'}</td>
                                                    <td className="px-4 py-3 text-center text-zinc-400 text-xs">{e.quantity}</td>
                                                    <td className="px-6 py-3 text-right font-black text-zinc-300 text-[10px]">{formatCurrency(e.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Fotos de Referência — mesma posição do PDF: perto do fim,
                            campo próprio. Miniatura reaproveitada do editor de
                            orçamento, com o mesmo hover "Ampliar" e o mesmo
                            visualizador em tela cheia. */}
                        {fotos.length > 0 && (
                            <div className="px-6 sm:px-10 py-8 border-b border-zinc-800/50">
                                <div className="flex items-center gap-3 mb-4">
                                    <Camera size={16} className="text-amber-500" />
                                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Fotos de Referência</p>
                                    <span className="text-[9px] font-bold text-zinc-600">
                                        {fotos.length} anexada{fotos.length > 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {fotos.map(caminho => (
                                        <Miniatura key={caminho} path={caminho} onOpen={() => setFotoAmpliada(caminho)} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Totals + Info */}
                        <div className="px-10 py-10 flex flex-col md:flex-row gap-10">
                            {/* Left: Info Sections */}
                            <div className="flex-1 space-y-8">
                                <div className="flex items-center gap-4 bg-zinc-950/50 border border-zinc-800 p-4 rounded-2xl">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-lg">
                                        <Calendar size={18} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Estimativa de Produção</span>
                                        <span className="text-xs font-black text-white uppercase tracking-wider mt-1">
                                            {deliveryDays} dias úteis — <span className="text-amber-500">{formatDate(estimatedDate)}</span>
                                        </span>
                                    </div>
                                </div>

                                {planoDesatualizado && (
                                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3">
                                        <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-black text-rose-300 uppercase tracking-widest">
                                                Plano de pagamento desatualizado
                                            </p>
                                            <p className="text-[11px] font-bold text-zinc-300 mt-1.5 leading-relaxed">
                                                As parcelas somam {formatCurrency(conferencia.total)}, mas o orçamento
                                                é de {formatCurrency(budget.total_amount)} —
                                                diferença de {formatCurrency(Math.abs(conferencia.diferenca))}.
                                            </p>
                                            <p className="text-[10px] font-bold text-zinc-500 mt-2 leading-relaxed">
                                                O PDF sai sem o plano para não mandar número errado ao cliente.
                                                Abra o orçamento e use <b className="text-zinc-400">Ajustar ao total</b>.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {hasPaymentInfo && !planoDesatualizado && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <CreditCard size={14} className="text-amber-500" />
                                            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Condição de Pagamento</span>
                                            <span className="text-[10px] font-bold text-zinc-500">{condicao.resumo}</span>
                                        </div>
                                        {/* Uma linha por parcela, com o vencimento de verdade.
                                            Entrada só aparece rotulada como entrada quando
                                            existe entrada — vencimento na confirmação. */}
                                        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/60 overflow-hidden">
                                            {condicao.parcelas.map((p, i) => (
                                                <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest truncate">{p.label}</p>
                                                        <p className="text-[9px] font-bold text-zinc-600 mt-0.5">
                                                            {p.naConfirmacao
                                                                ? 'na confirmação'
                                                                : (p.vencimento ? `até ${formatDate(p.vencimento)}` : 'na entrega')}
                                                            {p.meio ? ` · ${p.meio}` : ''}
                                                        </p>
                                                    </div>
                                                    <p className={`text-base font-black leading-none shrink-0 ${p.naConfirmacao ? 'text-white' : 'text-amber-500'}`}>
                                                        {formatCurrency(p.valor)}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {hasNotes && (
                                    <div className="bg-zinc-950/50 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-zinc-800/20 blur-2xl rounded-full"></div>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div>
                                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Observações do Proponente</p>
                                        </div>
                                        <p className="text-xs text-zinc-400 font-medium leading-relaxed whitespace-pre-wrap">{budget.notes}</p>
                                    </div>
                                )}

                                {hasBankInfo && (
                                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <DollarSign size={14} className="text-emerald-500" />
                                            <span className="text-[10px] font-black text-emerald-600/80 uppercase tracking-widest">Informações Financeiras para Depósito</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-y-3">
                                            {banco.bank_name && (
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black text-zinc-700 uppercase tracking-tighter">Banco</span>
                                                    <span className="text-[11px] font-bold text-zinc-300">{banco.bank_name}</span>
                                                </div>
                                            )}
                                            {(banco.agency || banco.account_number) && (
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black text-zinc-700 uppercase tracking-tighter">Agência / Conta</span>
                                                    <span className="text-[11px] font-bold text-zinc-300">{banco.agency || '-'} / {banco.account_number || '-'}</span>
                                                </div>
                                            )}
                                            {banco.pix_key && (
                                                <div className="flex flex-col col-span-2 mt-2 pt-3 border-t border-emerald-500/10">
                                                    <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">Chave PIX Identificada</span>
                                                    <span className="text-lg font-black text-emerald-500 tracking-tighter">{banco.pix_key}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right: Totals Box */}
                            <div className="w-full md:w-80 space-y-6">
                                <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full"></div>

                                    <div className="flex justify-between items-center py-1">
                                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Subtotal Bruto</span>
                                        <span className="text-sm font-black text-zinc-400">{formatCurrency(subtotalBase)}</span>
                                    </div>

                                    {(budget.discount ?? 0) > 0 && (
                                        <div className="flex justify-between items-center py-1 border-t border-zinc-900 pt-4">
                                            <span className="text-[10px] font-black text-rose-500/60 uppercase tracking-widest">Desconto Aplicado</span>
                                            <span className="text-sm font-black text-rose-500/80">-{formatCurrency(budget.discount)}</span>
                                        </div>
                                    )}

                                    <div className="pt-8 border-t border-zinc-800 flex flex-col items-end group">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
                                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Total Consolidado</span>
                                        </div>
                                        <span className="text-5xl font-black text-white tracking-tighter group-hover:text-amber-400 transition-colors leading-none">
                                            {formatCurrency(budget.total_amount)}
                                        </span>
                                        <div className="w-full h-1 bg-amber-500/20 mt-4 rounded-full overflow-hidden">
                                            <div className="w-2/3 h-full bg-amber-500 rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {fotoAmpliada && <FotoAmpliada path={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
        </div>,
        document.body,
    );
};
