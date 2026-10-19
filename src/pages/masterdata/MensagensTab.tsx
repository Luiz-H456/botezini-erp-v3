import { useState } from 'react';
import { Copy, Check, MessageCircle, Search } from 'lucide-react';
import {
    msgPrimeiroContato, msgLevantamento, msgCobrarGrade, msgOrcamentoEnviado,
    msgFechamento, msgPedidoConfirmado, msgAprovacaoDeArte, msgAndamento,
    msgEntregaParcial, msgEntregue, msgLembreteDeVencimento, msgCobrancaVencida,
    msgCobrarEntrada,
} from '@/utils/mensagensCliente';
import { CARTAO, ITEM, CAMPO, BOTAO_SUAVE, BOTAO_SECUNDARIO, pilula } from '@/components/finance/ui/estilo';

/**
 * Cliente de exemplo com todos os campos preenchidos.
 *
 * As mensagens são funções de dados — para mostrá-las "em branco" seria preciso
 * ou duplicar os textos (que sairiam do ar em relação aos reais na primeira
 * edição) ou passar dados vazios, o que deixaria buracos sem sentido no meio da
 * frase. Preenchendo com um exemplo reconhecível, o texto vem inteiro e legível,
 * e quem copia sabe exatamente o que trocar.
 */
const EXEMPLO = {
    company_name: '[RAZÃO SOCIAL]',
    contact_person: '[NOME]',
    cnpj: '[CNPJ]',
    phone: '',
    email: '[E-MAIL]',
    address: '[ENDEREÇO]',
};

const PEDIDO = { order_number: '[Nº]', deadline: '', total_amount: 0, amount_paid: 0 };

interface Modelo {
    id: string;
    etapa: string;
    titulo: string;
    quando: string;
    texto: string;
}

const MODELOS: Modelo[] = [
    {
        id: 'primeiro-contato', etapa: 'Cadastro', titulo: 'Primeiro contato',
        quando: 'Cliente novo pediu orçamento e ainda não está no sistema.',
        texto: msgPrimeiroContato(),
    },
    {
        id: 'levantamento', etapa: 'Orçamento', titulo: 'Levantamento da peça + grade',
        quando: 'Cadastro feito, antes de calcular o preço. A grade vem aqui porque tamanho grande custa mais.',
        texto: msgLevantamento(EXEMPLO),
    },
    {
        id: 'cobrar-grade', etapa: 'Orçamento', titulo: 'Cobrar a grade de tamanhos',
        quando: 'O cliente respondeu tudo menos a grade, e sem ela o valor não fecha.',
        texto: msgCobrarGrade(EXEMPLO),
    },
    {
        id: 'orcamento-enviado', etapa: 'Orçamento', titulo: 'Enviar o orçamento',
        quando: 'Proposta pronta, junto com o PDF.',
        texto: msgOrcamentoEnviado(EXEMPLO, { serial_number: '[Nº]', total_amount: 0, delivery_time_days: 0, validity_days: 0 }),
    },
    {
        id: 'fechamento', etapa: 'Fechamento', titulo: 'Fechar o pedido',
        quando: 'Valor aprovado. Mostra os dados fiscais para conferência em vez de reperguntar.',
        texto: msgFechamento(EXEMPLO, { serial_number: '[Nº]', delivery_time_days: 0, down_payment_value: 0 }),
    },
    {
        id: 'cobrar-entrada', etapa: 'Fechamento', titulo: 'Cobrar a entrada para iniciar',
        quando: 'Valor aprovado, mas a produção não começa até a entrada cair. Explica que ela é o que libera o tecido, em vez de só cobrar.',
        texto: msgCobrarEntrada(EXEMPLO, { serial_number: '[Nº]', total_amount: 0, down_payment_value: 0, delivery_time_days: 0 }),
    },
    {
        id: 'confirmado', etapa: 'Fechamento', titulo: 'Pedido confirmado',
        quando: 'Orçamento virou pedido. O prazo conta desta data, não da do orçamento.',
        texto: msgPedidoConfirmado(EXEMPLO, { ...PEDIDO, confirmado_em: '', prazo_dias: null }),
    },
    {
        id: 'arte', etapa: 'Produção', titulo: 'Aprovação da arte',
        quando: 'Sempre que houver bordado, silk ou DTF. A resposta por escrito é a prova.',
        texto: msgAprovacaoDeArte(EXEMPLO),
    },
    ...['Aguardando Material', 'Corte', 'Personalização', 'Costura', 'Finalização', 'Transporte'].map(etapa => ({
        id: `andamento-${etapa}`, etapa: 'Produção', titulo: `Andamento — ${etapa}`,
        quando: `O pedido entrou no setor de ${etapa.toLowerCase()}.`,
        texto: msgAndamento(EXEMPLO, PEDIDO, etapa),
    })),
    {
        id: 'entrega-parcial', etapa: 'Entrega', titulo: 'Entrega parcial',
        quando: 'Parte do pedido ficou pronta antes. No sistema a lista de peças vem preenchida sozinha.',
        texto: msgEntregaParcial(EXEMPLO, PEDIDO, [{ descricao: '[PEÇA / COR]', quantidade: 0 }]),
    },
    {
        id: 'entregue', etapa: 'Entrega', titulo: 'Pedido entregue',
        quando: 'Pedido concluído.',
        texto: msgEntregue(EXEMPLO, PEDIDO, null),
    },
    {
        id: 'lembrete', etapa: 'Cobrança', titulo: 'Lembrete antes de vencer',
        quando: '3 dias úteis antes do vencimento. Evita a cobrança depois, que é a constrangedora.',
        texto: msgLembreteDeVencimento(EXEMPLO, { remaining_amount: 0, due_date: '' }),
    },
    {
        id: 'vencido', etapa: 'Cobrança', titulo: 'Cobrança de vencido',
        quando: 'A partir de 2 dias de atraso. Firme, sem acusação.',
        texto: msgCobrancaVencida(EXEMPLO, { remaining_amount: 0, due_date: '' }),
    },
];

export const TOTAL_DE_MENSAGENS = MODELOS.length;

const ETAPAS = ['Todas', 'Cadastro', 'Orçamento', 'Fechamento', 'Produção', 'Entrega', 'Cobrança'];

function CartaoDeModelo({ m }: { m: Modelo }) {
    const [copiado, setCopiado] = useState(false);

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(m.texto);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = m.texto;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1800);
    };

    return (
        <div className={`${ITEM} overflow-hidden flex flex-col`}>
            <div className="px-4 py-3 border-b border-zinc-800 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                            {m.etapa}
                        </span>
                        <h3 className="text-xs font-black text-white truncate">{m.titulo}</h3>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-bold leading-relaxed mt-1">{m.quando}</p>
                </div>
                <button
                    onClick={copiar}
                    className={`shrink-0 ${copiado ? BOTAO_SUAVE : BOTAO_SECUNDARIO}`}
                >
                    {copiado ? <Check size={14} /> : <Copy size={14} />}
                    {copiado ? 'Copiado' : 'Copiar'}
                </button>
            </div>
            <p className="px-4 py-3 text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap flex-1">
                {m.texto}
            </p>
        </div>
    );
}

/**
 * Todas as mensagens num lugar só, para copiar sem depender de um cliente.
 *
 * Os textos vêm das MESMAS funções que o resto do app usa — não são cópias.
 * Duplicá-los aqui garantiria que um dia esta aba mostrasse uma versão antiga
 * do que o sistema realmente manda.
 */
export function MensagensTab() {
    const [etapa, setEtapa] = useState('Todas');
    const [busca, setBusca] = useState('');

    const visiveis = MODELOS.filter(m => {
        if (etapa !== 'Todas' && m.etapa !== etapa) return false;
        const q = busca.trim().toLowerCase();
        if (!q) return true;
        return (m.titulo + m.quando + m.texto).toLowerCase().includes(q);
    });

    return (
        <div className="space-y-6 ease-out animate-in fade-in duration-200">
            <div className={`${CARTAO} flex items-start gap-3 p-4`}>
                <MessageCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Modelos genéricos para copiar e preencher à mão. Onde estiver{' '}
                    <span className="text-zinc-200 font-bold">[ENTRE COLCHETES]</span>, troque pelo dado real.
                    Nas telas de Clientes, Orçamentos, Pedidos, PCP e Recebíveis o mesmo texto aparece{' '}
                    <strong className="text-zinc-300">já preenchido</strong> no botão <em>Mensagem</em> — use daqui
                    só quando não houver um registro para partir.
                </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                    <input
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar na mensagem..."
                        className={`${CAMPO} w-full pl-9`}
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {ETAPAS.map(e => (
                        <button
                            key={e}
                            onClick={() => setEtapa(e)}
                            className={pilula(etapa === e)}
                        >
                            {e}
                        </button>
                    ))}
                </div>
            </div>

            {visiveis.length === 0 ? (
                <div className="text-center py-16 text-[11px] font-black text-zinc-600 uppercase tracking-widest">
                    Nenhuma mensagem encontrada
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {visiveis.map(m => <CartaoDeModelo key={m.id} m={m} />)}
                </div>
            )}
        </div>
    );
}
