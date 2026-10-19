/**
 * Etiquetas que direcionam: dizem em que pé o orçamento/pedido está e qual é o próximo passo.
 * Spec do S3, seção 2. O "Enviado" usa a classificação da fila de retomada — os dois nunca discordam.
 */
import { filaDeFollowUp } from '../acompanhamentoComercial.ts';
import type { OrcamentoEnviado } from '../acompanhamentoComercial.ts';

export type TomDeVenda = 'neutro' | 'ambar' | 'rosa' | 'verde';
export type AcaoDoOrcamento = 'enviar' | 'retomar' | 'revalidar' | 'virar-pedido' | 'ver-pedido';

export interface EtiquetaDeOrcamento { texto: string; tom: TomDeVenda; acao: AcaoDoOrcamento; rotuloDaAcao: string }
export interface OrcamentoParaEtiquetar extends OrcamentoEnviado { generated_order_number?: string | null }

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const somarDias = (iso: string, dias: number): string =>
    new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

const RETOMAR = { acao: 'retomar' as const, rotuloDaAcao: 'Retomar' };

export function etiquetaDoOrcamento(o: OrcamentoParaEtiquetar, hoje: string): EtiquetaDeOrcamento {
    const status = (o.status || '').trim();
    if (status === 'Converted') {
        return { texto: o.generated_order_number ? `Pedido #${o.generated_order_number}` : 'Pedido', tom: 'neutro', acao: 'ver-pedido', rotuloDaAcao: 'Ver pedido' };
    }
    if (status === 'Approved') return { texto: 'Aprovado', tom: 'verde', acao: 'virar-pedido', rotuloDaAcao: 'Virar pedido' };
    if (status === 'Sent') {
        const [item] = filaDeFollowUp([o], hoje);
        const vence = o.date && Number(o.validity_days) > 0 ? somarDias(o.date, Number(o.validity_days)) : '';
        const dias = item.diasParado;
        switch (item.urgencia) {
            case 'vencido': return { texto: `Vencido em ${ddmm(vence)}`, tom: 'rosa', acao: 'revalidar', rotuloDaAcao: 'Refazer validade' };
            case 'vence-hoje': return { texto: 'Vence hoje', tom: 'ambar', ...RETOMAR };
            case 'vencendo': return { texto: `Vence em ${ddmm(vence)}`, tom: 'ambar', ...RETOMAR };
            case 'parado': return { texto: dias === null ? 'Enviado' : `Parado há ${dias} dias`, tom: 'ambar', ...RETOMAR };
            default: return { texto: dias === null ? 'Enviado' : dias === 0 ? 'Enviado hoje' : `Enviado há ${dias} ${dias === 1 ? 'dia' : 'dias'}`, tom: 'ambar', ...RETOMAR };
        }
    }
    return { texto: 'Rascunho', tom: 'neutro', acao: 'enviar', rotuloDaAcao: 'Enviar ao cliente' };
}

export type AcaoDoPedido = 'confirmar' | 'andamento' | 'ficha-de-entrega';

/** A ação à vista no cartão do pedido. `ultimoSetor` = nome do último setor da produção. */
export function acaoDoPedido(
    p: { status?: string | null; production_stage?: string | null },
    ultimoSetor: string | null,
): { acao: AcaoDoPedido; rotulo: string } {
    const status = (p.status || '').trim();
    const noUltimo = !!ultimoSetor && (p.production_stage || '').trim() === ultimoSetor.trim();
    if (status === 'Entregue' || noUltimo) return { acao: 'ficha-de-entrega', rotulo: 'Ficha de entrega' };
    if (status === 'Em Produção') return { acao: 'andamento', rotulo: 'Avisar andamento' };
    return { acao: 'confirmar', rotulo: 'Confirmar ao cliente' };
}

/** Classes da etiqueta, no formato pílula do estilo.ts (mesma altura, só muda a cor). */
export const CLASSE_DO_TOM_DE_VENDA: Record<TomDeVenda, string> = {
    neutro: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60',
    ambar: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    rosa: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    verde: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};
