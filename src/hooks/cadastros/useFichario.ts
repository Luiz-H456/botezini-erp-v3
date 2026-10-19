import { useCallback, useEffect, useState } from 'react';
import { storageService } from '@/services/storage';
import { completudeDosDados } from '@/utils/completudeDosDados';
import { conferirSaldos, movimentosDosPagamentos, dadosCompletosDaConferencia } from '@/utils/conferenciaDeSaldo';
import { clientesDormentes } from '@/utils/acompanhamentoComercial';
import { getTodayStr } from '@/utils/date';
import { calcularMetaSugerida } from '@/utils/metaDeFaturamento';
import { TOTAL_DE_MENSAGENS } from '@/pages/masterdata/MensagensTab';
import type { DadosDoFichario } from '@/utils/fichario';

/**
 * Os números do fichário de Cadastros. Carrega uma vez ao montar; `recarregar` refaz.
 * Se qualquer leitura falhar: `dados` nulo e `erro` preenchido — nunca números pela metade.
 */
export function useFichario() {
    const [dados, setDados] = useState<DadosDoFichario | null>(null);
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(true);

    const recarregar = useCallback(async () => {
        setCarregando(true);
        try {
            const [clientes, produtos, fornecedores, bancos, setores, categorias, ficha, pedidos, orcamentos, insumos, contas, pags, perfil] =
                await Promise.all([
                    storageService.getClients(), storageService.getProducts(), storageService.getSuppliers(),
                    storageService.getBankAccounts(true), storageService.getSectors(false, { estrito: true }),
                    storageService.getGlobalCategories('finance', { estrito: true }), storageService.getFichaPorProduto(),
                    storageService.getOrders(), storageService.getBudgets(), storageService.getInsumos(),
                    storageService.getObligations(), storageService.getAllPaymentsComTeto(),
                    storageService.getCompanyProfile(),
                ]);
            const completude = completudeDosDados({ pedidos, orcamentos, produtos, insumos, fichaPorProduto: ficha });
            const conferencia = conferirSaldos(bancos, movimentosDosPagamentos(pags.pagamentos, contas),
                { dadosCompletos: dadosCompletosDaConferencia(pags.truncado, contas.length) });
            // Só aparece quando há sugestão e ela difere da meta já salva. Sem perfil (leitura falhou
            // ou nunca salvo) não há margem-alvo: calcular com 0% inventaria um número.
            const sugerida = perfil ? calcularMetaSugerida(
                { obrigacoes: contas, categorias, pedidos, orcamentos, clientes, produtos },
                Number(perfil.target_margin) || 0).valor : null;
            const capacidades = setores.map(s => s.weekly_capacity_pieces).filter(c => c > 0);
            setDados({
                clientes: clientes.length,
                sumidos: clientesDormentes(clientes, pedidos.map(o => ({ client_id: o.client_id, data: o.created_at, valor: Number(o.total_amount) || 0 })), getTodayStr()).length,
                produtos: produtos.length,
                semFicha: completude.produtosPendentes,
                fornecedores: fornecedores.length,
                bancos: bancos.length,
                naoBatem: conferencia.divergencias.length,
                setores: setores.length,
                gargaloSemanal: capacidades.length ? Math.min(...capacidades) : 0,
                // Categoria é o nível de baixo (tem pai); sem natureza = ainda não revisada (igual à aba Categorias).
                categorias: categorias.filter(c => c.parent_id).length,
                naoRevisadas: categorias.filter(c => c.parent_id && !c.natureza).length,
                mensagens: TOTAL_DE_MENSAGENS,
                metaSugerida: sugerida !== null && sugerida !== (Number(perfil?.revenue_goal) || 0) ? sugerida : null,
            });
            setErro('');
        } catch (e) {
            setDados(null);
            setErro(e instanceof Error ? e.message : 'Não consegui carregar o fichário.');
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { void recarregar(); }, [recarregar]);

    return { dados, erro, carregando, recarregar };
}
