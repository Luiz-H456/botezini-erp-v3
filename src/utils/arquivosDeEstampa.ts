/**
 * Arquivos de estampa (parte D, 30/10): PDF, foto, Corel (.cdr) e matriz de bordado (.dst).
 * O tipo vem da extensão, não do MIME: o navegador não conhece .cdr nem .dst e manda vazio ou
 * "application/octet-stream". Puro, sem import do app.
 */

export type TipoDeArquivo = 'pdf' | 'foto' | 'corel' | 'bordado';

const POR_EXTENSAO: Record<string, TipoDeArquivo> = {
    pdf: 'pdf',
    jpg: 'foto', jpeg: 'foto', png: 'foto', webp: 'foto', heic: 'foto',
    cdr: 'corel',
    dst: 'bordado',
};

export const ROTULO_DO_TIPO: Record<TipoDeArquivo, string> = { pdf: 'PDF', foto: 'Foto', corel: 'Corel', bordado: 'Matriz DST' };

/** Para o `accept` do input: extensões, porque .cdr/.dst não têm MIME conhecido. */
export const ACEITOS = Object.keys(POR_EXTENSAO).map(e => `.${e}`).join(',');

/** Corel com imagem embutida passa fácil de 20 MB; o limite do Supabase por upload é 50 MB. */
export const TAMANHO_MAX_MB_ARQUIVO = 50;

const extensao = (nome: string) => {
    const m = /\.([a-z0-9]+)$/i.exec(nome.split('?')[0]);
    return m ? m[1].toLowerCase() : '';
};

export const tipoDoArquivo = (nome: string): TipoDeArquivo | null => POR_EXTENSAO[extensao(nome)] ?? null;

export function recusaDoArquivo(f: { name: string; size: number }): string | null {
    if (!tipoDoArquivo(f.name)) return `${f.name} (formato: use PDF, foto, .cdr ou .dst)`;
    if (f.size > TAMANHO_MAX_MB_ARQUIVO * 1024 * 1024) return `${f.name} (acima de ${TAMANHO_MAX_MB_ARQUIVO} MB)`;
    return null;
}

const SEPARADOR = '--';

/** Base do caminho no bucket com o nome original legível depois do carimbo: `<carimbo>--logo-silva`. */
export function baseComNome(nomeOriginal: string, carimbo: string): string {
    const semExt = nomeOriginal.replace(/\.[^.]+$/, '');
    const limpo = semExt.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return limpo ? `${carimbo}${SEPARADOR}${limpo}` : carimbo;
}

/** O nome que a pessoa reconhece: o original guardado no caminho, ou o arquivo como está. */
export function nomeParaMostrar(caminho: string): string {
    const arquivo = caminho.split('/').pop() || caminho;
    const i = arquivo.indexOf(SEPARADOR);
    return i >= 0 ? arquivo.slice(i + SEPARADOR.length) : arquivo;
}
