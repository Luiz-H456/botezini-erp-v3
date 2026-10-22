/**
 * Anexos de referência que aceitam PDF (22/10): o PDF original é guardado e cada página vira uma
 * imagem guardada ao lado, com o mesmo nome-base + `_pNN`. As páginas são fotos como as outras —
 * miniatura, PDF do orçamento, ficha do pedido —; o PDF original fica para abrir e baixar.
 * Sem import do app, para testar com node --test.
 */

export const TAMANHO_MAX_MB_PDF = 20;
/** Acima disto o PDF é guardado inteiro, mas só as primeiras páginas viram imagem. */
export const MAX_PAGINAS_PDF = 20;

const EXT_IMAGEM = /\.(jpe?g|png|webp|heic|gif)$/i;

export const ehPdf = (caminho: string): boolean => /\.pdf$/i.test(caminho);
export const ehImagem = (caminho: string): boolean => EXT_IMAGEM.test(caminho);

/** O que pode ser desenhado como foto (PDF do orçamento, ficha): imagens e páginas, nunca o PDF. */
export const somenteImagens = (caminhos: string[]): string[] => caminhos.filter(ehImagem);

/** Nome de arquivo sem extensão no bucket: carimbo + sufixo aleatório. */
export const novaBase = (): string => `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

/** Nome-base da página N (o repositório acrescenta a extensão). Dois dígitos: ordena certo até 99. */
export const nomeDaPagina = (base: string, n: number): string => `${base}_p${String(n).padStart(2, '0')}`;

/** As páginas convertidas de um PDF, pela convenção de nome. */
export function paginasDoPdf(caminhoPdf: string, lista: string[]): string[] {
    if (!ehPdf(caminhoPdf)) return [];
    const prefixo = `${caminhoPdf.replace(/\.pdf$/i, '')}_p`;
    return lista.filter(c => c !== caminhoPdf && ehImagem(c)
        && c.startsWith(prefixo) && /^\d+\./.test(c.slice(prefixo.length)));
}

/** Remove o anexo do índice; se for um PDF, as páginas dele saem junto. */
export function removerComPaginas(lista: string[], indice: number): { nova: string[]; removidos: string[] } {
    const alvo = lista[indice];
    if (alvo === undefined) return { nova: lista, removidos: [] };
    const removidos = [alvo, ...paginasDoPdf(alvo, lista)];
    return { nova: lista.filter(c => !removidos.includes(c)), removidos };
}

export function paginasAConverter(total: number): { converter: number; deFora: number } {
    const n = Math.max(0, Math.floor(total));
    return { converter: Math.min(n, MAX_PAGINAS_PDF), deFora: Math.max(0, n - MAX_PAGINAS_PDF) };
}
