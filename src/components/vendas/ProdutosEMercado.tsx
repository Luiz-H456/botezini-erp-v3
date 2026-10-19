import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { storageService } from '@/services/storage';
import { QuandoCouber } from '@/components/common/QuandoCouber';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { CARTAO, ITEM, ROTULO, ROTULO_PEQUENO } from '@/components/finance/ui/estilo';
import { analiseDeProdutos, type PedidoParaAnalise } from '@/utils/vendas/produtos';

type Dados = {
    pedidos: PedidoParaAnalise[];
    produtos: { id: string; name: string }[];
    clientes: { id: string; company_name: string }[];
};

/** Campeões de volume, produtos parados e maiores clientes (ex-aba "Produtos" do Painel). */
export function ProdutosEMercado() {
    const { mostrar } = useMostrarValor();
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState('');

    useEffect(() => {
        let vivo = true;
        Promise.all([storageService.getOrders(), storageService.getProducts(), storageService.getClients()])
            .then(([pedidos, produtos, clientes]) => { if (vivo) setDados({ pedidos, produtos, clientes }); })
            .catch(e => { if (vivo) setErro(`Não consegui carregar os pedidos: ${e instanceof Error ? e.message : 'erro desconhecido'}.`); });
        return () => { vivo = false; };
    }, []);

    const a = useMemo(() => (dados ? analiseDeProdutos(dados) : null), [dados]);
    // Erro não vira "Nenhum pedido ainda": lista vazia e leitura que falhou são coisas diferentes.
    if (erro) return <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erro}</p>;
    if (!a) return <p className={ROTULO}>Carregando…</p>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 min-w-0">
            <p className={`${ROTULO_PEQUENO} lg:col-span-3`}>todos os pedidos, sem filtros</p>
            <div className="lg:col-span-2 min-w-0 space-y-3">
                <div className={`${CARTAO} min-w-0 p-5`}>
                    <h3 className={ROTULO}>Campeões de venda (volume)</h3>
                    <p className="text-[10px] text-zinc-600 font-bold mt-0.5 mb-3">
                        Volume por peça. Para valor, cor, tecido e variação de preço, use as outras abas.
                    </p>
                    <QuandoCouber className="w-full min-w-0 overflow-hidden" style={{ height: Math.max(200, a.topProdutos.length * 34) }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={a.topProdutos} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal vertical={false} />
                                <XAxis type="number" stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} />
                                <YAxis dataKey="nome" type="category" stroke="#a1a1aa" fontSize={10} width={170}
                                    axisLine={false} tickLine={false}
                                    tickFormatter={(t: string) => (t && t.length > 26 ? t.slice(0, 25) + '…' : t)} />
                                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', fontSize: '12px' }} />
                                <Bar dataKey="qtd" fill="#f59e0b" barSize={20} radius={[0, 4, 4, 0]} name="Quantidade" />
                            </BarChart>
                        </ResponsiveContainer>
                    </QuandoCouber>
                </div>

                <div className={`${CARTAO} p-5`}>
                    <h3 className={`${ROTULO} mb-3`}>Principais clientes (receita)</h3>
                    <div className="space-y-2">
                        {a.topClientes.map((c, i) => (
                            <div key={c.id} className={`${ITEM} flex items-center justify-between gap-3 p-3`}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-8 h-8 shrink-0 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">#{i + 1}</span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-zinc-200 truncate">{c.nome}</p>
                                        <p className="text-[10px] text-zinc-500">{c.pedidos} pedidos realizados</p>
                                    </div>
                                </div>
                                <span className="text-sm font-mono font-bold text-emerald-400 whitespace-nowrap">{mostrar(c.receita)}</span>
                            </div>
                        ))}
                        {a.topClientes.length === 0 && <span className="text-xs text-zinc-500 italic">Nenhum pedido ainda.</span>}
                    </div>
                </div>
            </div>

            <div className={`${CARTAO} p-5 h-fit`}>
                <h3 className={ROTULO}>Atenção: baixo volume</h3>
                <p className="text-xs text-zinc-400 mt-2 mb-4 leading-relaxed">
                    Produtos parados ou com baixa procura. Considere promoções.
                </p>
                <div className="space-y-2">
                    {a.parados.map(p => (
                        <div key={p.id} className={`${ITEM} flex justify-between items-center gap-3 text-xs p-3`}>
                            <span className="text-zinc-300 font-medium">{p.nome}</span>
                            <span className="font-bold text-amber-400 whitespace-nowrap">{p.qtd} un</span>
                        </div>
                    ))}
                    {a.parados.length === 0 && <span className="text-xs text-zinc-500 italic">Nenhum produto crítico identificado.</span>}
                </div>
            </div>
        </div>
    );
}
