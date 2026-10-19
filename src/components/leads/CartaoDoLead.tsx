import React from 'react';
import {
    Building2, Users, MapPin, Phone, Mail, ArrowRight, XCircle, Clock,
} from 'lucide-react';
import { nomeDoLead, proximaEtapa, ROTULO_DA_ETAPA } from '@/utils/funilDeLeads';
import { formatCurrency } from '@/utils';
import type { Lead, EtapaDoLead } from '@/utils/funilDeLeads';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { BotaoCopiar, BotaoWhatsApp } from '@/components/common/BotaoCopiar';
import { msgAbordagemDeLead } from '@/utils/mensagensCliente';
import { ITEM, BOTAO_SECUNDARIO, BOTAO_PERIGO } from '@/components/finance/ui/estilo';

interface Props {
    lead: Lead;
    /** Nome da empresa, para a mensagem de abordagem. */
    nomeDaCasa?: string | null;
    onMover: (destino: EtapaDoLead) => void;
    onAbrir?: () => void;
    compacto?: boolean;
}

/**
 * Capital social em escala de leitura: 2.500.000 vira "R$ 2,5 mi".
 *
 * Uma casa decimal basta — a diferença entre 2,5 e 2,6 milhões não muda como
 * se aborda a empresa, e é isso que o cartão precisa dizer.
 */
const capitalCurto = (v: number): string => {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`;
    if (v >= 1_000) return `R$ ${Math.round(v / 1_000)} mil`;
    return formatCurrency(v);
};

const fone = (t?: string | null) => {
    const d = (t || '').replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d || '';
};

/**
 * Um lead, do jeito que se olha antes de ligar.
 *
 * O PORTE aparece em destaque porque é o critério de ordem da fila: com tempo
 * limitado, liga-se primeiro para quem compra mais peças. Sem ele visível, a
 * ordem da lista pareceria arbitrária.
 */
export const CartaoDoLead: React.FC<Props> = ({ lead, nomeDaCasa, onMover, onAbrir, compacto }) => {
    const proxima = proximaEtapa(lead.status);
    const mensagem = msgAbordagemDeLead(lead, nomeDaCasa);

    return (
        <div className={`${ITEM} group hover:border-zinc-700 transition-colors overflow-hidden`}>
            <button onClick={onAbrir} className="w-full text-left px-4 py-3 min-w-0">
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-zinc-200 truncate group-hover:text-white transition-colors">
                            {nomeDoLead(lead)}
                        </p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px] text-zinc-600 font-medium">
                            {Number(lead.porte_funcionarios) > 0 && (
                                <span className="flex items-center gap-1 text-amber-500/80 font-black">
                                    <Users size={12} /> {lead.porte_funcionarios}
                                </span>
                            )}
                            {lead.segmento && <span className="capitalize">{lead.segmento}</span>}
                            {/* Capital social entra ABREVIADO — "R$ 2,5 mi" e não
                                "R$ 2.500.000,00". Aqui ele serve para dimensionar a
                                empresa de relance, e a precisão em centavos ocuparia
                                metade da linha para responder uma pergunta que
                                ninguém faz olhando um cartão de lead. */}
                            {Number(lead.capital_social) > 0 && (
                                <span className="text-emerald-500/70 font-black" title={`Capital social: ${formatCurrency(Number(lead.capital_social))}`}>
                                    {capitalCurto(Number(lead.capital_social))}
                                </span>
                            )}
                            {/* O CNAE é mais fino que o segmento: "fabricação de
                                produtos alimentícios" e "restaurante" caem os dois em
                                alimentação, e o uniforme de um não se parece com o do
                                outro. Só o código, que é o que cabe — o título
                                completo vai no title. */}
                            {lead.cnae_principal && (
                                <span className="font-mono text-zinc-700" title={`CNAE ${lead.cnae_principal}`}>
                                    {lead.cnae_principal}
                                </span>
                            )}
                            {lead.cidade && (
                                <span className="flex items-center gap-1 truncate">
                                    <MapPin size={12} /> {lead.cidade}{lead.uf ? `/${lead.uf}` : ''}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {lead.proxima_acao && (
                    <p className="flex items-start gap-2 mt-2 text-[10px] text-zinc-400 leading-snug">
                        <Clock size={12} className="shrink-0 mt-0.5 text-zinc-600" />
                        <span className="truncate">{lead.proxima_acao}</span>
                    </p>
                )}

                {lead.motivo_perda && (
                    <p className="mt-2 text-[10px] text-rose-400/80 truncate">
                        perdido: {lead.motivo_perda}
                    </p>
                )}
            </button>

            {/* FORA do botão do cartão, e não por estética.
                Estes controles SÃO botões, e botão dentro de botão é HTML
                inválido: o React avisa no console, e o navegador resolve a
                ambiguidade do jeito dele — clicar em "copiar" podia abrir o
                cartão junto, ou nem copiar. O stopPropagation disfarçava o
                sintoma sem desfazer o aninhamento.

                Na prospecção o gesto do dia inteiro é tirar o número da tela e
                levar para outro lugar — discador, e-mail, planilha. Antes era
                preciso selecionar com o mouse um texto de 9 pixels dentro de um
                cartão que arrasta. O e-mail nem aparecia, apesar de o lead ter
                o campo desde sempre. */}
                {!compacto && (lead.contato_nome || lead.telefone || lead.email) && (
                    <div className="flex items-center gap-3 px-4 pb-2 -mt-1 text-[10px] text-zinc-500 flex-wrap">
                        {lead.contato_nome && (
                            <BotaoCopiar
                                valor={lead.contato_nome}
                                rotulo={lead.contato_nome + (lead.contato_cargo ? ` · ${lead.contato_cargo}` : '')}
                                titulo={`Copiar o nome — ${lead.contato_nome}`}
                                className="max-w-[150px]"
                            />
                        )}
                        {lead.telefone && (
                            <span className="flex items-center gap-1 font-mono">
                                <Phone size={12} className="shrink-0" />
                                {/* Copia só os dígitos: é o que o discador e o
                                    WhatsApp aceitam. O formatado é para ler. */}
                                <BotaoCopiar
                                    valor={lead.telefone.replace(/\D/g, '')}
                                    rotulo={fone(lead.telefone)}
                                    titulo={`Copiar o telefone — ${fone(lead.telefone)}`}
                                />
                            </span>
                        )}
                        {lead.email && (
                            <span className="flex items-center gap-1">
                                <Mail size={12} className="shrink-0" />
                                <BotaoCopiar valor={lead.email} titulo={`Copiar o e-mail — ${lead.email}`}
                                    className="max-w-[170px]" />
                            </span>
                        )}
                    </div>
                )}


            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                <BotaoMensagem
                    texto={mensagem}
                    titulo={`Abordagem — ${nomeDoLead(lead)}`}
                    telefone={lead.telefone}
                    compacto
                />

                {/* Conversa em branco, sem mensagem pronta. O BotaoMensagem ao
                    lado leva ao WhatsApp com um texto sugerido; no primeiro
                    contato quem escreve é a pessoa, e o texto sugerido vira só
                    uma coisa a apagar antes de digitar o dela. */}
                <BotaoWhatsApp telefone={lead.telefone} compacto />

                {proxima && (
                    <button
                        onClick={() => onMover(proxima)}
                        title={`Mover para ${ROTULO_DA_ETAPA[proxima]}`}
                        className={BOTAO_SECUNDARIO}
                    >
                        {ROTULO_DA_ETAPA[proxima]} <ArrowRight size={14} />
                    </button>
                )}

                {lead.status !== 'descartado' && lead.status !== 'cliente' && (
                    <button
                        onClick={() => onMover('descartado')}
                        title="Descartar — exige motivo"
                        className={`${BOTAO_PERIGO} ml-auto w-10 px-0`}
                        aria-label="Descartar lead"
                    >
                        <XCircle size={18} />
                    </button>
                )}

                {lead.client_id && (
                    <span className="ml-auto flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-500/70">
                        <Building2 size={12} /> cliente
                    </span>
                )}
            </div>
        </div>
    );
};

export default CartaoDoLead;
