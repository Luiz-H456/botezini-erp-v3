import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { History, TrendingDown, TrendingUp, Users, Package, CheckCircle2, Clock, Building2 } from 'lucide-react';
import { formatCurrency } from '@/utils';
import { resumirProduto, posicaoNoHistorico, ROTULO_STATUS } from '@/utils/historicoDeProduto';
import type { VendaDoProduto, FaixaDeDesconto } from '@/utils/historicoDeProduto';
import type { Product } from '@/types';
import {
    Tile, MediaPorStatus, SugestaoOuMotivo, TabelaDoCadastro, BandaDePreco,
    referenciaDoProduto, dataCurta,
} from '@/components/common/HistoricoDePreco';

/**
 * Folga entre sair do badge e o balão fechar.
 *
 * Existe por causa do vão entre um e outro: sem a folga, atravessar esse vão já
 * conta como "saiu", e o balão fecharia na cara de quem estava indo até ele.
 */
const FOLGA_PARA_FECHAR_MS = 180;

/**
 * Quanto o ponteiro precisa ficar parado sobre o badge para o balão abrir.
 *
 * Mesma espera do "i" de ajuda, pela mesma razão e num lugar pior: o badge fica
 * embaixo de CADA linha de produto, então descer o mouse pela tabela abria um
 * balão de 620px atrás do outro, cobrindo justamente as linhas que se estava
 * indo ler. Um segundo separa "passei por aqui" de "quero consultar isto".
 */
const ESPERA_PARA_ABRIR_MS = 1000;

/**
 * O balão é largo e baixo, não estreito e comprido.
 *
 * A primeira versão tinha 380px e empilhava tudo numa coluna: passava de 600px
 * de altura e escapava da tela. Duas colunas cabem no monitor onde o sistema é
 * usado (24"–29") e derrubam a altura pela metade — e a altura é o que faltava,
 * porque a tabela de itens fica no meio vertical da janela.
 */
const LARGURA_IDEAL = 620;
const LARGURA_MINIMA = 320;
/** Abaixo disto o balão não cabe em duas colunas sem espremer. */
const LARGURA_PARA_DUAS_COLUNAS = 520;
const MARGEM_DA_JANELA = 12;
/** Espaço mínimo que vale a pena ocupar antes de tentar o outro lado. */
const ALTURA_MINIMA_UTIL = 260;

/**
 * Quantos orçamentos listar no rodapé.
 *
 * Com 24 no histórico a lista sozinha passava de 600px e o balão virava uma
 * segunda tela. Os recentes são os que informam preço; o histórico completo tem
 * lugar próprio em Itens Vendidos.
 */
const ORCAMENTOS_LISTADOS = 10;

interface Props {
    /** Já filtradas para este produto e ordenadas (ver historicoPorProduto). */
    vendas: VendaDoProduto[];
    /** Preço digitado na linha — só para dizer onde ele cai na faixa. */
    precoAtual?: number;
    /** O cadastro do produto, para confrontar T1/T2/T3 com o praticado. */
    produto?: Product;
    /** Curva de desconto da casa — montada uma vez por quem desenha a tabela. */
    curva?: FaixaDeDesconto[] | null;
    /**
     * Recorte do histórico. 'casa' é tudo que já foi orçado deste produto;
     * 'grupo' é só o que foi orçado dentro do grupo econômico do cliente.
     *
     * O recorte do grupo existe porque é o número que o comprador tem em mãos:
     * numa negociação com uma filial, o preço que pesa é o que as OUTRAS
     * filiais pagaram — não a média da casa, que mistura clientes sem relação.
     */
    escopo?: 'casa' | 'grupo';
    /** Nome do grupo, para o balão dizer de quem é o histórico. */
    nomeDoGrupo?: string;
    /** Com ela, o balão oferece "Usar R$ X" na sugestão — a decisão continua sendo de quem clica. */
    onUsarPreco?: (preco: number) => void;
}

interface Posicao {
    top: number;
    left: number;
    largura: number;
    alturaMaxima: number;
}

/**
 * Faixa de preço já praticada no produto, ao pé do campo de seleção.
 *
 * Fechada mostra só o essencial — de quanto a quanto —, porque é o que se
 * consulta de relance no meio de uma linha de orçamento. O resto (sugestão,
 * tabela do cadastro, fechado vs. em aberto, preço por cor, para quem e quando)
 * aparece no balão, que é navegável com o mouse.
 *
 * Nada aqui altera o preço da linha: é retrovisor, não piloto automático.
 */
const HistoricoProdutoBadge: React.FC<Props> = ({
    vendas, precoAtual, produto, curva, escopo = 'casa', nomeDoGrupo, onUsarPreco,
}) => {
    const doGrupo = escopo === 'grupo';
    const [aberto, setAberto] = useState(false);
    const [aguardando, setAguardando] = useState(false);
    const esperaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [pos, setPos] = useState<Posicao | null>(null);
    const ancoraRef = useRef<HTMLButtonElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resumo = useMemo(() => resumirProduto(vendas), [vendas]);
    const referencia = useMemo(() => referenciaDoProduto(produto), [produto]);
    const posicao = posicaoNoHistorico(Number(precoAtual) || 0, resumo);

    const temTabela = !!produto && (
        (Number(produto.price_tier1) || 0) > 0
        || (Number(produto.price_tier2) || 0) > 0
        || (Number(produto.price_tier3) || 0) > 0
        || !!produto.price_notes
    );

    const cancelarEspera = useCallback(() => {
        if (esperaRef.current) { clearTimeout(esperaRef.current); esperaRef.current = null; }
        setAguardando(false);
    }, []);

    /** Abre na hora — usado pelo clique e pelo fim da espera. */
    const manterAberto = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        cancelarEspera();
        setAberto(true);
    }, [cancelarEspera]);

    /**
     * Entrar no badge só AGENDA a abertura. Voltar para um balão já aberto
     * (atravessando o vão entre ele e o badge) cancela o fechamento na hora,
     * sem esperar de novo — quem já está lendo não deve ser feito esperar.
     */
    const aoEntrar = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (aberto || esperaRef.current) return;
        setAguardando(true);
        esperaRef.current = setTimeout(() => {
            esperaRef.current = null;
            setAguardando(false);
            setAberto(true);
        }, ESPERA_PARA_ABRIR_MS);
    }, [aberto]);

    const agendarFechamento = useCallback(() => {
        cancelarEspera();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setAberto(false), FOLGA_PARA_FECHAR_MS);
    }, [cancelarEspera]);

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (esperaRef.current) clearTimeout(esperaRef.current);
    }, []);

    /**
     * Escolhe o lado com mais espaço e limita a altura ao que existe ali.
     *
     * A versão anterior chutava uma altura fixa para decidir o lado e não
     * limitava nada — quando o conteúdo passava do chute, o balão simplesmente
     * saía da tela. Aqui o espaço disponível é medido e vira `max-height`: a
     * caixa nunca é maior que o lugar onde está.
     */
    const posicionar = useCallback(() => {
        const el = ancoraRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();

        const largura = Math.max(
            LARGURA_MINIMA,
            Math.min(LARGURA_IDEAL, window.innerWidth - MARGEM_DA_JANELA * 2),
        );
        const abaixo = window.innerHeight - r.bottom - MARGEM_DA_JANELA * 2;
        const acima = r.top - MARGEM_DA_JANELA * 2;
        const paraCima = abaixo < ALTURA_MINIMA_UTIL && acima > abaixo;
        const alturaMaxima = Math.max(ALTURA_MINIMA_UTIL, paraCima ? acima : abaixo);

        setPos({
            largura,
            alturaMaxima,
            // Alinha pela direita do campo quando abrir pela esquerda estouraria
            // a janela — nas últimas colunas da tabela é o que acontece.
            left: Math.max(MARGEM_DA_JANELA, Math.min(r.left, window.innerWidth - largura - MARGEM_DA_JANELA)),
            top: paraCima
                ? Math.max(MARGEM_DA_JANELA, r.top - 6 - alturaMaxima)
                : r.bottom + 6,
        });
    }, []);

    // O balão vive em portal com position: fixed, então precisa acompanhar a
    // rolagem — inclusive a de containers internos, que não borbulha (capture).
    useEffect(() => {
        if (!aberto) return;
        posicionar();
        window.addEventListener('scroll', posicionar, true);
        window.addEventListener('resize', posicionar);
        return () => {
            window.removeEventListener('scroll', posicionar, true);
            window.removeEventListener('resize', posicionar);
        };
    }, [aberto, posicionar]);

    // Sem histórico o badge some, mas a tabela do cadastro ainda vale a pena
    // mostrar: é exatamente no produto novo que ninguém lembra qual é o T2.
    if (!resumo && !temTabela) return null;

    const faixaIgual = !!resumo && resumo.menor === resumo.maior;
    // O badge do grupo é azul sempre: a cor é o que diz, de relance, que aquele
    // preço é de dentro da casa do cliente e não a média geral. Deixá-lo mudar
    // de cor conforme a posição o faria se confundir com o badge da casa.
    const corDaPosicao = doGrupo
        ? 'text-sky-300 border-sky-500/40 bg-sky-950/30 hover:border-sky-400/60'
        : posicao === 'abaixo' ? 'text-rose-400 border-rose-500/30 bg-rose-950/20'
            : posicao === 'acima' ? 'text-sky-400 border-sky-500/30 bg-sky-950/20'
                : 'text-amber-500/90 border-zinc-800 bg-zinc-950/60';

    const duasColunas = (pos?.largura || 0) >= LARGURA_PARA_DUAS_COLUNAS;

    return (
        <>
            <button
                ref={ancoraRef}
                type="button"
                onMouseEnter={aoEntrar}
                onMouseLeave={agendarFechamento}
                onFocus={aoEntrar}
                onBlur={agendarFechamento}
                // Clique abre NA HORA: quem clicou já declarou a intenção, e
                // fazê-lo esperar seria punir o gesto mais explícito. É também
                // o único caminho no toque, onde hover não existe.
                onClick={(e) => { e.preventDefault(); aberto ? setAberto(false) : manterAberto(); }}
                className={`relative overflow-hidden mt-1 flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${doGrupo ? '' : 'hover:border-amber-500/40'} ${corDaPosicao}`}
                title={doGrupo
                    ? `Preço já praticado neste produto dentro do grupo${nomeDoGrupo ? ` ${nomeDoGrupo}` : ''} — segure o mouse para ver`
                    : 'Faixa já praticada neste produto — segure o mouse para ver o histórico'}
            >
                {doGrupo
                    ? <Building2 size={12} className="shrink-0" />
                    : <History size={12} className="shrink-0" />}
                <span className="font-mono tracking-tight truncate">
                    {!resumo
                        ? (doGrupo ? 'Grupo sem histórico' : 'Sem histórico')
                        : faixaIgual
                            ? formatCurrency(resumo.menor)
                            : `${formatCurrency(resumo.menor)} – ${formatCurrency(resumo.maior)}`}
                </span>
                {resumo && <span className={`ml-auto shrink-0 ${doGrupo ? 'text-sky-500/70' : 'text-zinc-600'}`}>{resumo.ocorrencias}×</span>}
                {!doGrupo && posicao === 'abaixo' && <TrendingDown size={12} className="shrink-0" />}
                {!doGrupo && posicao === 'acima' && <TrendingUp size={12} className="shrink-0" />}

                {/* Barra de espera. O anel do "i" de ajuda não cabe aqui — o
                    badge é largo e baixo —, mas o retorno visual é igualmente
                    necessário: sem ele o segundo de espera parece o balão
                    quebrado, e a pessoa desiste antes de ele abrir. */}
                {aguardando && (
                    <span
                        className={`absolute bottom-0 left-0 h-[2px] w-full origin-left ${doGrupo ? 'bg-sky-400' : 'bg-amber-500'}`}
                        style={{ animation: `preencher-barra ${ESPERA_PARA_ABRIR_MS}ms linear forwards` }}
                    />
                )}
            </button>

            {aberto && pos && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        left: pos.left,
                        width: pos.largura,
                        maxHeight: pos.alturaMaxima,
                        zIndex: 'var(--z-index-balao)' as unknown as number,
                    }}
                    onMouseEnter={manterAberto}
                    onMouseLeave={agendarFechamento}
                    // Uma área de rolagem só, na caixa inteira: listas com rolagem
                    // própria dentro de um balão que também rola deixam o mouse
                    // sem saber o que vai andar.
                    className="bg-zinc-950/95 border border-zinc-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-2xl overflow-y-auto custom-scrollbar ease-out animate-in fade-in zoom-in-95 duration-150"
                >
                    <div className="px-4 py-2.5 border-b border-zinc-800/70 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur-2xl z-10">
                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${doGrupo ? 'text-sky-400' : 'text-zinc-500'}`}>
                            {doGrupo
                                ? `Este produto no grupo${nomeDoGrupo ? ` · ${nomeDoGrupo}` : ''}`
                                : 'Histórico deste produto'}
                        </p>
                        {resumo && (
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                                {resumo.ocorrencias} orçado{resumo.ocorrencias > 1 ? 's' : ''} · {resumo.fechados} fechado{resumo.fechados === 1 ? '' : 's'}
                            </p>
                        )}
                    </div>

                    {/* A tabela do cadastro vem primeiro: é a decisão registrada.
                        O histórico embaixo diz se ela está sendo seguida. */}
                    {temTabela && (
                        <div className="border-b border-zinc-800/70">
                            <TabelaDoCadastro produto={produto!} precoAtual={precoAtual} compacto />
                        </div>
                    )}

                    {!resumo ? (
                        <p className="px-4 py-4 text-[10px] text-zinc-600 leading-snug">
                            {doGrupo
                                ? 'Nenhuma empresa deste grupo orçou este produto ainda — não há preço interno para comparar.'
                                : 'Este produto ainda não foi orçado com preço — não há faixa praticada para comparar.'}
                        </p>
                    ) : (
                        <>
                            <div className={duasColunas ? 'grid grid-cols-2 divide-x divide-zinc-800/70' : ''}>
                                {/* ── Coluna 1: o que fazer ── */}
                                <div className="min-w-0">
                                    <SugestaoOuMotivo vendas={vendas} curva={curva} referencia={referencia} onUsarPreco={onUsarPreco} />
                                    <div className="border-t border-zinc-800/70">
                                        <BandaDePreco vendas={vendas} lista={referencia.lista} />
                                    </div>
                                </div>

                                {/* ── Coluna 2: o que aconteceu ── */}
                                <div className="min-w-0 border-t border-zinc-800/70 md:border-t-0">
                                    <div className="grid grid-cols-3 divide-x divide-zinc-800/70 border-b border-zinc-800/70">
                                        <Tile rotulo="Menor" valor={formatCurrency(resumo.menor)} />
                                        <Tile rotulo="Médio" valor={formatCurrency(resumo.medio)} destaque />
                                        <Tile rotulo="Maior" valor={formatCurrency(resumo.maior)} />
                                    </div>

                                    <div className="grid grid-cols-2 divide-x divide-zinc-800/70 border-b border-zinc-800/70">
                                        <MediaPorStatus icone={CheckCircle2} rotulo="Fechado"
                                            valor={resumo.medioFechado} contagem={resumo.fechados}
                                            vazio="nada fechado" cor="text-emerald-400" />
                                        <MediaPorStatus icone={Clock} rotulo="Em aberto"
                                            valor={resumo.medioAberto} contagem={resumo.abertos}
                                            vazio="nada em aberto" cor="text-zinc-300" />
                                    </div>

                                    <div className="px-4 py-2 border-b border-zinc-800/70 flex items-center gap-3 text-[10px] font-bold text-zinc-500">
                                        <span className="flex items-center gap-1"><Package size={12} className="text-zinc-600" />{resumo.quantidadeTotal.toLocaleString('pt-BR')} pçs</span>
                                        <span className="flex items-center gap-1"><Users size={12} className="text-zinc-600" />{resumo.clientes} cliente{resumo.clientes > 1 ? 's' : ''}</span>
                                        <span className="ml-auto text-zinc-600">mediana {formatCurrency(resumo.mediana)}</span>
                                    </div>

                                    {resumo.cores.length > 0 && (
                                        <div className="px-4 py-2 border-b border-zinc-800/70">
                                            <p className="text-[7px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">Médio por cor</p>
                                            {resumo.cores.map(c => (
                                                <div key={c.cor} className="flex items-center gap-2 py-0.5">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 truncate flex-1 min-w-0">{c.cor}</span>
                                                    <span className="text-[10px] font-bold text-zinc-600 shrink-0">{c.quantidade.toLocaleString('pt-BR')} pçs</span>
                                                    <span className="text-[10px] font-mono font-black text-amber-500/90 shrink-0 w-[62px] text-right">
                                                        {formatCurrency(c.valorMedio)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── Rodapé de largura inteira: as orçadas, uma por linha ── */}
                            <div className="border-t border-zinc-800/70">
                                <p className="px-4 pt-2 pb-1 text-[7px] font-black text-zinc-600 uppercase tracking-[0.2em] flex items-center justify-between">
                                    <span>
                                        {resumo.vendas.length > ORCAMENTOS_LISTADOS
                                            ? `${ORCAMENTOS_LISTADOS} orçamentos mais recentes`
                                            : 'Orçamentos'} · bolinha verde fechou
                                    </span>
                                    {resumo.vendas.length > ORCAMENTOS_LISTADOS && (
                                        <span className="text-zinc-700">+{resumo.vendas.length - ORCAMENTOS_LISTADOS} mais antigos</span>
                                    )}
                                </p>
                                <div className="divide-y divide-zinc-800/50">
                                    {resumo.vendas.slice(0, ORCAMENTOS_LISTADOS).map((v, i) => (
                                        <div key={`${v.orcamentoId}-${i}`} className="px-4 py-1.5 flex items-center gap-2">
                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.fechado ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                                title={ROTULO_STATUS[v.status] || v.status} />
                                            <span className="text-[10px] font-mono text-zinc-500 shrink-0 w-[52px]">{dataCurta(v.data)}</span>
                                            <span className="text-[10px] font-bold text-zinc-300 truncate flex-1 min-w-0">{v.cliente}</span>
                                            <span className="text-[10px] text-zinc-600 uppercase tracking-widest truncate shrink-0 max-w-[140px]">
                                                {v.quantidade.toLocaleString('pt-BR')} pçs{v.cor ? ` · ${v.cor}` : ''}{v.tamanho ? ` · ${v.tamanho}` : ''}
                                            </span>
                                            <span className="text-[10px] font-mono font-black text-amber-500 shrink-0 w-[68px] text-right">{formatCurrency(v.valorUnit)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>,
                document.body,
            )}
        </>
    );
};

export default HistoricoProdutoBadge;
