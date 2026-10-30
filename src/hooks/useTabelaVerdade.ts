import { useCallback, useEffect, useState } from 'react';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { mapaDeReferencia, type Catalogo } from '@/utils/tabelaVerdade';
import { getTodayStr } from '@/utils/date';

export function useCatalogoDoFornecedor(fornecedorId: string) {
    const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
    const [erro, setErro] = useState('');
    const [versao, setVersao] = useState(0);
    useEffect(() => {
        let vivo = true;
        setErro('');
        tabelaVerdadeRepository.catalogo(fornecedorId)
            .then(c => { if (vivo) setCatalogo(c); })
            .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui ler a tabela de preços.'); });
        return () => { vivo = false; };
    }, [fornecedorId, versao]);
    const recarregar = useCallback(() => { invalidarCustoDeReferencia(); setVersao(v => v + 1); }, []);
    return { catalogo, erro, recarregar };
}

// Um mapa só para a aba inteira: o orçamento monta um selo por linha, e cada um buscar
// o catálogo seria uma consulta por item. 60 s é menos que o tempo de alguém reajustar
// uma tabela numa aba e olhar o orçamento na outra; salvar na tabela invalida na hora.
let cache: { quando: number; mapa: Promise<Map<string, number>> } | null = null;
const ouvintes = new Set<() => void>();

export function invalidarCustoDeReferencia() {
    cache = null;
    ouvintes.forEach(f => f());
}

function carregar(): Promise<Map<string, number>> {
    if (cache && Date.now() - cache.quando < 60_000) return cache.mapa;
    const mapa = Promise.all([tabelaVerdadeRepository.catalogo(), tabelaVerdadeRepository.insumosComFaixa()])
        .then(([cat, insumos]) => mapaDeReferencia(cat, insumos, getTodayStr()))
        // Sem tabela (ou sem acesso a preço) os consumidores seguem com o custo médio.
        .catch(() => new Map<string, number>());
    cache = { quando: Date.now(), mapa };
    return mapa;
}

export function useCustoDeReferencia(): Map<string, number> {
    const [mapa, setMapa] = useState<Map<string, number>>(new Map());
    useEffect(() => {
        let vivo = true;
        const ler = () => { carregar().then(m => { if (vivo) setMapa(m); }); };
        ler();
        ouvintes.add(ler);
        return () => { vivo = false; ouvintes.delete(ler); };
    }, []);
    return mapa;
}

/**
 * Ordem das faixas de cada tecido (faixa_id → ordem 1..6), para o orçamento mostrar as faixas no
 * seletor de cor na ordem da tabela, não na da cartela (pendência da v3.1, auditoria N5).
 * Faixas são legíveis por qualquer usuário (sem preço); lido uma vez por sessão.
 */
let ordemCache: Promise<Map<string, number>> | null = null;
export function useOrdemDasFaixas(): Map<string, number> {
    const [ordem, setOrdem] = useState<Map<string, number>>(new Map());
    useEffect(() => {
        let vivo = true;
        ordemCache ??= tabelaVerdadeRepository.catalogo()
            .then(cat => new Map(cat.faixas.map(f => [f.id, f.ordem])))
            .catch(() => { ordemCache = null; return new Map<string, number>(); });
        ordemCache.then(m => { if (vivo) setOrdem(m); });
        return () => { vivo = false; };
    }, []);
    return ordem;
}
