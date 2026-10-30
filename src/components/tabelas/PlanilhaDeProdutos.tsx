import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, ExternalLink, Plus, Search, Shirt } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import SearchableSelect from '@/components/common/SearchableSelect';
import { MenuMais } from '@/components/common/MenuMais';
import { storageService } from '@/services/storage';
import { useInsumos } from '@/hooks/useInventoryQueries';
import { useCustoDeReferencia } from '@/hooks/useTabelaVerdade';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { useToast } from '@/hooks/useToast';
import { custoDaPeca, margemDoPreco, descreverFaltas } from '@/utils/custoDaPeca';
import {
    ehTecido, gravacoesDoConsumo, situacaoDaFicha, trazerDaFicha, ROTULO_DA_SITUACAO, type LinhaDaFicha,
} from '@/utils/fabrica/planilhaDeProdutos';
import { parseBRL } from '@/utils/currency';
import { mensagemDeErro } from '@/utils/errorHandling';
import type { CompanyProfile, Insumo, Product } from '@/types';
import { CARTAO, CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, pilula } from '@/components/finance/ui/estilo';
import { NovoProdutoRapido } from './NovoProdutoRapido';

const fmt = (v: number | null | undefined, casas = 2) => (Number(v) > 0 ? Number(v).toFixed(casas).replace('.', ',') : '');
const PRECOS = ['price_tier1', 'price_tier2', 'price_tier3'] as const;

/**
 * Planilha de produtos (Tabelas de custo, parte C de 30/10): os valores padrão de cada produto numa
 * linha — tecido, consumo, três preços — e o custo da peça calculado do mesmo jeito que o orçamento
 * mostra. Cada célula grava ao sair dela, só o campo dela. Tecido e consumo gravam produto e ficha
 * juntos (planilhaDeProdutos.ts): estoque zero faz da ficha a lista de compras de todo pedido.
 */
export function PlanilhaDeProdutos({ companyProfile, onAbrirProduto }: {
    companyProfile?: CompanyProfile | null;
    onAbrirProduto?: (id: string) => void;
}) {
    const [produtos, setProdutos] = useState<Product[] | null>(null);
    const [fichas, setFichas] = useState<Map<string, LinhaDaFicha[]>>(new Map());
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');
    const [soPendentes, setSoPendentes] = useState(false);
    const [criando, setCriando] = useState<{ base: Product | null } | null>(null);
    const { data: insumos = [] } = useInsumos();
    const referencia = useCustoDeReferencia();
    const { mostrar } = useMostrarValor();
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    const carregar = useCallback(async () => {
        try {
            const todos = (await storageService.getProducts()).filter(p => !p.canonical_product_id);
            const f = await storageService.getProductInsumosByProducts(todos.map(p => p.id), { estrito: true });
            setFichas(new Map([...f].map(([k, v]) => [k, v.map(l => ({ id: l.id, insumo_id: l.insumo_id, quantity: Number(l.quantity) }))])));
            setProdutos(todos.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
            setErro('');
        } catch (e) {
            setErro(mensagemDeErro(e, 'Não consegui ler os produtos e as fichas.'));
        }
    }, []);
    useEffect(() => { void carregar(); }, [carregar]);

    const porId = useMemo(() => new Map((insumos as Insumo[]).map(i => [i.id, i])), [insumos]);
    const tecidos = useMemo(() => (insumos as Insumo[]).filter(ehTecido).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [insumos]);

    const linhas = useMemo(() => (produtos ?? []).map(p => {
        const ficha = fichas.get(p.id) ?? [];
        const tec = p.default_fabric_insumo_id ? porId.get(p.default_fabric_insumo_id) : undefined;
        const custo = custoDaPeca({
            consumoM: p.fabric_consumption_m,
            tecido: tec ? { ...tec, custo_referencia: referencia.get(tec.id) ?? null } : null,
            overheadPercent: p.overhead_percent,
            operarios: p.labor_workers,
            pecasPorDia: p.pieces_daily_capacity,
            custoHora: p.labor_hourly_rate || companyProfile?.labor_cost_per_hour,
            aliquota: (companyProfile?.default_tax_rate || 0) / 100,
        });
        const situacao = situacaoDaFicha(p, ficha, porId);
        // Pendência é o que muda a compra ou cega o custo; mão de obra faltando não entra (vira ≥ no custo).
        return { p, ficha, custo, situacao, pendente: situacao !== 'ok' };
    }), [produtos, fichas, porId, referencia, companyProfile]);

    const termo = busca.trim().toLowerCase();
    const visiveis = linhas.filter(l => (!soPendentes || l.pendente) && (!termo || l.p.name.toLowerCase().includes(termo) || (l.p.sku ?? '').toLowerCase().includes(termo)));
    const pendentes = linhas.filter(l => l.pendente).length;

    const depois = (msg: string, tipo: 'success' | 'error' = 'success') => {
        showToast(msg, tipo);
        queryClient.invalidateQueries({ queryKey: ['products'] });
        void carregar();
    };

    const gravarTecido = async (p: Product, ficha: LinhaDaFicha[], tecidoId: string, consumoTexto?: string) => {
        const consumo = consumoTexto === undefined ? Number(p.fabric_consumption_m) || 0 : parseBRL(consumoTexto);
        if (consumo === (Number(p.fabric_consumption_m) || 0) && tecidoId === (p.default_fabric_insumo_id ?? '')) return;
        try {
            if (!tecidoId || !(consumo > 0)) {
                // Sem o par completo, a ficha não muda: só guarda o que foi informado no produto.
                await storageService.atualizarValoresDoProduto(p.id, { default_fabric_insumo_id: tecidoId || null, fabric_consumption_m: consumo > 0 ? consumo : null });
                depois(tecidoId ? 'Tecido guardado. Informe o consumo para ele entrar na ficha.' : 'Consumo guardado. Escolha o tecido para ele entrar na ficha.');
                return;
            }
            const g = gravacoesDoConsumo(ficha, porId, { tecidoId, consumo });
            await storageService.atualizarValoresDoProduto(p.id, g.produto);
            await storageService.saveProductInsumo({ ...g.ficha, product_id: p.id });
            queryClient.invalidateQueries({ queryKey: ['inventory_product_insumos', p.id] });
            depois(`${p.name}: tecido e consumo gravados no produto e na ficha.`);
        } catch (e) {
            showToast(mensagemDeErro(e, 'Não consegui gravar o tecido.'), 'error');
            void carregar();
        }
    };

    const alinhar = async (p: Product, ficha: LinhaDaFicha[]) => {
        const patch = trazerDaFicha(ficha, porId);
        if (!patch) return;
        try {
            await storageService.atualizarValoresDoProduto(p.id, patch);
            depois(`${p.name}: custo da peça agora lê o tecido e o consumo da ficha.`);
        } catch (e) {
            showToast(mensagemDeErro(e, 'Não consegui alinhar com a ficha.'), 'error');
        }
    };

    const gravarPreco = async (p: Product, campo: typeof PRECOS[number], texto: string) => {
        const v = parseBRL(texto) || 0;
        if (Math.abs(v - (Number(p[campo]) || 0)) < 0.005) return;
        try {
            await storageService.atualizarValoresDoProduto(p.id, { [campo]: v });
            depois(`${p.name}: preço gravado.`);
        } catch (e) {
            showToast(mensagemDeErro(e, 'Não consegui gravar o preço.'), 'error');
        }
    };

    if (erro) return <p className={`${CARTAO} p-4 text-sm text-rose-300`}>{erro}</p>;
    if (!produtos) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>;

    return (
        <div className="space-y-4">
            <div className={`${CARTAO} flex flex-wrap justify-between items-center gap-3 p-4`}>
                <div className="min-w-0">
                    <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <Shirt className="text-amber-500" size={20} /> Produtos e valores padrão
                    </h2>
                    <p className={`${ROTULO_PEQUENO} mt-1`}>Tecido e consumo viram a ficha: é dela que sai a compra de cada pedido.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <input type="text" aria-label="Buscar produto" placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} className={`${CAMPO} pl-10 w-64 max-w-full`} />
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>
                    <button type="button" onClick={() => setCriando({ base: null })} className={BOTAO_PRINCIPAL}><Plus size={14} /> Novo produto</button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => setSoPendentes(false)} className={pilula(!soPendentes)}>Todos <span className="opacity-60">{linhas.length}</span></button>
                <button type="button" onClick={() => setSoPendentes(true)} disabled={pendentes === 0} aria-pressed={soPendentes}
                    className={`${pilula(soPendentes)} ${!soPendentes && pendentes > 0 ? 'text-rose-400!' : ''}`}>
                    Ficha com pendência <span className="opacity-60">{pendentes}</span>
                </button>
            </div>

            <div className={`${CARTAO} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className={`border-b border-zinc-800 bg-zinc-950/50 ${ROTULO_PEQUENO}`}>
                                <th className="p-3 min-w-56">Produto</th>
                                <th className="p-3 min-w-56">Tecido</th>
                                <th className="p-3 text-right">Consumo m/peça</th>
                                <th className="p-3 text-right">Custo da peça</th>
                                <th className="p-3 text-right">Preço 1</th>
                                <th className="p-3 text-right">Preço 2</th>
                                <th className="p-3 text-right">Preço 3</th>
                                <th className="p-3 text-right">Margem 1</th>
                                <th className="p-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {visiveis.length === 0 && (
                                <tr><td colSpan={9} className="p-12 text-center text-zinc-500">
                                    {produtos.length === 0 ? 'Nenhum produto ainda: comece por “Novo produto”.' : soPendentes ? 'Nenhum produto com pendência.' : 'Nenhum produto para essa busca.'}
                                </td></tr>
                            )}
                            {visiveis.map(({ p, ficha, custo, situacao }) => {
                                const margem = margemDoPreco(p.price_tier1, custo);
                                return (
                                    <tr key={p.id} className="align-middle">
                                        <td className="p-3">
                                            <p className="font-bold text-zinc-100 text-xs uppercase tracking-wide">{p.name}</p>
                                            {situacao !== 'ok' && (
                                                <p className="mt-0.5 text-[10px] font-bold text-amber-400 flex flex-wrap items-center gap-1"><AlertTriangle size={11} /> {ROTULO_DA_SITUACAO[situacao]}
                                                    {(situacao === 'tecido-so-na-ficha' || situacao === 'consumo-diferente') && (
                                                        <button type="button" onClick={() => void alinhar(p, ficha)} className="underline font-black text-amber-300 min-h-8 px-1">Trazer da ficha</button>
                                                    )}
                                                </p>
                                            )}
                                        </td>
                                        <td className="p-2">
                                            <SearchableSelect value={p.default_fabric_insumo_id ?? ''} placeholder="— Sem tecido —"
                                                onChange={v => void gravarTecido(p, ficha, v)}
                                                options={[{ value: '', label: '— Sem tecido —' }, ...tecidos.map(t => ({ value: t.id, label: t.name }))]} />
                                        </td>
                                        <td className="p-2 text-right">
                                            <input key={`c-${p.id}-${p.fabric_consumption_m ?? ''}`} inputMode="decimal" aria-label={`Consumo de ${p.name}`}
                                                className={`${CAMPO} w-24 text-right`} defaultValue={fmt(p.fabric_consumption_m, 3)} placeholder="0,000"
                                                onBlur={e => void gravarTecido(p, ficha, p.default_fabric_insumo_id ?? '', e.target.value)} />
                                        </td>
                                        <td className="p-3 text-right whitespace-nowrap" title={custo.completo ? undefined : `Falta: ${descreverFaltas(custo.faltas)}. O número é o piso.`}>
                                            {custo.temAlgo ? <span className="font-mono text-zinc-200">{custo.completo ? '' : '≥ '}{mostrar(custo.producao)}</span> : <span className="text-[11px] text-zinc-500">sem custo</span>}
                                        </td>
                                        {PRECOS.map(campo => (
                                            <td key={campo} className="p-2 text-right">
                                                <input key={`${campo}-${p.id}-${p[campo] ?? ''}`} inputMode="decimal" aria-label={`${campo.replace('price_tier', 'Preço ')} de ${p.name}`}
                                                    className={`${CAMPO} w-24 text-right`} defaultValue={fmt(p[campo])} placeholder="0,00"
                                                    onBlur={e => void gravarPreco(p, campo, e.target.value)} />
                                            </td>
                                        ))}
                                        <td className={`p-3 text-right font-mono whitespace-nowrap ${margem === null ? 'text-zinc-600' : margem < 0 ? 'text-rose-400' : 'text-emerald-400'}`}
                                            title={margem !== null && !custo.completo ? 'Custo incompleto: a margem real é menor' : undefined}>
                                            {margem === null ? '—' : `${(margem * 100).toFixed(0)}%${custo.completo ? '' : '*'}`}
                                        </td>
                                        <td className="p-2">
                                            <MenuMais rotulo={`Mais ações de ${p.name}`} itens={[
                                                { rotulo: 'Duplicar como novo produto', onClick: () => setCriando({ base: p }) },
                                                ...(onAbrirProduto ? [{ rotulo: 'Abrir cadastro e ficha', onClick: () => onAbrirProduto(p.id) }] : []),
                                            ]} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <p className="text-[10px] text-zinc-600 flex items-center gap-3 flex-wrap">
                <span>≥ e * : custo incompleto (falta tecido com preço, consumo ou mão de obra) — o número é o piso.</span>
                <span className="inline-flex items-center gap-1"><Copy size={11} /> “Duplicar” cria um parecido, com os aviamentos da ficha.</span>
                {onAbrirProduto && <span className="inline-flex items-center gap-1"><ExternalLink size={11} /> Aviamentos e calculadora ficam no cadastro.</span>}
            </p>

            {criando && (
                <NovoProdutoRapido base={criando.base} fichaDaBase={criando.base ? fichas.get(criando.base.id) : undefined} tecidos={tecidos}
                    onClose={() => setCriando(null)}
                    onCriou={(novo, aviso) => { setCriando(null); depois(aviso ?? `${novo.name} criado.`, aviso ? 'error' : 'success'); }} />
            )}
        </div>
    );
}
