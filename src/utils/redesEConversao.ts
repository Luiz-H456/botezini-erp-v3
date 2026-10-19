/**
 * Redes de empresas — matriz e filiais sob a mesma raiz de CNPJ.
 *
 * ESTE ARQUIVO QUASE NASCEU MAIOR DO QUE PRECISAVA. Ele começou com uma seção
 * de conversão por segmento — que JÁ EXISTIA em funilDeLeads.conversaoPor, com
 * o mesmo corte de amostra mínima e tudo. Foi removida antes de entrar: duas
 * respostas para a mesma pergunta divergem no dia em que alguém corrige uma
 * delas.
 *
 * O campo `cnpj_raiz` já é preenchido pela importação, e até agora ninguém o
 * usava para nada. Ele são os oito primeiros dígitos do CNPJ — o que a matriz e todas as
 * filiais têm em comum.
 *
 * Uma rede com onze filiais chega da planilha como doze leads soltos.
 * Prospectar os doze é fazer doze abordagens iguais para a mesma empresa, o que
 * queima a rede inteira de uma vez. Fechar com a matriz costuma abrir as onze.
 */

export interface LeadDaRede {
    id: string;
    razao_social?: string | null;
    nome_fantasia?: string | null;
    cnpj?: string | null;
    cnpj_raiz?: string | null;
    cidade?: string | null;
    uf?: string | null;
    porte_funcionarios?: number | null;
    segmento?: string | null;
    status?: string | null;
    client_id?: string | null;
}

export interface Rede<T extends LeadDaRede = LeadDaRede> {
    raiz: string;
    /** O maior do grupo — o melhor palpite de matriz quando não há marcação. */
    principal: T;
    filiais: T[];
    total: number;
    /** Alguma unidade da rede já é cliente. */
    temCliente: boolean;
}

/**
 * Agrupa leads em redes. Só devolve grupos com MAIS DE UM — uma "rede" de uma
 * empresa só é uma empresa, e listá-la como rede seria ruído em cima de ruído.
 *
 * A principal é a de maior porte, e não a primeira encontrada: o cadastro não
 * marca matriz, e entre unidades da mesma rede a maior é a que costuma decidir
 * compra. Empate resolve pelo nome, para a lista não trocar de ordem sozinha.
 */
export function agruparEmRedes<T extends LeadDaRede>(leads: T[]): Rede<T>[] {
    const porRaiz = new Map<string, T[]>();
    for (const l of leads || []) {
        const raiz = (l.cnpj_raiz || '').trim();
        if (!raiz) continue;
        const grupo = porRaiz.get(raiz);
        if (grupo) grupo.push(l); else porRaiz.set(raiz, [l]);
    }

    const redes: Rede<T>[] = [];
    for (const [raiz, grupo] of porRaiz) {
        if (grupo.length < 2) continue;
        const ordenado = [...grupo].sort((a, b) => {
            const pa = Number(a.porte_funcionarios) || 0;
            const pb = Number(b.porte_funcionarios) || 0;
            if (pb !== pa) return pb - pa;
            return (a.razao_social || '').localeCompare(b.razao_social || '', 'pt-BR');
        });
        redes.push({
            raiz,
            principal: ordenado[0],
            filiais: ordenado.slice(1),
            total: ordenado.length,
            temCliente: ordenado.some(l => !!l.client_id || l.status === 'cliente'),
        });
    }

    return redes.sort((a, b) => b.total - a.total);
}

/** Quantos leads soltos viriam a menos se as redes fossem abordadas uma vez só. */
export function abordagensEconomizadas(redes: Rede[]): number {
    return redes.reduce((s, r) => s + r.filiais.length, 0);
}
