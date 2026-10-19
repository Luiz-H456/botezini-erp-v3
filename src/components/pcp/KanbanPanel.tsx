import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, PackageCheck, Maximize2, Minimize2, Lock, GripVertical, Eye, Boxes, X, ClipboardCheck } from 'lucide-react';
import { usePcpKanban, KanbanCard } from '@/hooks/pcp/usePcpKanban';
import { getTodayStr } from '@/utils/date';
import { urgenciaDoPedido, UrgenciaPedido } from '@/utils/pcpSemana';
import { colunaSobPonto, passouLimiteDeArraste, direcaoAutoScroll, AreaColuna } from '@/utils/kanbanDnd';
import { JanelaConfirmarEntrega } from '@/components/financas/JanelaConfirmarEntrega';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { ProximoPasso } from '@/components/common/ProximoPasso';
import { storageService } from '@/services/storage';
import { InfoTooltip } from '@/components/common';
import { ROTULO, ROTULO_PEQUENO, CARTAO, BOTAO_SUAVE, BOTAO_SECUNDARIO, BOTAO_PRINCIPAL } from '@/components/finance/ui/estilo';
import { BaixaModal, type Lancamento } from '@/components/pcp/BaixaModal';
import { saldoPorItem, feitoSemItem, type SaldoItem } from '@/utils/baixaPorItem';
import { resumirPagamentoDoPedido } from '@/utils/situacaoDoPedido';
import { msgAndamento, msgProducaoIniciada, msgEntregue, linkDoWhatsApp } from '@/utils/mensagensCliente';
import type { Order, Client } from '@/types';
import { FichaDeEntrega } from '@/components/orders/FichaDeEntrega';
import type { View } from '@/utils/navegacao';
import { OrderPreviewModal } from '@/components/orders/OrderPreviewModal';

interface Props {
    /** Chão de fábrica: a janela de entrega não mostra valores nem edita parcelas. */
    semFinanceiro?: boolean;
    /** Pedido pela fila do Início: marca os atrasados ou leva o olhar ao último setor. */
    destaque?: 'atrasados' | 'ultimo-setor';
    /** Próximo passo após a entrega: leva a "Clientes que devem". */
    onIrPara?: (v: View) => void;
    /** "Ver o que receber" do passo de entrega: abre as Contas a receber já no cliente do pedido. */
    onVerReceber?: (clienteId: string) => void;
}

/** Estado do cartão que está sendo arrastado no momento. */
interface Arraste {
    card: KanbanCard;
    setorOrigem: string;
    x: number;            // posição atual do ponteiro (viewport)
    y: number;
    offsetX: number;      // onde dentro do cartão o gesto começou, para o
    offsetY: number;      // fantasma não "pular" para o canto do cursor
    largura: number;
}

export function KanbanPanel({ semFinanceiro = false, destaque, onIrPara, onVerReceber }: Props) {
    const kb = usePcpKanban();
    const [dispensado, setDispensado] = useState(false);
    const destaqueAtivo = dispensado ? undefined : destaque;
    // Modo fábrica: tela cheia e cartão grande, para o monitor do chão de
    // fábrica. Herdado da aba Produção (era só exibição, não permissão).
    const [full, setFull] = useState(false);
    /**
     * Pedido aberto na pré-visualização.
     *
     * O cartão do quadro cabe numa coluna estreita e por isso carrega só o
     * essencial: número, cliente, peças, prazo. Quem está movendo o pedido
     * entre setores muitas vezes precisa saber QUE peças são, em que tecido,
     * com qual personalização — e tinha de sair do quadro, abrir a aba de
     * pedidos e procurar pelo número. O pedido inteiro já está em memória.
     */
    const [pedidoEspiado, setPedidoEspiado] = useState<ReturnType<typeof kb.detalhesDoPedido>>(null);

    // Saldo real do pedido recém-entregue, para a mensagem ao cliente: vem das contas a receber
    // (amount_paid é legado, sempre 0). Sem valores no chão de fábrica / modo fábrica nem se lê.
    const semValores = semFinanceiro || full;
    const [saldoDaEntrega, setSaldoDaEntrega] = useState<{ pedidoId: string; saldo: number } | null>(null);
    const entregaId = kb.passo?.tipo === 'entregue' ? kb.passo.order.id : null;
    useEffect(() => {
        if (!entregaId || semValores) return;
        setSaldoDaEntrega(null);
        const order = kb.passo!.order;
        let vivo = true;
        // Mesma leitura de Pedidos: as contas do cliente (pagamento pode estar em outra conta dele).
        const leitura = order.client_id
            ? storageService.getObligations({ client_id: order.client_id, type: 'receivable' })
            : storageService.getObligations({ order_id: order.id, type: 'receivable' });
        leitura
            .then(contas => {
                const resumo = resumirPagamentoDoPedido(contas as any, order, order.total_amount);
                if (vivo && resumo.situacao !== 'sem_conta') setSaldoDaEntrega({ pedidoId: order.id, saldo: resumo.falta });
            })
            .catch(() => { /* leitura falhou: a mensagem sai sem saldo */ });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entregaId, semValores]);

    // Ficha de entrega aberta por cima da janela de confirmar (que continua aberta por baixo).
    const [fichaDoPedido, setFichaDoPedido] = useState<{ order: Order; client?: Client | null } | null>(null);
    // Sobe quando a ficha grava: a janela de confirmar remonta e relê total e parcelas (o aditivo muda os dois).
    const [versaoEntrega, setVersaoEntrega] = useState(0);
    const [abrindoFicha, setAbrindoFicha] = useState(false);
    // Ref além do estado: dois cliques antes do re-render passariam pelo estado velho.
    const abrindoFichaRef = useRef(false);
    const abrirFicha = async (pedidoId: string) => {
        if (abrindoFichaRef.current) return;
        abrindoFichaRef.current = true;
        setAbrindoFicha(true);
        try {
            const order = (await storageService.getOrders()).find(o => o.id === pedidoId);
            if (!order) return;
            const client = kb.detalhesDoPedido(pedidoId)?.client
                ?? (await storageService.getClients()).find(c => c.id === order.client_id);
            setFichaDoPedido({ order, client });
        } catch { /* leitura falhou: a janela de confirmar segue como está */ }
        finally { abrindoFichaRef.current = false; setAbrindoFicha(false); }
    };

    // Baixa parcial aberta pelo atalho do cartão: mesma janela do Controle parcial.
    const [baixa, setBaixa] = useState<{ order: Order; saldos: SaldoItem[]; semItem: number; sectors: { id: string; name: string }[] } | null>(null);
    const [gravandoBaixa, setGravandoBaixa] = useState(false);
    const [erroBaixa, setErroBaixa] = useState('');
    // Ref (não estado): o segundo clique chega antes do re-render.
    const lendoBaixaRef = useRef(false);
    const abrirBaixa = async (pedidoId: string) => {
        if (lendoBaixaRef.current) return;
        const det = kb.detalhesDoPedido(pedidoId);
        if (!det) return;
        lendoBaixaRef.current = true;
        setErroBaixa('');
        try {
            const [logs, sectors] = await Promise.all([
                storageService.getProductionLogs(pedidoId),
                storageService.getSectors(false),
            ]);
            setBaixa({ order: det.order, saldos: saldoPorItem(det.order.items || [], logs as any), semItem: feitoSemItem(logs as any), sectors });
        } catch { setErroBaixa(`Não consegui abrir a baixa do pedido #${det.order.order_number}`); }
        finally { lendoBaixaRef.current = false; }
    };

    // ── Arrastar e soltar ────────────────────────────────────────────────────
    const [arraste, setArraste] = useState<Arraste | null>(null);
    const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
    // Direção do auto-scroll é ESTADO, não ref: o efeito abaixo precisa reagir
    // quando ela muda. Como o React ignora setState com o mesmo valor, o
    // intervalo sobrevive aos pointermove em vez de ser recriado a cada pixel —
    // recriando, ele nunca chegaria a disparar e a rolagem não sairia do lugar.
    const [direcaoScroll, setDirecaoScroll] = useState<-1 | 0 | 1>(0);
    const faixaRef = useRef<HTMLDivElement>(null);
    const colunasRef = useRef<Map<string, HTMLDivElement>>(new Map());
    // Medidas congeladas no início do gesto: recalcular getBoundingClientRect a
    // cada pointermove força reflow do layout inteiro dezenas de vezes por
    // segundo, e o arraste engasga.
    const areasRef = useRef<AreaColuna[]>([]);

    // 'ultimo-setor': as colunas chegam depois do primeiro render, então o efeito
    // espera por elas e rola a faixa até a última.
    const ultimoSetor = kb.columns.length ? kb.columns[kb.columns.length - 1].sector.name : null;
    useEffect(() => {
        if (destaque === 'ultimo-setor' && ultimoSetor)
            colunasRef.current.get(ultimoSetor)?.scrollIntoView({ inline: 'end', block: 'nearest' });
    }, [destaque, ultimoSetor]);

    const registrarColuna = useCallback((nome: string, el: HTMLDivElement | null) => {
        if (el) colunasRef.current.set(nome, el);
        else colunasRef.current.delete(nome);
    }, []);

    const medirColunas = useCallback(() => {
        areasRef.current = [...colunasRef.current.entries()].map(([nome, el]) => {
            const r = el.getBoundingClientRect();
            return { id: nome, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        });
    }, []);

    // Rolagem automática ao arrastar até a beirada — sem isto não dá para
    // alcançar uma coluna que está fora da tela, porque a mão que arrasta é a
    // mesma que precisaria rolar o quadro.
    useEffect(() => {
        if (direcaoScroll === 0) return;
        const faixa = faixaRef.current;
        if (!faixa) return;
        const id = setInterval(() => { faixa.scrollLeft += direcaoScroll * 18; }, 16);
        return () => clearInterval(id);
    }, [direcaoScroll]);

    // As medidas são congeladas no início do gesto, mas rolar a faixa move as
    // colunas por baixo delas — e aí o cartão seria solto na coluna errada.
    // Remedir a cada rolagem cobre tanto o auto-scroll quanto o trackpad.
    useEffect(() => {
        if (!arraste) return;
        const faixa = faixaRef.current;
        if (!faixa) return;
        faixa.addEventListener('scroll', medirColunas, { passive: true });
        return () => faixa.removeEventListener('scroll', medirColunas);
    }, [arraste, medirColunas]);

    const aoArrastar = (x: number, y: number) => {
        setArraste(a => (a ? { ...a, x, y } : a));
        setColunaAlvo(colunaSobPonto(areasRef.current, x, y));
        const faixa = faixaRef.current;
        setDirecaoScroll(faixa ? direcaoAutoScroll(x, faixa.getBoundingClientRect()) : 0);
    };

    const aoSoltar = () => {
        const atual = arraste;
        const alvo = colunaAlvo;
        setArraste(null);
        setColunaAlvo(null);
        setDirecaoScroll(0);
        // Soltar fora do quadro, ou na própria coluna de origem, não é engano do
        // usuário — é desistir. Mover para o mesmo setor gravaria à toa.
        if (!atual || !alvo || alvo === atual.setorOrigem) return;
        kb.moveTo(atual.card.id, alvo);
    };

    // ── Arrastar a faixa de colunas ──────────────────────────────────────
    //
    // O cartão já usa o arraste para trocar de setor, então o pan só começa
    // quando o ponteiro pousa FORA de um cartão: no vão entre colunas, no
    // cabeçalho da coluna ou no corpo vazio dela. Sem essa checagem, arrastar um
    // cartão moveria o quadro junto e o alvo fugiria de baixo do dedo.
    const pan = useRef<{ x: number; scroll: number } | null>(null);
    const [arrastandoFaixa, setArrastandoFaixa] = useState(false);
    const [rolagem, setRolagem] = useState({ inicio: false, fim: false });

    const medirRolagem = useCallback(() => {
        const el = faixaRef.current;
        if (!el) return;
        const sobra = el.scrollWidth - el.clientWidth;
        setRolagem({
            inicio: el.scrollLeft > 4,
            // 4 px de folga: arredondamento de layout deixa scrollLeft alguns
            // décimos abaixo do fim e a seta ficaria acesa para sempre.
            fim: sobra > 4 && el.scrollLeft < sobra - 4,
        });
    }, []);

    useEffect(() => {
        medirRolagem();
        window.addEventListener('resize', medirRolagem);
        return () => window.removeEventListener('resize', medirRolagem);
    }, [medirRolagem, kb.columns.length, full]);

    const aoPressionarFaixa = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('[data-kanban-card]')) return;
        const el = faixaRef.current;
        if (!el) return;
        pan.current = { x: e.clientX, scroll: el.scrollLeft };
        setArrastandoFaixa(true);
    };

    const aoMoverFaixa = (e: React.PointerEvent) => {
        const el = faixaRef.current;
        if (!pan.current || !el) return;
        el.scrollLeft = pan.current.scroll - (e.clientX - pan.current.x);
        // Mede aqui também, e não só no onScroll: quando somos NÓS que mexemos
        // no scrollLeft, o evento de rolagem chega depois (e em alguns
        // contextos nem chega), então as setas ficariam um passo atrasadas.
        medirRolagem();
    };

    const soltarFaixa = () => {
        pan.current = null;
        setArrastandoFaixa(false);
    };

    /** Um passo = uma coluna, para o quadro parar sempre alinhado. */
    const rolarUmaColuna = (direcao: -1 | 1) => {
        const el = faixaRef.current;
        if (!el) return;
        el.scrollBy({ left: direcao * ((full ? 320 : 256) + 12), behavior: 'smooth' });
        // A animação termina depois; remede no fim para a seta apagar ao chegar
        // na ponta mesmo que o evento de rolagem não venha.
        window.setTimeout(medirRolagem, 400);
    };

    if (kb.loading) {
        return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>;
    }

    if (kb.columns.length === 0) {
        return (
            <div className="text-center py-16 text-xs text-zinc-500">
                <p>Nenhum setor cadastrado.</p>
                {onIrPara && (
                    <button onClick={() => onIrPara('setores')} className={`${BOTAO_SUAVE} mt-3`}>Cadastrar setores</button>
                )}
            </div>
        );
    }

    const names = kb.columns.map(c => c.sector.name);

    const quadro = (
        <div className={full ? 'fixed inset-0 z-modal bg-zinc-950 p-5 overflow-auto space-y-3' : 'space-y-3'}>
            <div className="flex items-center gap-2">
                <p className={ROTULO}>
                    Quadro de produção por setor
                </p>
                <InfoTooltip iconSize={13}>Arraste o cartão para trocar de setor, ou o fundo para deslizar o quadro.</InfoTooltip>
                {/* Setas discretas: só aparecem quando há para onde ir, e
                    apagam ao chegar na ponta em vez de sumirem — botão que
                    some faz o vizinho pular de lugar. */}
                <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => rolarUmaColuna(-1)} disabled={!rolagem.inicio}
                        title="Coluna anterior" aria-label="Coluna anterior"
                        className={`${BOTAO_SECUNDARIO} w-10 px-0`}>
                        <ChevronLeft size={18} />
                    </button>
                    <button onClick={() => rolarUmaColuna(1)} disabled={!rolagem.fim}
                        title="Próxima coluna" aria-label="Próxima coluna"
                        className={`${BOTAO_SECUNDARIO} w-10 px-0`}>
                        <ChevronRight size={18} />
                    </button>
                </div>

                <button onClick={() => setFull(f => !f)}
                    className={full ? BOTAO_PRINCIPAL : BOTAO_SECUNDARIO}>
                    {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    {full ? 'Sair' : 'Modo fábrica'}
                </button>
                <button onClick={kb.reload} aria-label="Recarregar" title="Recarregar" className={`${BOTAO_SECUNDARIO} w-10 px-0`}>
                    <RefreshCw size={18} className={kb.busy ? 'animate-spin' : ''} />
                </button>
            </div>

            <Legenda />

            {kb.passo && (() => {
                const { tipo, order, client } = kb.passo;
                const entregue = tipo === 'entregue';
                // Saldo carregando, falho, sem contas ou sem valores (fábrica): null, e a mensagem não cobra nada.
                const saldo = !semValores && saldoDaEntrega?.pedidoId === order.id ? saldoDaEntrega.saldo : null;
                const texto = entregue ? msgEntregue(client || {}, order, saldo) : msgProducaoIniciada(client || {}, order);
                const href = linkDoWhatsApp(client?.phone, texto);
                return (
                    <ProximoPasso
                        titulo={entregue ? `Pedido #${order.order_number} entregue` : `Produção do #${order.order_number} começou`}
                        principal={{ rotulo: 'Avisar o cliente', href, whatsapp: true, copiar: texto }}
                        secundario={entregue && !semValores && onIrPara ? { rotulo: 'Ver o que receber', onClick: () => (onVerReceber && order.client_id ? onVerReceber(order.client_id) : onIrPara('receivables')) } : undefined}
                        aviso={href ? undefined : 'cliente sem telefone'}
                        onFechar={kb.fecharPasso}
                    />
                );
            })()}

            {destaqueAtivo === 'atrasados' && (
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Destacando pedidos com prazo estourado</span>
                    <button type="button" onClick={() => setDispensado(true)}
                        className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">limpar</button>
                </div>
            )}

            {(kb.error || (erroBaixa && !baixa)) && <div className="text-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl"><p className="text-xs text-rose-400 font-bold">{kb.error || erroBaixa}</p></div>}

            {/* O que aconteceu com a sobra na entrega. Fica ao lado do erro mas não é um:
                quando isto aparece o pedido já foi entregue. É recado de estoque, e
                por isso se fecha no X em vez de sumir sozinho. Só fala de
                quantidades, então também aparece no modo fábrica. */}
            {kb.avisoDaEntrega && (
                <div className="flex items-start gap-2.5 p-3 bg-amber-500/[0.07] border border-amber-500/25 rounded-xl">
                    <Boxes size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200/90 font-medium flex-1 leading-relaxed">{kb.avisoDaEntrega}</p>
                    {kb.sobrasPendentes > 0 && (
                        <button onClick={kb.tentarApurarDeNovo} disabled={kb.busy} className={`${BOTAO_SECUNDARIO} px-3 shrink-0`}>
                            Tentar de novo
                        </button>
                    )}
                    <button
                        onClick={kb.limparAvisoDaEntrega}
                        className={`${BOTAO_SECUNDARIO} w-10 px-0 shrink-0`}
                        title="Fechar"
                        aria-label="Fechar aviso"
                    >
                        <X size={18} />
                    </button>
                </div>
            )}

            <div
                ref={faixaRef}
                onScroll={medirRolagem}
                onPointerDown={aoPressionarFaixa}
                onPointerMove={aoMoverFaixa}
                onPointerUp={soltarFaixa}
                onPointerLeave={soltarFaixa}
                onPointerCancel={soltarFaixa}
                className={`flex gap-3 overflow-x-auto pb-3 ${arrastandoFaixa ? 'cursor-grabbing select-none' : ''}`}
            >
                {kb.columns.map((col, ci) => {
                    const destacada = colunaAlvo === col.sector.name;
                    const origem = arraste?.setorOrigem === col.sector.name;
                    return (
                        <div key={col.sector.id}
                            ref={el => registrarColuna(col.sector.name, el)}
                            className={`${full ? 'w-80' : 'w-64'} shrink-0 flex flex-col transition-colors ${
                                destacada && !origem
                                    ? 'border rounded-2xl bg-amber-500/10 border-amber-500/60'
                                    : CARTAO
                            } ${destaqueAtivo === 'ultimo-setor' && ci === kb.columns.length - 1 ? 'ring-1 ring-amber-500/40' : ''}`}>
                            <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.sector.color }} />
                                    <span className="text-xs font-black text-white">{col.sector.name}</span>
                                </div>
                                <span className="text-[10px] font-mono text-zinc-500">{col.cards.length}</span>
                            </div>
                            <div className="p-2 space-y-2 min-h-[80px]">
                                {col.cards.length === 0 && (
                                    <p className={`text-[10px] font-bold text-center py-4 ${destacada && !origem ? 'text-amber-400' : 'text-zinc-700'}`}>
                                        {destacada && !origem ? 'soltar aqui' : 'vazio'}
                                    </p>
                                )}
                                {col.cards.map(card => (
                                    <Card key={card.id} card={card}
                                        canPrev={ci > 0} canNext={ci < kb.columns.length - 1}
                                        isLast={ci === kb.columns.length - 1}
                                        busy={kb.busy} full={full}
                                        destacado={destaqueAtivo === 'atrasados' && !!card.deadline && card.deadline < getTodayStr()}
                                        arrastando={arraste?.card.id === card.id}
                                        onPrev={() => kb.moveTo(card.id, names[ci - 1])}
                                        onNext={() => kb.moveTo(card.id, names[ci + 1])}
                                        onDeliver={() => kb.requestDelivery(card)}
                                        onEspiar={() => setPedidoEspiado(kb.detalhesDoPedido(card.id))}
                                        onBaixa={() => abrirBaixa(card.id)}
                                        onIniciarArraste={(a) => { medirColunas(); setArraste({ ...a, setorOrigem: col.sector.name }); }}
                                        onArrastar={aoArrastar}
                                        onSoltar={aoSoltar} />
                                ))}
                                {destacada && !origem && col.cards.length > 0 && (
                                    <div className="h-9 rounded-xl border-2 border-dashed border-amber-500/50 bg-amber-500/5" />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Fantasma do cartão arrastado. Vai num portal para escapar do
                overflow-x-auto da faixa de colunas — dentro dela, o cartão seria
                recortado ao passar da borda. */}
            {arraste && createPortal(
                <div
                    className="fixed pointer-events-none z-sobreposto opacity-90 rotate-2"
                    style={{
                        left: arraste.x - arraste.offsetX,
                        top: arraste.y - arraste.offsetY,
                        width: arraste.largura,
                    }}
                >
                    <Card card={arraste.card} canPrev={false} canNext={false} isLast={false}
                        busy={false} full={full} fantasma />
                </div>,
                document.body
            )}

            {kb.orphan.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                    <p className={`${ROTULO} mb-2 flex items-center gap-2`}>
                        <AlertTriangle size={12} className="text-amber-400" /> Estágio sem setor correspondente
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {kb.orphan.map(c => (
                            <span key={c.id} className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-400">
                                #{c.order_number} · {c.stage || 'sem estágio'}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {kb.deliveryConfirm && (
                <JanelaConfirmarEntrega
                    key={`${kb.deliveryConfirm.id}-${versaoEntrega}`}
                    pedidoId={kb.deliveryConfirm.id}
                    numero={kb.deliveryConfirm.order_number}
                    cliente={kb.deliveryConfirm.client_name}
                    semFinanceiro={semFinanceiro || full}
                    ocupado={kb.busy}
                    onCancelar={kb.cancelDelivery}
                    onConfirmar={kb.confirmDelivery}
                    onAbrirFicha={semFinanceiro || full ? undefined : () => abrirFicha(kb.deliveryConfirm!.id)}
                    abrindoFicha={abrindoFicha}
                />
            )}

            {fichaDoPedido && !semValores && (
                <FichaDeEntrega
                    order={fichaDoPedido.order}
                    client={fichaDoPedido.client}
                    onClose={() => setFichaDoPedido(null)}
                    onSaved={() => { setFichaDoPedido(null); setVersaoEntrega(v => v + 1); kb.reload(); }}
                />
            )}

            {baixa && (() => {
                const total = baixa.saldos.reduce((t, s) => t + s.total, 0);
                // Mesma conta do Controle parcial: as baixas antigas sem item também abatem o saldo.
                const resta = Math.max(0, total - baixa.saldos.reduce((t, s) => t + s.feito, 0) - baixa.semItem);
                return (
                    <BaixaModal
                        // Muda quando o saldo é relido após uma falha: a janela remonta com campos vazios.
                        key={baixa.saldos.map(x => `${x.chave}:${x.feito}:${x.expedido}`).join('|') + baixa.semItem}
                        titulo={total === 0 ? `#${baixa.order.order_number} · sem peças cadastradas` : `#${baixa.order.order_number} · resta ${resta} de ${total} pç`}
                        saldos={baixa.saldos} semItem={baixa.semItem} sectors={baixa.sectors} busy={gravandoBaixa} aviso={erroBaixa}
                        onConfirm={async (lancamentos: Lancamento[]) => {
                            setGravandoBaixa(true);
                            try {
                                for (const l of lancamentos) await storageService.logProduction({ order_id: baixa.order.id, ...l });
                                setBaixa(null);
                                setErroBaixa('');
                                kb.reload();
                            } catch (e) {
                                // Falhou no meio: o que já gravou entra no saldo e os campos zeram, senão "tentar de novo" lança em dobro.
                                let releu = false;
                                try {
                                    const logs = await storageService.getProductionLogs(baixa.order.id);
                                    setBaixa(b => b && { ...b, saldos: saldoPorItem(b.order.items || [], logs as any), semItem: feitoSemItem(logs as any) });
                                    releu = true;
                                } catch {
                                    // Sem saldo novo, os campos digitados lançariam em dobro: fecha a janela; reabrir relê.
                                    setBaixa(null);
                                }
                                kb.reload();
                                setErroBaixa(releu
                                    ? `Não consegui gravar toda a baixa do pedido #${baixa.order.order_number}. O saldo foi relido: confira antes de lançar de novo.`
                                    : `Não consegui gravar toda a baixa do pedido #${baixa.order.order_number} nem reler o saldo. Reabra a baixa para conferir antes de lançar de novo.`);
                                throw e;
                            } finally { setGravandoBaixa(false); }
                        }}
                        onClose={() => { setBaixa(null); setErroBaixa(''); }}
                    />
                );
            })()}

            {/* Pré-visualização do pedido, sem sair do quadro.
                `isFactoryMode` acompanha o chão de fábrica e o modo fábrica: ali o quadro
                vive num monitor à vista de quem passa — e o preview esconde os
                valores, que não são assunto de todos. */}
            {pedidoEspiado && (
                <OrderPreviewModal
                    order={pedidoEspiado.order}
                    client={pedidoEspiado.client}
                    isFactoryMode={semFinanceiro || full}
                    onClose={() => setPedidoEspiado(null)}
                />
            )}
        </div>
    );
    // Modo fábrica (TV): sai em portal para cobrir o menu lateral e o cabeçalho, que ficam em
    // outro contexto de empilhamento. As janelas abertas daqui também saem em portal, depois, por cima.
    return full ? createPortal(quadro, document.body) : quadro;
}

/**
 * Como cada nível de urgência pinta o cartão. Classes escritas por extenso
 * porque o Tailwind varre o código como TEXTO — `bg-${cor}-500/10` montado em
 * runtime simplesmente não gera CSS.
 */
const ESTILO_URGENCIA: Record<UrgenciaPedido, { caixa: string; data: string; etiqueta?: string; texto?: string }> = {
    atrasado: {
        caixa: 'bg-rose-500/10 border-rose-500/50',
        data: 'text-rose-400 font-bold',
        etiqueta: 'bg-rose-500 text-white',
        texto: 'Atrasado',
    },
    'entrega-semana': {
        caixa: 'bg-amber-500/10 border-amber-500/60',
        data: 'text-amber-400 font-bold',
        etiqueta: 'bg-amber-500 text-black',
        texto: 'Entrega esta semana',
    },
    'inicio-semana': {
        caixa: 'bg-sky-500/5 border-sky-500/40',
        data: 'text-zinc-500',
        etiqueta: 'bg-sky-500/20 text-sky-300',
        texto: 'Começa esta semana',
    },
    normal: {
        caixa: 'bg-zinc-950/60 border-zinc-800',
        data: 'text-zinc-600',
    },
};

function Legenda() {
    const itens: { urgencia: UrgenciaPedido; rotulo: string }[] = [
        { urgencia: 'atrasado', rotulo: 'Atrasado' },
        { urgencia: 'entrega-semana', rotulo: 'Entrega esta semana' },
        { urgencia: 'inicio-semana', rotulo: 'Começa esta semana' },
    ];
    return (
        <div className="flex items-center gap-3 flex-wrap">
            {itens.map(({ urgencia, rotulo }) => (
                <span key={urgencia} className={`flex items-center gap-2 ${ROTULO_PEQUENO}`}>
                    <span className={`w-2.5 h-2.5 rounded border ${ESTILO_URGENCIA[urgencia].caixa}`} />
                    {rotulo}
                </span>
            ))}
        </div>
    );
}

function Card({ card, canPrev, canNext, isLast, busy, full, arrastando, fantasma, destacado,
    onPrev, onNext, onDeliver, onEspiar, onBaixa, onIniciarArraste, onArrastar, onSoltar }: {
    card: KanbanCard; canPrev: boolean; canNext: boolean; isLast: boolean; busy: boolean; full: boolean;
    /** Este é o cartão sendo arrastado — fica esmaecido no lugar de origem. */
    arrastando?: boolean;
    /** Cópia que segue o cursor: sem botões, sem gestos. */
    fantasma?: boolean;
    /** Prazo estourado e o Início pediu para marcar. */
    destacado?: boolean;
    onPrev?: () => void; onNext?: () => void; onDeliver?: () => void;
    /** Abre o pedido inteiro sem sair do quadro. */
    onEspiar?: () => void;
    /** Abre a baixa parcial do pedido. */
    onBaixa?: () => void;
    onIniciarArraste?: (a: Omit<Arraste, 'setorOrigem'>) => void;
    onArrastar?: (x: number, y: number) => void;
    onSoltar?: () => void;
}) {
    // getTodayStr é data LOCAL — toISOString (UTC) marcaria atraso 3h antes no Brasil.
    const urgencia = urgenciaDoPedido(
        { deadline: card.deadline, inicioPlanejado: card.inicio_planejado },
        getTodayStr(),
    );
    const estilo = ESTILO_URGENCIA[urgencia];
    const btn = full ? 20 : 16;

    // Gesto pendente: guardado até passar da folga mínima. Antes disso ainda
    // pode ser um clique num botão do cartão.
    const gesto = useRef<{ x0: number; y0: number; offsetX: number; offsetY: number; largura: number; virouArraste: boolean } | null>(null);

    const aoPressionar = (e: React.PointerEvent) => {
        if (fantasma || busy) return;
        // Botões (setas, entregar) mandam mais que o arraste: clicar neles não
        // pode iniciar gesto nenhum.
        if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
        // No dedo, só o pegador arrasta. Se o cartão inteiro arrastasse, rolar a
        // página com o dedo em cima de um cartão — que é quase toda a área da
        // coluna — viraria arraste acidental. No mouse não existe esse conflito,
        // então lá vale o cartão todo.
        if (e.pointerType === 'touch' && !(e.target as HTMLElement).closest('[data-drag-handle]')) return;
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        gesto.current = {
            x0: e.clientX, y0: e.clientY,
            offsetX: e.clientX - r.left, offsetY: e.clientY - r.top,
            largura: r.width, virouArraste: false,
        };
    };

    const aoMover = (e: React.PointerEvent) => {
        const g = gesto.current;
        if (!g) return;
        if (!g.virouArraste) {
            if (!passouLimiteDeArraste(e.clientX - g.x0, e.clientY - g.y0)) return;
            g.virouArraste = true;
            onIniciarArraste?.({
                card, x: e.clientX, y: e.clientY,
                offsetX: g.offsetX, offsetY: g.offsetY, largura: g.largura,
            });
        }
        onArrastar?.(e.clientX, e.clientY);
    };

    const aoLevantar = (e: React.PointerEvent) => {
        const g = gesto.current;
        gesto.current = null;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* já liberado */ }
        if (g?.virouArraste) onSoltar?.();
    };

    return (
        <div
            data-kanban-card
            className={`border rounded-xl ${estilo.caixa} ${destacado ? 'ring-2 ring-rose-500/60' : ''} ${full ? 'p-4' : 'p-3'} ${
                fantasma ? '' : 'select-none cursor-grab active:cursor-grabbing'
            } ${arrastando ? 'opacity-30' : ''}`}
            onPointerDown={fantasma ? undefined : aoPressionar}
            onPointerMove={fantasma ? undefined : aoMover}
            onPointerUp={fantasma ? undefined : aoLevantar}
            onPointerCancel={fantasma ? undefined : aoLevantar}
        >
            <div className="flex items-center justify-between mb-0.5">
                <span className={`font-black text-white flex items-center gap-1 ${full ? 'text-lg' : 'text-xs'}`}>
                    {!fantasma && (
                        <span data-drag-handle title="Arraste para outro setor"
                            className={`touch-none shrink-0 -ml-1 text-zinc-600 hover:text-amber-500 cursor-grab active:cursor-grabbing ${full ? 'p-1.5' : 'p-0.5'}`}>
                            <GripVertical size={full ? 17 : 14} />
                        </span>
                    )}
                    #{card.order_number}
                </span>
                <span className={`font-mono text-zinc-500 ${full ? 'text-sm' : 'text-[10px]'}`}>{card.pieces} pç</span>
            </div>
            <p className={`text-zinc-300 font-bold truncate ${full ? 'text-base' : 'text-[11px]'}`}>{card.client_name || 'Cliente'}</p>
            {card.client_contact && <p className={`text-zinc-600 truncate ${full ? 'text-xs' : 'text-[9px]'}`}>{card.client_contact}</p>}

            {/* Aviso de produção iniciada. Fica no card porque é aqui que o
                pedido muda de setor — o momento em que a notícia existe. */}
            {!full && (
                <div className="mt-1.5">
                    {/* A frase acompanha o setor em que o card está: o cliente
                        não sabe o que é enfesto nem finalização, então cada
                        etapa tem seu texto em português de cliente. */}
                    <BotaoMensagem
                        compacto
                        titulo="Avisar andamento"
                        texto={msgAndamento(
                            { company_name: card.client_name, contact_person: card.client_contact },
                            { order_number: card.order_number, deadline: card.deadline },
                            card.stage,
                        )}
                    />
                </div>
            )}

            {estilo.texto && (
                <span className={`inline-block mt-1.5 px-1.5 py-0.5 rounded font-black uppercase tracking-widest ${estilo.etiqueta} ${full ? 'text-[10px]' : 'text-[8px]'}`}>
                    {estilo.texto}
                </span>
            )}

            {card.travado_ate && (
                <p className={`mt-1 flex items-start gap-1 text-amber-400/80 font-bold leading-snug ${full ? 'text-[11px]' : 'text-[9px]'}`}
                    title={card.motivo_atraso}>
                    <Lock size={12} className="shrink-0 mt-px" />
                    <span className="truncate">travado até {card.travado_ate.split('-').reverse().join('/')} · {card.motivo_atraso}</span>
                </p>
            )}

            <div className={`flex items-center justify-between ${full ? 'mt-3' : 'mt-1.5'}`}>
                <span className={`font-mono ${full ? 'text-sm' : 'text-[9px]'} ${estilo.data}`}>
                    {card.deadline ? card.deadline.split('-').reverse().join('/') : '—'}
                </span>
                {!fantasma && (
                    <div className={`flex items-center ${full ? 'gap-2' : 'gap-1'}`}>
                        {/* `data-no-drag` é o que impede o clique de virar
                            arraste: sem ele, pressionar o olho começaria um
                            gesto e o cartão sairia junto com o ponteiro. */}
                        <button data-no-drag onClick={onEspiar} title="Ver o pedido" aria-label="Ver o pedido"
                            className={`rounded-md bg-zinc-900 text-zinc-500 hover:text-sky-400 ${full ? 'p-2.5' : 'inline-flex h-8 w-8 items-center justify-center'}`}><Eye size={btn} /></button>
                        <button data-no-drag onClick={onBaixa} title="Baixa parcial" aria-label={`Baixa parcial do pedido #${card.order_number}`}
                            className={`rounded-md bg-zinc-900 text-zinc-500 hover:text-emerald-400 ${full ? 'p-2.5' : 'inline-flex h-8 w-8 items-center justify-center'}`}><ClipboardCheck size={btn} /></button>
                        <button data-no-drag onClick={onPrev} disabled={!canPrev || busy} title="Setor anterior" aria-label="Setor anterior"
                            className={`rounded-md bg-zinc-900 text-zinc-500 hover:text-white disabled:opacity-30 ${full ? 'p-2.5' : 'inline-flex h-8 w-8 items-center justify-center'}`}><ChevronLeft size={btn} /></button>
                        {isLast ? (
                            <button data-no-drag onClick={onDeliver} disabled={busy} title="Concluir e entregar" aria-label="Concluir e entregar"
                                className={`rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-30 ${full ? 'p-2.5' : 'inline-flex h-8 w-8 items-center justify-center'}`}><PackageCheck size={btn} /></button>
                        ) : (
                            <button data-no-drag onClick={onNext} disabled={!canNext || busy} title="Próximo setor" aria-label="Próximo setor"
                                className={`rounded-md bg-zinc-900 text-zinc-500 hover:text-amber-400 disabled:opacity-30 ${full ? 'p-2.5' : 'inline-flex h-8 w-8 items-center justify-center'}`}><ChevronRight size={btn} /></button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
