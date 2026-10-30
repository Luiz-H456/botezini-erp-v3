/**
 * Busca geral (Ctrl+K / "/", auditoria de 29/10, R1): achar cliente, pedido, orçamento,
 * fornecedor ou produto de qualquer tela, em vez de ir à tela certa e usar a busca dela.
 *
 * Pura: recebe as listas, devolve os resultados na ordem de relevância. Sem import do app.
 */

export type TipoDoResultado = 'cliente' | 'pedido' | 'orcamento' | 'fornecedor' | 'produto';

export interface ResultadoDaBusca {
    tipo: TipoDoResultado;
    id: string;
    titulo: string;
    detalhe: string;
    /** O que a tela de destino usa para abrir: id ou número. */
    chave: string;
}

export interface DadosDaBusca {
    clientes: { id: string; company_name: string; contact_person?: string | null; cnpj?: string | null; phone?: string | null }[];
    pedidos: { id: string; order_number: string; client_id?: string | null; status?: string | null; deadline?: string | null }[];
    orcamentos: { id: string; serial_number: string; client_id?: string | null; status?: string | null; date?: string | null }[];
    fornecedores: { id: string; company_name: string; category?: string | null }[];
    produtos: { id: string; name: string; code?: string | null }[];
}

export const POR_TIPO = 5;
export const NO_TOTAL = 20;

export const normalizar = (s: string | null | undefined): string =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const soDigitos = (s: string | null | undefined) => (s || '').replace(/\D/g, '');

/**
 * Nota de um texto para o termo: 0 = não casa. Começar com o termo vale mais que conter;
 * todas as palavras do termo têm de aparecer (em qualquer ordem). Número (pedido, CNPJ,
 * telefone) casa pelos dígitos: "47" acha PED-BZ-2026-047.
 */
export function nota(termo: string, ...campos: (string | null | undefined)[]): number {
    const t = normalizar(termo);
    if (!t) return 0;
    const alvo = normalizar(campos.filter(Boolean).join(' '));
    const palavras = t.split(' ');
    let n = 0;
    // Termo só de números não casa por "contém" no texto (o telefone de todo mundo tem um "47").
    const soNumero = /^[\d\s./-]+$/.test(termo.trim());
    if (!soNumero && palavras.every(p => alvo.includes(p))) n = alvo.startsWith(t) ? 3 : alvo.split(' ').some(w => w.startsWith(palavras[0])) ? 2 : 1;
    const dig = soDigitos(termo);
    if (dig.length >= 2 && dig.length === termo.replace(/\s/g, '').length) {
        for (const c of campos) {
            const d = soDigitos(c);
            // Telefone/CNPJ só pelo fim com 4+ dígitos: "47" acharia meio mundo pelo telefone.
            if (d && dig.length >= 4 && d.endsWith(dig)) n = Math.max(n, 4);
            else if (dig.length >= 4 && d.includes(dig)) n = Math.max(n, 1);
        }
    }
    return n;
}

/** Número do pedido/orçamento pelos dígitos do fim ("47" → …-047): vence qualquer outra nota. */
export function notaDoNumero(termo: string, numero: string): number {
    const dig = soDigitos(termo);
    if (!dig || dig.length !== termo.replace(/\s/g, '').length) return 0;
    const d = soDigitos(numero);
    return d.endsWith(dig.padStart(3, '0')) || d.endsWith(dig) ? 5 : 0;
}

export function buscarEmTudo(termo: string, d: DadosDaBusca): ResultadoDaBusca[] {
    if (normalizar(termo).length < 2) return [];
    const nomeDoCliente = new Map(d.clientes.map(c => [c.id, c.company_name]));
    const grupos: { r: ResultadoDaBusca; n: number }[][] = [
        d.clientes.map(c => ({ n: nota(termo, c.company_name, c.contact_person, c.cnpj, c.phone),
            r: { tipo: 'cliente' as const, id: c.id, chave: c.id, titulo: c.company_name, detalhe: c.contact_person || 'Cliente' } })),
        d.pedidos.map(p => ({ n: Math.max(notaDoNumero(termo, p.order_number), nota(termo, p.order_number, nomeDoCliente.get(p.client_id || ''))),
            r: { tipo: 'pedido' as const, id: p.id, chave: p.order_number, titulo: p.order_number,
                detalhe: [nomeDoCliente.get(p.client_id || ''), p.status].filter(Boolean).join(' · ') } })),
        d.orcamentos.map(o => ({ n: Math.max(notaDoNumero(termo, o.serial_number), nota(termo, o.serial_number, nomeDoCliente.get(o.client_id || ''))),
            r: { tipo: 'orcamento' as const, id: o.id, chave: o.serial_number, titulo: o.serial_number,
                detalhe: [nomeDoCliente.get(o.client_id || ''), o.status].filter(Boolean).join(' · ') } })),
        d.fornecedores.map(f => ({ n: nota(termo, f.company_name, f.category),
            r: { tipo: 'fornecedor' as const, id: f.id, chave: f.id, titulo: f.company_name, detalhe: f.category || 'Fornecedor' } })),
        d.produtos.map(p => ({ n: nota(termo, p.name, p.code),
            r: { tipo: 'produto' as const, id: p.id, chave: p.id, titulo: p.name, detalhe: p.code || 'Produto' } })),
    ];
    const porTipo = grupos.map(g => g.filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.r.titulo.localeCompare(b.r.titulo)).slice(0, POR_TIPO));
    return porTipo.flat().sort((a, b) => b.n - a.n).slice(0, NO_TOTAL).map(x => x.r);
}
