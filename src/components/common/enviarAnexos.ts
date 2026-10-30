import { storageService } from '@/services/storage';
import { TIPOS_DE_IMAGEM_ACEITOS, TAMANHO_MAX_MB_IMAGEM } from '@/components/common/GaleriaDeFotos';
import { novaBase, nomeDaPagina, TAMANHO_MAX_MB_PDF } from '@/utils/anexosDeReferencia';
import { mensagemDeErro } from '@/utils/errorHandling';

export const TIPO_PDF = 'application/pdf';
export const TIPOS_ACEITOS_COM_PDF = [...TIPOS_DE_IMAGEM_ACEITOS, TIPO_PDF];

/**
 * Envio de fotos e PDFs de referência — um lugar só para o orçamento e o cliente (antes cada um
 * tinha o seu laço, e só o do orçamento aprendeu PDF).
 *
 * PDF: guarda o original e cada página como JPEG, com a mesma base no nome (`<base>.pdf`,
 * `<base>_p01.jpg`…) — é como a remoção acha as páginas dele (removerComPaginas).
 *
 * Sequencial de propósito: em upload paralelo, uma falha no meio deixa parte dos arquivos no
 * bucket sem referência. E o que já subiu volta em `novos` mesmo se um seguinte falhar — quem
 * chama grava a lista, senão vira órfão.
 */
export async function enviarAnexos(arquivos: File[], pasta: string, etapa: (e: 'Convertendo' | 'Enviando') => void): Promise<{ novos: string[]; avisos: string[] }> {
    const recusados: string[] = [];
    const aceitos = arquivos.filter(f => {
        if (!TIPOS_ACEITOS_COM_PDF.includes(f.type)) { recusados.push(`${f.name} (formato)`); return false; }
        const limite = f.type === TIPO_PDF ? TAMANHO_MAX_MB_PDF : TAMANHO_MAX_MB_IMAGEM;
        if (f.size > limite * 1024 * 1024) { recusados.push(`${f.name} (acima de ${limite} MB)`); return false; }
        return true;
    });
    const avisos: string[] = recusados.length > 0 ? [`Não enviado: ${recusados.join(', ')}`] : [];
    const novos: string[] = [];
    try {
        for (const arquivo of aceitos) {
            if (arquivo.type !== TIPO_PDF) {
                etapa('Enviando');
                novos.push(await storageService.uploadAttachment(arquivo, pasta));
                continue;
            }
            etapa('Convertendo');
            let imagens: Blob[] = [];
            try {
                const r = await (await import('@/services/pdfParaImagens')).pdfParaImagens(arquivo);
                imagens = r.imagens;
                if (r.deFora > 0) avisos.push(`${arquivo.name}: só as ${imagens.length} primeiras páginas viraram foto; as outras ${r.deFora} ficam só no PDF`);
            } catch {
                avisos.push(`${arquivo.name}: não consegui ler as páginas (PDF protegido ou danificado). O PDF fica salvo, sem as fotos.`);
            }
            etapa('Enviando');
            const base = novaBase();
            novos.push(await storageService.uploadAttachment(arquivo, pasta, base));
            for (let n = 1; n <= imagens.length; n++) {
                const nome = nomeDaPagina(base, n);
                const pagina = new File([imagens[n - 1]], `${nome}.jpg`, { type: 'image/jpeg' });
                novos.push(await storageService.uploadAttachment(pagina, pasta, nome));
            }
        }
    } catch (e) {
        avisos.push(mensagemDeErro(e, 'Falha ao enviar o arquivo'));
    }
    return { novos, avisos };
}
