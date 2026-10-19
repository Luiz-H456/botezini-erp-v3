import { supabase } from '@/services/supabase';
import { isColunaAusente } from '@/utils/postgrestErrors';

export class AttachmentRepository {
    async uploadAttachment(file: File, folder: string): Promise<string> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const ext = file.name.split('.').pop();
        const fileName = `${user.id}/${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

        const { data, error } = await supabase.storage
            .from('financial-attachments')
            .upload(fileName, file);

        if (error) throw new Error(error.message);
        return data.path;
    }

    async getAttachmentUrl(path: string): Promise<string> {
        if (!supabase) throw new Error('Supabase não configurado');
        // Caminho vazio (foto/anexo sem arquivo) virava POST .../sign/financial-attachments/ → 400 no console.
        // Quem chama já trata o erro como "sem imagem".
        if (!path?.trim()) throw new Error('Anexo sem arquivo');
        const { data, error } = await supabase.storage
            .from('financial-attachments')
            .createSignedUrl(path, 3600); // 1 hour link

        if (error) throw new Error(error.message);
        return data.signedUrl;
    }

    /**
     * Baixa o anexo e devolve como data URI.
     *
     * O jsPDF não busca imagem por URL: precisa dos bytes em mãos. E a URL
     * assinada expira em 1 h, então guardá-la não serve — a conversão tem de
     * acontecer no momento de gerar o PDF.
     */
    async getAttachmentDataUrl(path: string): Promise<string> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase.storage
            .from('financial-attachments')
            .download(path);
        if (error) throw new Error(error.message);

        return new Promise<string>((resolve, reject) => {
            const leitor = new FileReader();
            leitor.onload = () => resolve(String(leitor.result));
            leitor.onerror = () => reject(new Error(`Falha ao ler o anexo ${path}`));
            leitor.readAsDataURL(data);
        });
    }

    /**
     * Quantos OUTROS registros apontam para este arquivo.
     *
     * Existe porque o caminho é compartilhado em três lugares: duplicar um
     * orçamento copia `reference_photos`, converter em pedido copia de novo, e
     * "Guardar" na página do cliente traz a foto do orçamento para o cadastro.
     * Apagar o arquivo porque UM registro soltou deixa os outros com imagem
     * quebrada — foi o que aconteceu, e os erros 400 em `financial-attachments`
     * no console eram exatamente isso.
     *
     * `cs` é "contains" do PostgREST sobre jsonb, que é o tipo da coluna nas
     * três tabelas.
     *
     * @param idDoAtual  registro de onde a foto está saindo, excluído da conta.
     *   Vazio quando ele ainda não foi salvo — uma duplicata recém-criada —, e
     *   aí ninguém é excluído, que é justamente o caso do defeito. Os ids são
     *   UUID, então excluir pelo id nas três tabelas não tem colisão.
     */
    async contarOutrasReferencias(path: string, idDoAtual: string): Promise<number> {
        if (!supabase || !path) return 0;
        const alvo = JSON.stringify([path]);

        const consultar = async (tabela: 'budgets' | 'orders' | 'clients') => {
            let q = supabase!.from(tabela).select('id').filter('reference_photos', 'cs', alvo);
            if (idDoAtual) q = q.neq('id', idDoAtual);
            const { data, error } = await q;
            // Sem a migração das fotos, a coluna não existe — e então essa
            // tabela não guarda caminho nenhum, o que é zero e não um erro.
            if (error) {
                if (isColunaAusente(error, 'reference_photos')) return 0;
                throw new Error(error.message);
            }
            return (data || []).length;
        };

        const contagens = await Promise.all(
            (['budgets', 'orders', 'clients'] as const).map(consultar),
        );
        return contagens.reduce((a, b) => a + b, 0);
    }

    async deleteAttachment(path: string): Promise<void> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { error } = await supabase.storage
            .from('financial-attachments')
            .remove([path]);
        if (error) throw new Error(error.message);
    }
}
