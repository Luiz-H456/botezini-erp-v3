/**
 * Os dados bancários que saem no orçamento, e as colunas opcionais do perfil da empresa.
 * Sem imports do app, para ser testado com node --test.
 */

export interface DadosBancarios {
    bank_name: string | null;
    agency: string | null;
    account_number: string | null;
    holder: string | null;
    pix_key: string | null;
}

interface BancoDoOrcamento {
    bank_name?: string | null; agency?: string | null; account_number?: string | null;
    titular?: string | null; chave_pix?: string | null;
}

export interface PerfilComBanco {
    bank_name?: string | null; agency?: string | null; bank_agency?: string | null;
    account_number?: string | null; bank_account?: string | null;
    bank_holder?: string | null; pix_key?: string | null;
    /** Preenchido pelo repositório só quando o banco escolhido existe e está ativo. */
    banco_do_orcamento?: BancoDoOrcamento | null;
    banco_do_orcamento_id?: string | null;
}

const ou = (v: string | null | undefined) => v || null;

/**
 * Banco escolhido → os dados DELE, inteiros. Sem banco (não escolhido, inativado, apagado
 * ou SQL não rodado) → os campos antigos da empresa. Nunca mistura os dois: um PIX de uma
 * conta impresso ao lado da agência de outra manda o cliente pagar no lugar errado.
 */
export function dadosBancariosDoOrcamento(p: PerfilComBanco): DadosBancarios {
    const b = p.banco_do_orcamento;
    if (b) {
        return { bank_name: ou(b.bank_name), agency: ou(b.agency), account_number: ou(b.account_number),
            holder: ou(b.titular), pix_key: ou(b.chave_pix) };
    }
    return {
        bank_name: ou(p.bank_name),
        agency: ou(p.agency ?? p.bank_agency),
        account_number: ou(p.account_number ?? p.bank_account),
        holder: ou(p.bank_holder),
        pix_key: ou(p.pix_key),
    };
}

/**
 * `banco_do_orcamento_id` só existe depois de supabase/cadastros_v3_1.sql. A leitura
 * (`select *`) traz a chave quando a coluna existe — é por ela que se sabe. Mandar a
 * coluna antes do SQL faria o upsert do perfil inteiro ser recusado.
 */
export function colunasOpcionaisDoPerfil(p: PerfilComBanco): Record<string, unknown> {
    return 'banco_do_orcamento_id' in p ? { banco_do_orcamento_id: p.banco_do_orcamento_id ?? null } : {};
}

/**
 * Passos verticais (mm) do quadro "Dados para pagamento" no PDF do orçamento. O desenho
 * (pdfService) anda exatamente estes passos e a altura do fundo preto é somada com eles:
 * os dois liam números diferentes, e o TOTAL — escrito em branco — caía abaixo do fundo.
 *   inicio       do topo do quadro até a 1ª linha (etiqueta + separador)
 *   linha        banco, agência/conta, titular
 *   pix          a linha do PIX (fonte própria, um pouco mais de ar)
 *   baseDoTotal  da última linha até a base do valor do total (14pt)
 *   total        o bloco do total inteiro, com a margem de baixo
 */
export const QUADRO_BANCARIO = { inicio: 15, linha: 6, pix: 8, baseDoTotal: 5, total: 10 } as const;

export function alturaDoQuadroBancario(b: DadosBancarios): number {
    const q = QUADRO_BANCARIO;
    return q.inicio
        + (b.bank_name ? q.linha : 0)
        + ((b.agency || b.account_number) ? q.linha : 0)
        + (b.holder ? q.linha : 0)
        + (b.pix_key ? q.pix : 0)
        + q.total;
}
