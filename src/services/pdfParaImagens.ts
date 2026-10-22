import { paginasAConverter } from '@/utils/anexosDeReferencia';

/** Largura da página convertida: lê bem ampliada e cabe na grade de fotos do PDF sem pesar. */
const LARGURA_PX = 1600;

/**
 * Converte as páginas de um PDF em JPEGs, no navegador (pdf.js).
 *
 * Import dinâmico: o pdf.js tem ~1 MB e só quem anexa um PDF paga por ele.
 * Fundo branco pintado antes: JPEG não tem transparência, e página sem fundo virava preta.
 */
export async function pdfParaImagens(arquivo: File): Promise<{ imagens: Blob[]; deFora: number }> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;

    const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
    try {
        const { converter, deFora } = paginasAConverter(doc.numPages);
        const imagens: Blob[] = [];
        for (let n = 1; n <= converter; n++) {
            const pagina = await doc.getPage(n);
            const escala = Math.min(LARGURA_PX / pagina.getViewport({ scale: 1 }).width, 4);
            const viewport = pagina.getViewport({ scale: escala });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Navegador sem suporte a canvas');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await pagina.render({ canvasContext: ctx, viewport }).promise;
            imagens.push(await new Promise<Blob>((ok, falha) =>
                canvas.toBlob(b => (b ? ok(b) : falha(new Error(`Falha ao converter a página ${n}`))), 'image/jpeg', 0.85)));
            pagina.cleanup();
        }
        return { imagens, deFora };
    } finally {
        await doc.destroy();
    }
}
