import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Budget, BudgetItem, Client, CompanyProfile, Order, Product, DRELine, BudgetCustomization, BudgetExtra } from '../types';
import { formatDate, formatCurrency, addBusinessDays } from '../utils';
import { buildCuttingSheet, buildAdicionais } from '../utils/cuttingSheet';
import { linhasComRecuo, aparar } from '@/utils/textoFormatado';
import type { LinhaComRecuo } from '@/utils/textoFormatado';
import { montarGrade, paginarFotos, posicoesDoBloco } from '@/utils/gradeDeFotos';
import { conferirPlano } from '@/utils/planoDoPedido';
import { descreverCondicao } from '@/utils/condicaoDePagamento';
import { getTodayStr } from '@/utils/date';
import { dadosBancariosDoOrcamento, alturaDoQuadroBancario, QUADRO_BANCARIO } from '@/utils/perfilDaEmpresa';
import { percentual } from '@/utils/numeros';

class PdfService {
    /**
     * Paleta do app, para o PDF do cliente ter a mesma identidade da tela.
     *
     * O corpo do documento permanece branco de propósito: o app é escuro, mas
     * uma folha A4 chapada de zinc-950 é inviável de imprimir. A identidade vem
     * do dourado nos títulos e do zinc escuro nas faixas e cabeçalhos de tabela,
     * que é onde ela aparece sem custar tinta em área.
     */
    private static readonly COR = {
        // Escala zinc do app (bg-zinc-950/900/800 das telas).
        zinc950: [9, 9, 11] as [number, number, number],
        zinc900: [24, 24, 27] as [number, number, number],
        zinc800: [39, 39, 42] as [number, number, number],
        /**
         * amber-500 (#F59E0B) — é o dourado que o app realmente mostra: 565 usos
         * contra 9 do gold-500 (#C9A24D) declarado no index.css, que ficou legado.
         * Usar em PREENCHIMENTO e em texto sobre fundo escuro.
         */
        amber: [245, 158, 11] as [number, number, number],
        /**
         * amber-700 (#B45309) para texto pequeno sobre branco. O amber-500 tem
         * contraste de ~2:1 no branco — some em 7 pt impresso. Mesma família,
         * mesma leitura de marca, legível.
         */
        amberTexto: [180, 83, 9] as [number, number, number],
        /** amber-100 — único preenchimento claro de destaque do documento. */
        amberFundo: [254, 243, 199] as [number, number, number],
        /** amber-300 — a borda que acompanha o amberFundo. */
        amberBorda: [253, 230, 138] as [number, number, number],
        texto: [24, 24, 27] as [number, number, number],
        textoFraco: [113, 113, 122] as [number, number, number],
        linha: [228, 228, 231] as [number, number, number],
        /**
         * Fundo de bloco e zebra da tabela — o MESMO tom nos dois.
         *
         * Havia quatro cinzas quase iguais espalhados (248/250/252/245) que na
         * folha impressa não se distinguem, mas fazem o documento parecer
         * montado por partes. Um tom só, usado em tudo que é superfície.
         */
        superficie: [250, 250, 249] as [number, number, number],
        /** Borda de bloco, um passo mais forte que `linha`. */
        borda: [212, 212, 216] as [number, number, number],
    };

    /**
     * Escala de espaçamento — o grid de 8 pt traduzido para milímetros.
     *
     * O documento é gerado em mm, não em px, então "múltiplos de 8 px" não se
     * aplica ao pé da letra. O equivalente na régua do papel é uma base de 2 mm
     * (8 pt tipográficos ≈ 2,82 mm; 8 px a 96 dpi ≈ 2,12 mm), com 1 mm liberado
     * para ajuste fino — o mesmo papel que os 4 px fazem no grid de tela.
     *
     * Vale para margens, padding de bloco e distância ENTRE grupos. Distância
     * DENTRO de um grupo (título e sua legenda, por exemplo) segue a entrelinha
     * da tipografia, não esta escala: é o que faz a Lei da Proximidade valer,
     * com o espaço interno sempre menor que o externo.
     */
    private static readonly ESPACO = {
        micro: 1,    // ajuste ótico dentro de um mesmo grupo
        xs: 2,       // base
        sm: 4,
        md: 6,       // padding interno padrão de bloco
        lg: 8,       // entre grupos irmãos
        xl: 12,      // entre seções
    };

    /**
     * Etiqueta em caixa alta com espaçamento entre letras, como as telas do app
     * (`uppercase tracking-widest`). O jsPDF não tem tracking em CSS, mas
     * setCharSpace faz o mesmo em pontos — é o que aproxima a tipografia do PDF
     * da do app sem precisar embutir a fonte Inter.
     */
    private etiqueta(doc: jsPDF, texto: string, x: number, y: number, opts?: {
        tamanho?: number; cor?: [number, number, number]; espaco?: number;
    }) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(opts?.tamanho ?? 7);
        doc.setTextColor(...(opts?.cor ?? PdfService.COR.amberTexto));
        doc.setCharSpace(opts?.espaco ?? 0.6);
        doc.text(texto.toUpperCase(), x, y);
        doc.setCharSpace(0);
    }

    /**
     * Título de seção no estilo do app: rótulo dourado em caixa alta com filete
     * abaixo. Devolve o Y já avançado, para o chamador não recalcular espaçamento.
     */
    private tituloSecao(doc: jsPDF, texto: string, x: number, y: number, largura: number): number {
        const C = PdfService.COR;
        this.etiqueta(doc, texto, x, y);
        // Filete curto em amber cheio + continuação clara: é o mesmo recurso dos
        // cabeçalhos de seção do app (marcador colorido + divisória neutra).
        doc.setDrawColor(...C.amber);
        doc.setLineWidth(0.7);
        doc.line(x, y + 1.8, x + 12, y + 1.8);
        doc.setDrawColor(...C.linha);
        doc.setLineWidth(0.3);
        doc.line(x + 12, y + 1.8, x + largura, y + 1.8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.texto);
        return y + 5.8;
    }

    private drawHeader(doc: jsPDF, title: string, id: string, dateLabel: string, dateValue: string, companyProfile?: CompanyProfile | null, theme: 'dark' | 'light' = 'dark', marginX: number = 0) {
        const pageWidth = doc.internal.pageSize.getWidth();
        const headerWidth = pageWidth - marginX;
        const isDark = theme === 'dark';

        // Colors
        const darkColor = PdfService.COR.zinc950;
        const goldColor = PdfService.COR.amber;
        const lightGray = [240, 240, 240] as [number, number, number];
        const medGray = [220, 220, 220] as [number, number, number];
        const textGold = PdfService.COR.amberTexto;

        const mainBgColor = isDark ? darkColor : lightGray;
        const secBgColor = isDark ? goldColor : medGray;
        const mainTextColor = isDark ? [255, 255, 255] : [0, 0, 0];
        const secondaryLabelColor = isDark ? [200, 200, 200] : [80, 80, 80];

        // Header Background (Respecting MarginX)
        // Split roughly 65% / 35% of the REMAINING width
        const splitPoint = marginX + (headerWidth * 0.65);

        doc.setFillColor(...mainBgColor);
        doc.rect(marginX, 0, splitPoint - marginX, 45, 'F');
        doc.setFillColor(...secBgColor);
        doc.rect(splitPoint, 0, pageWidth - splitPoint, 45, 'F');

        // Logo (Centered in the "Logo Area" if possible, or fixed offset)
        // Let's place it relative to marginX
        doc.setFillColor(255, 255, 255);
        doc.rect(marginX + 10, 7, 31, 31, 'F');

        if (companyProfile?.logo_url) {
            // O logo é ENCAIXADO na caixa preservando a proporção. Antes era
            // esticado para 29x29 fixo: um logotipo vertical (o da Botezini é
            // 759x1600) saía esmagado num quadrado, em TODOS os PDFs.
            try {
                const caixa = 29;
                const prop = doc.getImageProperties(companyProfile.logo_url);
                const escala = Math.min(caixa / prop.width, caixa / prop.height);
                const w = prop.width * escala;
                const h = prop.height * escala;
                doc.addImage(companyProfile.logo_url,
                    marginX + 11 + (caixa - w) / 2, 8 + (caixa - h) / 2, w, h, undefined, 'FAST');
            } catch {
                // Logo ilegível não pode custar o documento inteiro.
            }
        }

        // Company Info
        doc.setTextColor(...(mainTextColor as [number, number, number]));
        const startTextX = marginX + 48;
        let currentY = 15;

        doc.setFontSize(16);
        doc.setFont("helvetica", 'bold');
        doc.text((companyProfile?.name || "BOTEZINI ERP").toUpperCase(), startTextX, currentY);

        currentY += 6;
        doc.setFontSize(8);
        doc.setFont("helvetica", 'normal');
        doc.setTextColor(...(secondaryLabelColor as [number, number, number]));

        if (companyProfile?.cnpj) { doc.text(`CNPJ: ${companyProfile.cnpj}`, startTextX, currentY); currentY += 4; }
        if (companyProfile?.address) {
            const splitAddress = doc.splitTextToSize(companyProfile.address, (headerWidth * 0.65) - 55); // Adjusted width calc
            doc.text(splitAddress, startTextX, currentY);
            currentY += (splitAddress.length * 3.5);
        }

        // Report Info (Right Side)
        doc.setTextColor(0, 0, 0);
        const goldX = splitPoint + 10;
        let goldY = 15;

        doc.setFontSize(12);
        doc.setFont("helvetica", 'bold');
        if (!isDark) doc.setTextColor(...textGold); // Use Gold text for title in light mode to keep identity
        doc.text(title, goldX, goldY);
        doc.setTextColor(0, 0, 0);
        goldY += 6;

        doc.setFontSize(9);
        doc.setFont("helvetica", 'normal');
        doc.text(id, goldX, goldY);
        goldY += 10;

        doc.setFontSize(8);
        doc.text(`${dateLabel}:`, goldX, goldY);
        doc.setFont("helvetica", 'bold');
        doc.text(dateValue, goldX + 10, goldY);

        return 55; // Return Y start position for content
    }

    private translateCustType(type: string): string {
        const map: Record<string, string> = {
            'Embroidery': 'Bordado',
            'ScreenPrint': 'Silk',
            'DTF': 'DTF',
            'Other': 'Outro'
        };
        return map[type] || type;
    }

    /**
     * @param photoDataUris Fotos de referência já em data URI. Opcional de
     *   propósito: o PDF comercial sai sem elas por padrão. A conversão dos
     *   arquivos é feita por quem chama (a camada de storage), para este método
     *   continuar sincrono e sem IO.
     */
    public generateBudgetPDF(budget: Budget, client: Client, companyProfile?: CompanyProfile | null, photoDataUris?: string[]) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginX = 14;
        const contentWidth = pageWidth - marginX * 2;

        const C = PdfService.COR;
        const E = PdfService.ESPACO;
        let currentY = this.drawHeader(doc, "ORÇAMENTO COMERCIAL", budget.serial_number, "Data", formatDate(budget.date), companyProfile);

        // A validade fica ancorada na faixa do cabeçalho (45 mm de altura), não num
        // Y solto — assim não colide quando o cabeçalho cresce.
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.zinc900);
        // Zero é a sentinela de "sem validade" (ver isBudgetExpired) — algumas
        // licitações públicas exigem a proposta assim, sem prazo que a vença
        // antes do processo terminar.
        doc.text(
            budget.validity_days > 0 ? `Validade: ${budget.validity_days} dias` : 'Validade: indeterminada',
            (pageWidth * 0.65) + 10, 38);
        doc.setTextColor(...C.texto);

        // ── DADOS DO CLIENTE ──────────────────────────────────────────────────
        currentY = this.tituloSecao(doc, 'DADOS DO CLIENTE', marginX, currentY, contentWidth);

        doc.setFontSize(10);
        doc.setFont("helvetica", 'bold');
        doc.setTextColor(...C.texto);
        doc.text(client.company_name, marginX, currentY);
        doc.setFontSize(8);
        doc.setFont("helvetica", 'normal');
        doc.setTextColor(...C.textoFraco);

        // Duas colunas independentes, cada uma com seu proprio cursor.
        // Antes a coluna da direita era posicionada por heuristica a partir da
        // altura do endereco (e recalculava o splitTextToSize), o que desalinhava
        // contato e telefone conforme o tamanho do endereco do cliente.
        const colEsqX = marginX;
        const colDirX = marginX + contentWidth / 2 + 5;
        const larguraCol = contentWidth / 2 - 5;
        let yEsq = currentY + 5;
        let yDir = currentY + 5;

        if (client.cnpj) { doc.text(`CNPJ: ${client.cnpj}`, colEsqX, yEsq); yEsq += 4; }
        if (client.email) { doc.text(client.email, colEsqX, yEsq); yEsq += 4; }
        if (client.address) {
            const addrLines = doc.splitTextToSize(client.address, larguraCol) as string[];
            doc.text(addrLines, colEsqX, yEsq);
            yEsq += addrLines.length * 3.6;
        }
        if (client.contact_person) { doc.text(`Contato: ${client.contact_person}`, colDirX, yDir); yDir += 4; }
        if (client.phone) { doc.text(`Tel: ${client.phone}`, colDirX, yDir); yDir += 4; }
        if (client.category) { doc.text(`Categoria: ${client.category}`, colDirX, yDir); yDir += 4; }

        currentY = Math.max(yEsq, yDir) + 3;

        // ── ITENS DO ORÇAMENTO ────────────────────────────────────────────────
        currentY = this.tituloSecao(doc, 'ITENS DO ORÇAMENTO', marginX, currentY, contentWidth) - E.xs;

        const itens = budget.items || [];

        // ── Tabela, com nome e descrição na MESMA célula ────────────────────
        //
        // A tabela original tinha "Produto" e "Detalhes" em colunas separadas de
        // 45 e 52 mm. Numa peça de nome comprido — a regra aqui — a descrição
        // quebrava em três linhas picotadas dentro dos 52 mm.
        //
        // Cartões soltos resolviam a leitura mas custavam 28 mm por item e
        // deixavam a folha sem alinhamento nenhum. Aqui as duas colunas viram
        // uma célula de 104 mm com o nome em cima e a descrição embaixo: o texto
        // ganha o dobro de largura, e a faixa escura do cabeçalho, o zebrado e
        // as colunas de número continuam sendo os da tabela de sempre.
        const linhaDeDetalhe = (item: BudgetItem) => {
            // Conjunto: uma linha por peça, cada uma com seu tecido e sua cor.
            // Enquanto a linha tinha um tecido só, o segundo sumia do orçamento
            // e o cliente aprovava sem saber do que era metade da peça.
            const partes = (item.components || []).filter(
                (c): c is NonNullable<typeof c> => !!c && !!(c.name || c.fabric_name));
            const materiais = partes.length > 0
                ? partes.map(c => [
                    (c.name || '').toUpperCase(), c.fabric_name, c.color,
                ].filter(Boolean).join(' · '))
                : [[item.fabric_name || item.fabric, item.color].filter(Boolean).join(' · ')];

            const especificacao = [
                item.model,
                item.sleeve_type ? item.sleeve_type.replace('_', ' ').toUpperCase() : '',
                item.gender ? item.gender.toUpperCase() : '',
                item.fit ? item.fit.toUpperCase() : '',
                item.has_band ? 'C/ FAIXA REFLETIVA' : '',
                // Separador explícito: com espaço simples virava texto corrido
                // ("Polo Malha Piquet MANGA CURTA MASCULINO SLIM").
            ].filter(Boolean).join(' · ');

            return partes.length > 0
                ? [...materiais, especificacao].filter(Boolean).join('\n')
                : [materiais[0], especificacao].filter(Boolean).join(' · ');
        };

        const corpo = itens.length > 0
            ? itens.map(item => [
                [item.product_name || '-', linhaDeDetalhe(item)].filter(Boolean).join('\n'),
                item.size || '-',
                String(item.quantity ?? ''),
                formatCurrency(item.unit_price),
                formatCurrency(item.total),
            ])
            : [['(Nenhum item)', '-', '-', '-', '-']];

        // A primeira coluna é desenhada à mão: o nome em negrito 8,5 e a
        // descrição em cinza 7,5. Como as duas fontes diferem da que o autoTable
        // usa para medir, a quebra é calculada aqui e a altura da linha vem de
        // `minCellHeight` — deixar o plugin medir faria o nome comprido estourar
        // a célula, que foi o que aconteceu na primeira tentativa.
        const LARGURA_COL0 = contentWidth - 13 - 13 - 24 - 28 - 6;
        // Entrelinha NÃO segue a escala: ela é da tipografia, e o espaço
        // dentro do grupo tem de ficar menor que o espaço entre grupos —
        // é o que faz o nome e a descrição serem lidos como uma coisa só.
        const H_NOME = 3.9, H_DET = 3.2;
        const PAD_V = E.xs;

        const quebrado = (item: BudgetItem) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            const nome = doc.splitTextToSize(item.product_name || '-', LARGURA_COL0) as string[];
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            const det = linhaDeDetalhe(item);
            const detalhe = det ? doc.splitTextToSize(det, LARGURA_COL0) as string[] : [];
            return { nome, detalhe };
        };

        const guardado = new Map<number, { nome: string[]; detalhe: string[] }>();
        itens.forEach((item, i) => guardado.set(i, quebrado(item)));

        autoTable(doc, {
            startY: currentY,
            head: [['Produto / Especificação', 'Tam', 'Qtd', 'Unit.', 'Total']],
            body: corpo,
            theme: 'plain',
            tableWidth: contentWidth,
            styles: { cellPadding: { top: E.xs, bottom: E.xs, left: E.sm - 1, right: E.sm - 1 }, fontSize: 7.5 },
            headStyles: {
                fillColor: C.zinc950, textColor: C.amber, fontStyle: 'bold',
                cellPadding: { top: E.xs, bottom: E.xs, left: E.sm - 1, right: E.sm - 1 }, fontSize: 8,
            },
            bodyStyles: { textColor: C.texto },
            alternateRowStyles: { fillColor: C.superficie },
            columnStyles: {
                0: { cellWidth: 'auto', halign: 'left' },
                1: { cellWidth: 13, halign: 'center' },
                2: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
                3: { cellWidth: 24, halign: 'right' },
                4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
            },
            margin: { left: marginX, right: marginX },
            didParseCell: (data: any) => {
                if (data.section !== 'body' || data.column.index !== 0) return;
                const g = guardado.get(data.row.index);
                if (!g) return;
                data.cell.text = [];
                data.cell.styles.minCellHeight =
                    PAD_V * 2 + g.nome.length * H_NOME + g.detalhe.length * H_DET;
            },
            didDrawCell: (data: any) => {
                if (data.section !== 'body' || data.column.index !== 0) return;
                const g = guardado.get(data.row.index);
                if (!g) return;
                const x = data.cell.x + 3;
                let y = data.cell.y + PAD_V + 2.9;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(...C.texto);
                doc.text(g.nome, x, y, { lineHeightFactor: 1.1 });
                y += g.nome.length * H_NOME;

                if (g.detalhe.length) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7.5);
                    doc.setTextColor(...C.textoFraco);
                    doc.text(g.detalhe, x, y, { lineHeightFactor: 1.12 });
                }
            },
        });

        // @ts-ignore — o plugin anexa isto ao doc
        let finalY = doc.lastAutoTable.finalY;

        finalY += E.sm;

        // ── PERSONALIZAÇÕES ───────────────────────────────────────────────────
        const customizations = (budget.customizations || []) as BudgetCustomization[];
        if (customizations.length > 0) {
            if (finalY > pageHeight - 50) { doc.addPage(); finalY = 15; }
            finalY = this.tituloSecao(doc, 'PERSONALIZAÇÕES', marginX, finalY, contentWidth) - 3;

            const custRows = customizations.map(c => [
                this.translateCustType(c.type),
                c.description || '-',
                c.position || '-',
                c.quantity.toString(),
                formatCurrency(c.unit_price),
                formatCurrency(c.total)
            ]);
            autoTable(doc, {
                startY: finalY,
                head: [['Tipo', 'Descrição', 'Posição', 'Qtd', 'Unit.', 'Total']],
                body: custRows,
                theme: 'plain',
                tableWidth: contentWidth,
                headStyles: { fillColor: [39, 39, 42], textColor: 255, fontStyle: 'bold', cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, fontSize: 7.5 },
                bodyStyles: { cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, fontSize: 7.5, textColor: [50, 50, 50] },
                columnStyles: {
                    0: { cellWidth: 30, halign: 'left' },
                    1: { cellWidth: 60, halign: 'left' },
                    2: { cellWidth: 30, halign: 'left' },
                    3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                    4: { cellWidth: 22, halign: 'right' },
                    5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
                },
                margin: { left: marginX, right: marginX }
            });
            // @ts-ignore
            finalY = doc.lastAutoTable.finalY + 6;
        }

        // ── EXTRAS ────────────────────────────────────────────────────────────
        const extras = (budget.extras || []) as BudgetExtra[];
        if (extras.length > 0) {
            if (finalY > pageHeight - 40) { doc.addPage(); finalY = 15; }
            finalY = this.tituloSecao(doc, 'EXTRAS / SERVIÇOS', marginX, finalY, contentWidth) - 3;

            const extraRows = extras.map(e => [
                e.description || '-',
                e.quantity.toString(),
                formatCurrency(e.unit_price),
                formatCurrency(e.total)
            ]);
            autoTable(doc, {
                startY: finalY,
                head: [['Descrição', 'Qtd', 'Unit.', 'Total']],
                body: extraRows,
                theme: 'plain',
                tableWidth: contentWidth,
                headStyles: { fillColor: [39, 39, 42], textColor: 255, fontStyle: 'bold', cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, fontSize: 7.5 },
                bodyStyles: { cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, fontSize: 7.5, textColor: [50, 50, 50] },
                columnStyles: {
                    0: { halign: 'left' },
                    1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
                    2: { cellWidth: 28, halign: 'right' },
                    3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
                },
                margin: { left: marginX, right: marginX }
            });
            // @ts-ignore
            finalY = doc.lastAutoTable.finalY + 6;
        }

        // ── BOTTOM SECTION ────────────────────────────────────────────────────
        /**
         * O plano só entra no papel se FECHAR com o total.
         *
         * O plano é uma fotografia dos valores no dia em que foi montado, e o
         * orçamento continua sendo editado depois. Item novo, desconto, troca de
         * tecido: o total muda e as parcelas não. O PDF imprimia as duas coisas
         * lado a lado sem conferir, e saiu para cliente um orçamento com
         * "TOTAL: R$ 1.779,70" e um plano somando R$ 821,40 — o documento
         * discordando de si mesmo, com quase mil reais de diferença.
         *
         * Plano que não reconcilia é omitido: mandar número errado para o
         * cliente é pior do que mandar o pagamento "a combinar". A tela avisa
         * antes de gerar, e o editor oferece o ajuste com um clique.
         */
        const planoConfere = conferirPlano(budget.payment_plan, budget.total_amount ?? 0).confere;
        const hasPlan = (budget.payment_plan?.length ?? 0) > 0 && planoConfere;
        // Os campos entrada/saldo envelhecem pelo mesmo motivo e com a mesma
        // consequência: se não somam o total, também ficam de fora.
        const entradaMaisSaldo = (budget.down_payment_value ?? 0) + (budget.delivery_payment_value ?? 0);
        const camposConferem = Math.abs(entradaMaisSaldo - (budget.total_amount ?? 0)) < 0.01;
        // Só destaca como "entrada" a 1ª parcela que a condição lê como entrada: num 30/60 ela é só a primeira.
        const primeiraEhEntrada = hasPlan && (budget.payment_plan![0].amount ?? 0) > 0
            && !!descreverCondicao(budget, getTodayStr()).parcelas[0]?.naConfirmacao;
        const hasPaymentInfo = !hasPlan && entradaMaisSaldo > 0 && camposConferem;
        const hasNotes = !!(budget.notes && budget.notes.trim());

        const deliveryDays = budget.delivery_time_days || 20;
        const estimatedDate = addBusinessDays(budget.date || '', deliveryDays);

        // ── Layout variables ──────────────────────────────────────────────────
        const halfW = (contentWidth - 4) / 2;
        const notesW = halfW;

        // Subtotal / discount values
        const subItems = budget.subtotal_items ?? 0;
        const subCustom = budget.subtotal_customizations ?? 0;
        const subExtras = budget.subtotal_extras ?? 0;
        const discountAmt = budget.discount ?? 0;
        const totalsDetailRows = (subItems > 0 ? 1 : 0)
            + (subCustom > 0 ? 1 : 0)
            + (subExtras > 0 ? 1 : 0)
            + (discountAmt > 0 ? 1 : 0);
        const ROW = 6.5;

        // Combined totals + payment box height
        const totalsH = 6
            + totalsDetailRows * ROW
            + (totalsDetailRows > 0 ? 3 : 0)
            + 15                                 // TOTAL row (11pt) + gap
            + (hasPlan
                ? 5 + (budget.payment_plan!.length * 9)
                : (hasPaymentInfo ? 5 + ((budget.down_payment_value ?? 0) > 0 ? 9 : 0) + ((budget.delivery_payment_value ?? 0) > 0 ? 9 : 0) : 0))
            + 4;

        // Bank info box height
        const banco = dadosBancariosDoOrcamento(companyProfile || {});
        // Mesmos passos do desenho, e com o TOTAL dentro (ver alturaDoQuadroBancario).
        const bankH = alturaDoQuadroBancario(banco);

        const boxH = Math.max(totalsH, bankH);

        // Notes height estimate for page-break check
        let notesBoxH = 0;
        if (hasNotes) {
            const nl = doc.splitTextToSize(budget.notes!.trim(), notesW - 6);
            notesBoxH = nl.length * 4 + 12;
        }
        const totalSectionH = 8 + (hasNotes ? notesBoxH + 4 : 0) + boxH + 8;

        if (finalY + totalSectionH > pageHeight - 15) { doc.addPage(); finalY = 15; }

        // ── DELIVERY + NOTES (above the two boxes) ────────────────────────────
        let lY = finalY + 6;
        doc.setFontSize(8);
        doc.setFont("helvetica", 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text("Entrega estimada: ", marginX, lY);
        doc.setFont("helvetica", 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`${deliveryDays} dias úteis (${formatDate(estimatedDate)})`, marginX + doc.getTextWidth("Entrega estimada: "), lY);
        lY += 7;

        if (hasNotes) {
            const noteLines = doc.splitTextToSize(budget.notes!.trim(), notesW - 6);
            const nb = noteLines.length * 4 + 12;
            doc.setFillColor(...C.amberFundo);
            doc.setDrawColor(...C.amberBorda);
            doc.setLineWidth(0.3);
            doc.roundedRect(marginX, lY, notesW, nb, 1, 1, 'FD');
            this.etiqueta(doc, 'Observações', marginX + 3, lY + 4.5, { tamanho: 6.5 });
            doc.setFont("helvetica", 'normal');
            doc.setTextColor(80, 50, 0);
            doc.text(noteLines, marginX + 3, lY + 9);
            lY += nb + 5;
        }

        // ── BOTTOM ROW: Totals+Payment (left) | Bank Info (right) ────────────
        const boxY = lY;
        const bankX = marginX + halfW + 4;

        // ── LEFT BOX: Totals + Payment ────────────────────────────────────────
        doc.setFillColor(...C.superficie);
        doc.setDrawColor(...C.borda);
        doc.setLineWidth(0.3);
        doc.roundedRect(marginX, boxY, halfW, boxH, 1, 1, 'FD');

        let tY = boxY + 7;
        doc.setFontSize(7.5);
        doc.setFont("helvetica", 'normal');
        doc.setTextColor(80, 80, 80);

        if (subItems > 0) {
            doc.text("Subtotal Itens:", marginX + 4, tY);
            doc.text(formatCurrency(subItems), marginX + halfW - 4, tY, { align: 'right' });
            tY += ROW;
        }
        if (subCustom > 0) {
            doc.text("Personalizações:", marginX + 4, tY);
            doc.text(formatCurrency(subCustom), marginX + halfW - 4, tY, { align: 'right' });
            tY += ROW;
        }
        if (subExtras > 0) {
            doc.text("Extras:", marginX + 4, tY);
            doc.text(formatCurrency(subExtras), marginX + halfW - 4, tY, { align: 'right' });
            tY += ROW;
        }
        if (discountAmt > 0) {
            doc.setTextColor(180, 30, 30);
            doc.setFont("helvetica", 'italic');
            doc.text("Desconto:", marginX + 4, tY);
            doc.text(`- ${formatCurrency(discountAmt)}`, marginX + halfW - 4, tY, { align: 'right' });
            tY += ROW;
            doc.setFont("helvetica", 'normal');
            doc.setTextColor(80, 80, 80);
        }

        // Separator before TOTAL
        if (totalsDetailRows > 0) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            doc.line(marginX + 3, tY, marginX + halfW - 3, tY);
            tY += 4;
        }

tY += 5;

        // Payment rows — plano (Fase 7) tem prioridade; senão, divisão simples.
        if (hasPlan) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            doc.line(marginX + 3, tY, marginX + halfW - 3, tY);
            tY += 5;

            budget.payment_plan!.forEach((inst, i) => {
                if (i === 0 && primeiraEhEntrada) {
                    // Primeira parcela (entrada) destacada em dourado
                    doc.setFillColor(...C.amber);
                    doc.roundedRect(marginX + 2, tY - 3.5, halfW - 4, 7.5, 1, 1, 'F');
                    doc.setFont("helvetica", 'bold');
                    doc.setTextColor(0, 0, 0);
                } else {
                    doc.setFont("helvetica", 'normal');
                    doc.setTextColor(50, 50, 50);
                }
                doc.setFontSize(7.5);
                const parts: string[] = [inst.label];
                if (inst.method) parts.push(inst.method);
                if (inst.due) parts.push(inst.due.split('-').reverse().join('/'));
                doc.text(parts.join(' · '), marginX + 5, tY + 0.5);
                doc.text(formatCurrency(inst.amount), marginX + halfW - 4, tY + 0.5, { align: 'right' });
                tY += 9;
            });
        } else if (hasPaymentInfo) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            doc.line(marginX + 3, tY, marginX + halfW - 3, tY);
            tY += 5;

            if ((budget.down_payment_value ?? 0) > 0) {
                // Gold highlighted entrada row
                doc.setFillColor(...C.amber);
                doc.roundedRect(marginX + 2, tY - 3.5, halfW - 4, 7.5, 1, 1, 'F');
                doc.setFontSize(8);
                doc.setFont("helvetica", 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(`Entrada (${budget.down_payment_percent ?? 0}%)`, marginX + 5, tY + 0.5);
                doc.text(formatCurrency(budget.down_payment_value), marginX + halfW - 4, tY + 0.5, { align: 'right' });
                tY += 9;
            }
            if ((budget.delivery_payment_value ?? 0) > 0) {
                doc.setFontSize(8);
                doc.setFont("helvetica", 'normal');
                doc.setTextColor(50, 50, 50);
                doc.text("Restante na entrega:", marginX + 5, tY + 0.5);
                doc.text(formatCurrency(budget.delivery_payment_value), marginX + halfW - 4, tY + 0.5, { align: 'right' });
            }
        }

        // ── RIGHT BOX: Dados para Pagamento & TOTAL ────────────────────────────
        if (true) { // Always show the total box as requested
            doc.setFillColor(...C.zinc950);
            doc.setDrawColor(50, 50, 55);
            doc.setLineWidth(0.3);
            doc.roundedRect(bankX, boxY, halfW, boxH, 1, 1, 'FD');

            // Sobre o preto, o amber entra cheio: é o contraste que o app usa.
            this.etiqueta(doc, 'Dados para pagamento', bankX + 4, boxY + 6, { tamanho: 8, cor: C.amber, espaco: 0.5 });

            doc.setDrawColor(70, 70, 75);
            doc.setLineWidth(0.2);
            doc.line(bankX + 3, boxY + 9, bankX + halfW - 3, boxY + 9);

            const Q = QUADRO_BANCARIO;
            let bY = boxY + Q.inicio;
            doc.setFontSize(9);
            if (banco.bank_name) {
                doc.setFont("helvetica", 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(banco.bank_name, bankX + 4, bY);
                doc.setFont("helvetica", 'normal');
                doc.setTextColor(180, 180, 180);
                bY += Q.linha;
            }
            if (banco.agency || banco.account_number) {
                doc.text(`Ag: ${banco.agency || '-'}  CC: ${banco.account_number || '-'}`, bankX + 4, bY);
                bY += Q.linha;
            }
            if (banco.holder) {
                doc.text(`Titular: ${banco.holder}`, bankX + 4, bY);
                bY += Q.linha;
            }
            if (banco.pix_key) {
                doc.setFontSize(8.5);
                doc.setFont("helvetica", 'bold');
                doc.setTextColor(...C.amber);
                doc.text("PIX  ", bankX + 4, bY);
                doc.setFont("helvetica", 'normal');
                doc.setTextColor(255, 255, 255);
                doc.text(banco.pix_key, bankX + 4 + doc.getTextWidth("PIX  "), bY);
                bY += Q.pix;
            }

            // TOTAL MOVED HERE
            doc.setDrawColor(234, 179, 8);
            doc.setLineWidth(0.5);
            doc.line(bankX + 3, bY - 2, bankX + halfW - 3, bY - 2);
            
            doc.setFontSize(14);
            doc.setFont("helvetica", 'bold');
            doc.setTextColor(...C.amber);
            doc.text("TOTAL:", bankX + 4, bY + Q.baseDoTotal);
            doc.setTextColor(255, 255, 255);
            doc.text(formatCurrency(budget.total_amount), bankX + halfW - 4, bY + Q.baseDoTotal, { align: 'right' });
        }

        // A seção de totais/pagamento desenha com cursores próprios (lY, boxY, tY)
        // e nunca devolvia onde terminou, deixando finalY parado lá em cima. O
        // campo de referências começava por cima das caixas. Aqui finalY volta a
        // apontar para o rodapé real do que foi desenhado.
        finalY = Math.max(finalY, boxY + boxH);

        // ── REFERÊNCIAS ───────────────────────────────────────────────────────
        //
        // Sempre no FIM do orçamento, como campo próprio emoldurado. Entram por
        // padrão: o cliente mandou estas imagens, e vê-las junto da proposta
        // evita a discussão de "não era isso".
        //
        // O campo é PAGINADO. A versão anterior calculava a altura de todas as
        // fotos juntas e desenhava de uma vez, supondo que caberia numa folha —
        // premissa que valia com células pequenas e deixou de valer quando elas
        // passaram a ocupar meia página. Da quinta foto em diante o campo tinha
        // 355 mm numa folha de 297 mm, e a terceira fileira era desenhada
        // abaixo do fim da página: sumia do arquivo sem erro nem aviso.
        if (photoDataUris && photoDataUris.length > 0) {
            // Duas colunas em retrato: em três, cada foto ficava com um terço da
            // largura — tamanho de selo, no qual não se confere costura,
            // acabamento nem tonalidade, que é para o que a foto existe.
            const grade = montarGrade(contentWidth);
            const nFotos = photoDataUris.length;

            const FOLGA = 10;      // respiro depois do bloco de totais
            const RODAPE = 16;
            const TOPO_NOVA = 18;

            const blocos = paginarFotos(nFotos, grade, {
                agora: (pageHeight - RODAPE) - (finalY + FOLGA),
                emPaginaNova: (pageHeight - RODAPE) - TOPO_NOVA,
            });

            for (const bloco of blocos) {
                if (bloco.novaPagina) {
                    doc.addPage();
                    finalY = TOPO_NOVA;
                } else {
                    finalY += FOLGA;
                }
                const topo = finalY;

                // Moldura do campo, no estilo dos cartões do app.
                doc.setFillColor(...C.superficie);
                doc.setDrawColor(...C.linha);
                doc.setLineWidth(0.4);
                doc.roundedRect(marginX, topo, contentWidth, bloco.altura, 1.5, 1.5, "FD");
                // Marcador amber na borda superior, como o filete das seções.
                doc.setFillColor(...C.amber);
                doc.rect(marginX, topo, 26, 0.9, "F");

                const continuacao = bloco.inicio > 0;
                this.etiqueta(doc, continuacao ? "Referências (cont.)" : "Referências",
                    marginX + grade.recheio, topo + 5.4, { tamanho: 7.5 });

                doc.setFont("helvetica", "normal");
                doc.setFontSize(6.5);
                doc.setTextColor(...C.textoFraco);
                // Numera a fatia quando há mais de uma: "3–4 de 6" diz de cara
                // que faltam fotos nesta folha, em vez de deixar parecer que o
                // orçamento tinha só estas.
                const legenda = blocos.length > 1
                    ? `${bloco.inicio + 1}–${bloco.inicio + bloco.quantidade} de ${nFotos} imagens aprovadas`
                    : (nFotos > 1 ? `${nFotos} imagens aprovadas pelo cliente` : '1 imagem aprovada pelo cliente');
                doc.text(legenda, marginX + contentWidth - grade.recheio, topo + 5.4, { align: 'right' });

                const posicoes = posicoesDoBloco(grade, bloco, contentWidth);
                posicoes.forEach((pos, i) => {
                    const dataUri = photoDataUris[bloco.inicio + i];
                    const fx = marginX + pos.x;
                    const fy = topo + pos.y;
                    try {
                        // Encaixe preservando a proporção, centralizado na sobra.
                        const prop = doc.getImageProperties(dataUri);
                        const escala = Math.min(grade.larguraDaCelula / prop.width,
                            grade.alturaDaCelula / prop.height);
                        const w = prop.width * escala;
                        const h = prop.height * escala;
                        doc.addImage(dataUri,
                            fx + (grade.larguraDaCelula - w) / 2,
                            fy + (grade.alturaDaCelula - h) / 2,
                            w, h, undefined, "FAST");
                    } catch {
                        // Formato que o jsPDF não decodifica (HEIC do iPhone, por
                        // exemplo). Uma foto ilegível não pode custar o orçamento.
                        doc.setFontSize(6);
                        doc.setFont("helvetica", "normal");
                        doc.setTextColor(...C.textoFraco);
                        doc.text("formato não suportado", fx + 2, fy + grade.alturaDaCelula / 2);
                    }
                    // Moldura na célula, não na imagem: mantém a grade alinhada
                    // mesmo com fotos de proporções diferentes.
                    doc.setDrawColor(...C.linha);
                    doc.setLineWidth(0.25);
                    doc.rect(fx, fy, grade.larguraDaCelula, grade.alturaDaCelula);
                });

                finalY = topo + bloco.altura;
            }
        }

        doc.save(`Orcamento_${budget.serial_number}.pdf`);
    }

    /**
     * FICHA DE CORTE — instrumento de trabalho do corte, não resumo do pedido.
     *
     * Organizada por ENFESTO (tecido + cor), porque é assim que a mesa funciona:
     * abre-se um tecido por vez. Cada bloco traz a grade de tamanhos com a meta e
     * três colunas para registrar cortes parciais, já que raramente se corta tudo
     * de uma vez. A coluna FALTA fica sempre no mesmo lugar, para o cortador não
     * precisar somar de cabeça a cada retomada.
     *
     * Traço fino e sem áreas chapadas: a folha sai em toda ordem de produção,
     * então tinta é custo recorrente.
     */
    public generateOrderProductionPDF(
        order: Order,
        client: Client,
        products: Product[],
        _companyProfile?: CompanyProfile | null,
        budgetRef?: string,
        opts?: {
            /** Fotos de referência já em data URI; anexadas em folha própria. */
            photoDataUris?: string[];
        },
    ) {
        const doc = new jsPDF();
        const PAGE_W = 210, PAGE_H = 297;
        // Margens na escala de 2 mm (ver PdfService.ESPACO). A esquerda é a
        // exceção deliberada: 22 mm abrigam os furos do fichário, e a folha
        // vive perfurada numa pasta na mesa de corte.
        const E = PdfService.ESPACO;
        const ML = 22, MR = E.md * 2, MT = E.lg + E.xs, MB = E.xl + E.xs;
        const CW = PAGE_W - ML - MR;
        const GAP = E.sm;
        const COL_W = (CW - GAP) / 2;

        // Furos do fichário: padrão de furador de 2 furos, 80 mm entre centros,
        // centralizados na altura da folha.
        const furos = () => {
            doc.setDrawColor(160);
            doc.setLineWidth(0.2);
            doc.circle(11, PAGE_H / 2 - 40, 2.6);
            doc.circle(11, PAGE_H / 2 + 40, 2.6);
        };

        const centro = (txt: string, cx: number, baseY: number) => {
            doc.text(txt, cx - doc.getTextWidth(txt) / 2, baseY);
        };
        const direita = (txt: string, rx: number, baseY: number) => {
            doc.text(txt, rx - doc.getTextWidth(txt), baseY);
        };

        const itens = (order.items || []).map(it => {
            const p = products.find(x => x.id === it.product_id);
            return {
                product_name: p?.name || it.product_name,
                model: it.model,
                components: it.components,
                quantity: Number(it.quantity) || 0,
                size: it.size,
                fabric_name: it.fabric_name,
                fabric: it.fabric,
                color: it.color,
                sleeve_type: it.sleeve_type,
                gender: it.gender,
                fit: it.fit,
                has_band: it.has_band,
                prod_notes: it.prod_notes,
            };
        });
        const ficha = buildCuttingSheet(itens);

        furos();
        let y = MT;

        // CABECALHO
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(0);
        doc.text('FICHA DE CORTE', ML, y + 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(60);
        direita(`entrega ${formatDate(order.deadline || '')}   ·   ${ficha.totalPieces} pc`, PAGE_W - MR, y + 4);
        y += 6;

        doc.setDrawColor(60);
        doc.setLineWidth(0.4);
        doc.line(ML, y, PAGE_W - MR, y);
        y += 4.5;

        doc.setFontSize(9.5);
        doc.setTextColor(0);
        doc.text((client?.company_name || '').toUpperCase(), ML, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        direita(`#${order.order_number}`, PAGE_W - MR, y);
        doc.setFont('helvetica', 'normal');
        y += 5;

        // BLOCOS DE ENFESTO (2 por linha)
        //
        // A linha de especificacao E a ficha tecnica: modelo, manga, genero,
        // modelagem e faixa. Por isso ela nao pode ser truncada — a altura do
        // bloco cresce conforme o texto, em vez de esconder o que nao cabe.
        // Altura das faixas do bloco. A linha da grade NÃO segue a escala: ela
        // é dimensionada para caber caneta — o cortador escreve a quantidade à
        // mão nas colunas 1o/2o/3o, e menos de 7 mm não dá para escrever.
        const H_TH = E.sm + 1;     // cabeçalho da grade
        const H_LIN = 7.2;         // linha de tamanho, medida da caneta
        const H_PE = E.sm + 0.6;   // rodapé de assinatura

        // ── Cabeçalho do bloco: COR primeiro, tecido depois ──────────────────
        //
        // A cor vem em cima e maior porque é ela que identifica o rolo a abrir.
        // Antes o cabeçalho era uma linha só, "TECIDO / COR", cortada no que
        // coubesse — e como os tecidos daqui têm nome longo ("MALHA PV ANTI
        // PILLING (GUIMATEX 167)"), a cor era exatamente o pedaço que sumia.
        // Dois blocos do mesmo tecido em cores diferentes saíam idênticos na
        // folha, e a cor só reaparecia na conferência, depois de cortado.
        const F_COR = 11, F_TECIDO = 8;
        const H_COR = E.sm + 1.6;
        // Espaço reservado ao número total, à direita da cor.
        const W_TOTAL = E.xl + E.xs;

        const tecidoLinhas = (enf: (typeof ficha.enfestos)[0]): string[] => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(F_TECIDO);
            return doc.splitTextToSize(enf.fabric.toUpperCase(), COL_W - 4) as string[];
        };
        const alturaCabecalho = (enf: (typeof ficha.enfestos)[0]) =>
            H_COR + tecidoLinhas(enf).length * 3.4 + 1.6;

        // A ficha e lida em pe, na mesa de corte, com a folha ja amassada. As
        // fontes daqui sao as menores do documento, entao qualquer economia de
        // espaco sai do que a fabrica consegue ler.
        const F_SPEC = 8.5;
        const specLinhas = (enf: (typeof ficha.enfestos)[0]): string[] => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(F_SPEC);
            return doc.splitTextToSize(enf.spec || '-', COL_W - 4) as string[];
        };
        const alturaSpec = (enf: (typeof ficha.enfestos)[0]) => specLinhas(enf).length * 3.8 + 1.8;
        const alturaBloco = (enf: (typeof ficha.enfestos)[0]) =>
            alturaCabecalho(enf) + alturaSpec(enf) + H_TH + enf.rows.length * H_LIN + H_PE;

        const desenhaBloco = (enf: (typeof ficha.enfestos)[0], x: number, topo: number) => {
            const h = alturaBloco(enf);
            const hCab = alturaCabecalho(enf);
            const hSpec = alturaSpec(enf);

            doc.setDrawColor(70);
            doc.setLineWidth(0.35);
            doc.rect(x, topo, COL_W, h);

            let by = topo;

            // COR — o que identifica o rolo. Encurtar aqui é o último recurso,
            // e mesmo assim sobra o suficiente para distinguir dois blocos.
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(F_COR);
            doc.setTextColor(0);
            const cor = doc.splitTextToSize(enf.color.toUpperCase(), COL_W - E.sm - W_TOTAL)[0];
            doc.text(cor, x + 2, by + 4.4);
            doc.setFontSize(12);
            direita(String(enf.total), x + COL_W - 2, by + 4.4);
            by += H_COR;

            // TECIDO — quebra em quantas linhas precisar, nada some.
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(F_TECIDO);
            doc.setTextColor(55);
            doc.text(tecidoLinhas(enf), x + 2, by + 2.8, { lineHeightFactor: 1.2 });

            by = topo + hCab;
            doc.setDrawColor(70);
            doc.setLineWidth(0.35);
            doc.line(x, by, x + COL_W, by);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(F_SPEC);
            doc.setTextColor(40);
            doc.text(specLinhas(enf), x + 2, by + 3.4, { lineHeightFactor: 1.25 });
            by += hSpec;
            doc.setDrawColor(170);
            doc.setLineWidth(0.15);
            doc.line(x, by, x + COL_W, by);

            const W_TAM = 10, W_META = 12, W_FALTA = 13;
            const W_CORTE = (COL_W - W_TAM - W_META - W_FALTA) / 3;
            const xs = [
                x,
                x + W_TAM,
                x + W_TAM + W_META,
                x + W_TAM + W_META + W_CORTE,
                x + W_TAM + W_META + W_CORTE * 2,
                x + COL_W - W_FALTA,
            ];

            doc.setFontSize(7);
            doc.setTextColor(90);
            centro('TAM', xs[0] + W_TAM / 2, by + 3.4);
            centro('META', xs[1] + W_META / 2, by + 3.4);
            centro('1o', xs[2] + W_CORTE / 2, by + 3.4);
            centro('2o', xs[3] + W_CORTE / 2, by + 3.4);
            centro('3o', xs[4] + W_CORTE / 2, by + 3.4);
            centro('FALTA', xs[5] + W_FALTA / 2, by + 3.4);
            by += H_TH;
            doc.line(x, by, x + COL_W, by);

            const fimLinhas = by + enf.rows.length * H_LIN;
            doc.setDrawColor(170);
            doc.setLineWidth(0.15);
            for (let i = 1; i < 5; i++) doc.line(xs[i], by - H_TH, xs[i], fimLinhas);
            // A divisa da coluna FALTA e mais forte: e onde o olho pousa.
            doc.setDrawColor(70);
            doc.setLineWidth(0.35);
            // Começa no topo da linha de cabeçalho da grade, NÃO no topo da
            // especificação: subindo até lá ela atravessava o texto do modelo,
            // que quebra em duas linhas quando o nome é comprido ("PLATAFORMA -
            // CALÇA BEGE ESCURO") e ficava cortado ao meio pela divisa.
            doc.line(xs[5], by - H_TH, xs[5], fimLinhas);

            enf.rows.forEach((linha, i) => {
                const ly = by + i * H_LIN;
                if (i > 0) {
                    doc.setDrawColor(170);
                    doc.setLineWidth(0.15);
                    doc.line(x, ly, x + COL_W, ly);
                }
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.setTextColor(0);
                centro(linha.size, xs[0] + W_TAM / 2, ly + 5.2);
                centro(String(linha.qty), xs[1] + W_META / 2, ly + 5.2);
            });

            by = fimLinhas;
            doc.setDrawColor(70);
            doc.setLineWidth(0.35);
            doc.line(x, by, x + COL_W, by);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(90);
            doc.text('fim ___/___   cortador ____________   sobra ______', x + 2, by + 3.2);

            return h;
        };

        const alturaMaxima = PAGE_H - MB;
        let col = 0;
        let linhaTopo = y;
        let alturaLinha = 0;

        for (const enf of ficha.enfestos) {
            const h = alturaBloco(enf);
            if (col === 0 && linhaTopo + h > alturaMaxima - 45) {
                doc.addPage();
                furos();
                linhaTopo = MT;
                alturaLinha = 0;
            }
            desenhaBloco(enf, ML + col * (COL_W + GAP), linhaTopo);
            alturaLinha = Math.max(alturaLinha, h);
            col++;
            if (col === 2) {
                col = 0;
                linhaTopo += alturaLinha + GAP;
                alturaLinha = 0;
            }
        }
        if (col === 1) linhaTopo += alturaLinha + GAP;
        y = linhaTopo;

        const quebraSePreciso = (necessario: number) => {
            if (y + necessario > alturaMaxima) {
                doc.addPage();
                furos();
                y = MT;
            }
        };

        // ADICIONAIS (personalizacoes + extras do orcamento) + FOTOS DE REFERENCIA
        //
        // Cada linha carrega a QUANTIDADE. Antes os extras iam soltos no meio das
        // observacoes sem numero, e quem produz precisava adivinhar se eram 50
        // sacos ou 120.
        const adicionais = buildAdicionais(order.customizations, order.extras);
        const fotos = ((order as unknown as { reference_photos?: unknown[] }).reference_photos) || [];
        const temFotos = fotos.length > 0;

        if (adicionais.length > 0 || temFotos) {
            const H_AD = 4.6;
            const larguraLista = temFotos ? CW - 48 : CW;
            const h = Math.max(temFotos ? 13 : 8, 5.5 + adicionais.length * H_AD + 1.5);
            quebraSePreciso(h + 3);

            if (adicionais.length > 0) {
                doc.setDrawColor(120);
                doc.setLineWidth(0.3);
                doc.rect(ML, y, larguraLista, h);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6);
                doc.setTextColor(110);
                doc.text('ADICIONAIS', ML + 2, y + 3);
                direita('QTD', ML + larguraLista - 3, y + 3);
                doc.setDrawColor(200);
                doc.setLineWidth(0.15);
                doc.line(ML, y + 4.2, ML + larguraLista, y + 4.2);

                const xTipo = ML + 2;
                const xDesc = ML + 24;
                const xQtd = ML + larguraLista - 3;
                adicionais.forEach((ad, i) => {
                    const ly = y + 5.5 + i * H_AD;
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6.4);
                    doc.setTextColor(70);
                    doc.text(ad.tipo, xTipo, ly + 2.6);

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7.4);
                    doc.setTextColor(0);
                    const desc = ad.local ? `${ad.descricao}  ·  ${ad.local}` : ad.descricao;
                    doc.text(doc.splitTextToSize(desc, larguraLista - 24 - 16)[0], xDesc, ly + 2.6);

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.8);
                    direita(ad.quantidade > 0 ? String(ad.quantidade) : '-', xQtd, ly + 2.6);
                });
            }

            if (temFotos) {
                const fx = ML + CW - 46;
                doc.setDrawColor(140);
                doc.setLineWidth(0.25);
                doc.setLineDashPattern([1, 1], 0);
                doc.rect(fx, y, 46, h);
                doc.setLineDashPattern([], 0);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(0);
                doc.text(`${fotos.length} foto${fotos.length > 1 ? 's' : ''} de ref.`, fx + 3, y + 5);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6);
                doc.setTextColor(110);
                doc.text(doc.splitTextToSize('anexadas ao orcamento — consultar no sistema antes de aplicar', 40),
                    fx + 3, y + 8.6);
            }
            y += h + 3;
        }

        /**
         * Bloco de avisos, linha a linha e com recuo preservado.
         *
         * Antes tudo virava UM paragrafo: as observacoes dos itens eram unidas
         * por um separador e jogadas no splitTextToSize. Observacao curta
         * passava; observacao longa, ou escrita como lista, chegava a mesa de
         * corte como um bloco corrido — o texto estava la e ninguem lia.
         *
         * Agora cada linha e desenhada por conta propria, o recuo vira
         * deslocamento de x (indentacao de verdade, alinhada) e o bloco quebra
         * entre paginas em vez de estourar a folha.
         */
        const RECUO_MM = 4;
        const H_LINHA = 3.7;

        const desenharAvisos = (titulo: string, linhasBrutas: LinhaComRecuo[]) => {
            if (linhasBrutas.length === 0) return;

            // Cada linha ainda pode ser larga demais; a quebra respeita o recuo.
            const linhas: LinhaComRecuo[] = [];
            for (const l of linhasBrutas) {
                if (!l.texto) { linhas.push(l); continue; }
                const largura = CW - 6 - l.recuo * RECUO_MM;
                for (const pedaco of doc.splitTextToSize(l.texto, largura) as string[]) {
                    linhas.push({ texto: pedaco, recuo: l.recuo });
                }
            }

            // Fatia minima: um bloco de uma ou duas linhas encalhado no pe da
            // folha, com o resto na pagina seguinte, custa a leitura mais do que
            // economiza papel — quem le a ficha na mesa de corte perde o fio.
            // Sobrando menos que isto, o bloco inteiro comeca na proxima.
            const MINIMO_DE_LINHAS = 3;

            let i = 0;
            let primeiraFatia = true;
            while (i < linhas.length) {
                // Quantas linhas cabem no que sobrou da pagina.
                const disponivel = alturaMaxima - y - 8;
                let cabem = Math.floor((disponivel - 6.4) / H_LINHA);
                const restam = linhas.length - i;
                // A ultima fatia pode ser pequena: nao ha o que empurrar adiante.
                if (cabem < Math.min(MINIMO_DE_LINHAS, restam)) {
                    doc.addPage();
                    furos();
                    y = MT;
                    cabem = Math.floor((alturaMaxima - y - 8 - 6.4) / H_LINHA);
                }
                const fatia = linhas.slice(i, i + cabem);
                const h = fatia.length * H_LINHA + 5;

                doc.setDrawColor(70);
                doc.setLineWidth(1.2);
                doc.line(ML, y, ML, y + h);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6);
                doc.setTextColor(110);
                doc.text(primeiraFatia ? titulo : `${titulo} (CONT.)`, ML + 3, y + 2.9);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(0);
                fatia.forEach((l, k) => {
                    if (!l.texto) return;
                    doc.text(l.texto, ML + 3 + l.recuo * RECUO_MM, y + 6.4 + k * H_LINHA);
                });

                y += h + 3;
                i += fatia.length;
                primeiraFatia = false;
            }
        };

        // ATENCAO — so observacoes de producao. Os extras saem no bloco ADICIONAIS,
        // com quantidade; repeti-los aqui diluiria o aviso que precisa ser lido.
        const avisos: LinhaComRecuo[] = [];
        (order.items || [])
            .filter(i => i.prod_notes && i.prod_notes.trim())
            .forEach((i, indice) => {
                const p = products.find(x => x.id === i.product_id);
                if (indice > 0) avisos.push({ texto: '', recuo: 0 });
                const corpo = aparar(linhasComRecuo(i.prod_notes));
                const cabecalho = `${p?.name || 'Item'} (${i.size}):`;
                // Observacao de uma linha continua na mesma linha do item — nao
                // ha estrutura a preservar, e duas linhas so gastariam papel.
                if (corpo.length === 1 && corpo[0].recuo === 0) {
                    avisos.push({ texto: `${cabecalho} ${corpo[0].texto}`, recuo: 0 });
                } else {
                    avisos.push({ texto: cabecalho, recuo: 0 });
                    corpo.forEach(l => avisos.push({ texto: l.texto, recuo: l.recuo + 1 }));
                }
            });
        desenharAvisos('ATENCAO', avisos);

        // OBSERVACAO GERAL DE FABRICA — vale para o pedido inteiro, e por isso
        // vem depois dos avisos por item, com titulo proprio. Nunca sai no PDF
        // do cliente: foi escrita para quem corta.
        desenharAvisos('OBSERVACAO DE FABRICA',
            aparar(linhasComRecuo((order as { factory_notes?: string }).factory_notes)));

        // CONFERENCIA FINAL
        const sizes = ficha.sizes;
        const wConf = 12, wTotal = 15;
        const wSize = sizes.length > 0 ? Math.min(13, Math.max(7, (CW * 0.45) / sizes.length)) : 0;
        const wLabel = CW - sizes.length * wSize - wTotal - wConf;
        const H_CL = 5.4;
        const alturaConf = 5 + 4 + (ficha.conferencia.length + 1) * H_CL + 6;
        quebraSePreciso(alturaConf);

        doc.setDrawColor(70);
        doc.setLineWidth(0.35);
        doc.rect(ML, y, CW, alturaConf);
        let cy = y;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(0);
        doc.text('CONFERENCIA FINAL', ML + 2, cy + 3.6);
        cy += 5;

        const xTotal = ML + wLabel + sizes.length * wSize;
        const xConf = xTotal + wTotal;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(110);
        sizes.forEach((s, i) => centro(s, ML + wLabel + i * wSize + wSize / 2, cy + 2.8));
        centro('TOTAL', xTotal + wTotal / 2, cy + 2.8);
        centro('CONF.', xConf + wConf / 2, cy + 2.8);
        cy += 4;
        doc.setDrawColor(170);
        doc.setLineWidth(0.15);
        doc.line(ML, cy, ML + CW, cy);

        const fimConf = cy + (ficha.conferencia.length + 1) * H_CL;
        doc.setDrawColor(70);
        doc.setLineWidth(0.35);
        doc.line(xTotal, cy - 4, xTotal, fimConf);

        ficha.conferencia.forEach((linha, i) => {
            const ly = cy + i * H_CL;
            if (i > 0) {
                doc.setDrawColor(210);
                doc.setLineWidth(0.15);
                doc.line(ML, ly, ML + CW, ly);
            }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(0);
            doc.text(doc.splitTextToSize(linha.label, wLabel - 3)[0], ML + 2, ly + 3.7);
            sizes.forEach((s, j) => {
                const v = linha.bySize[s];
                if (v) centro(String(v), ML + wLabel + j * wSize + wSize / 2, ly + 3.7);
            });
            doc.setFont('helvetica', 'bold');
            centro(String(linha.total), xTotal + wTotal / 2, ly + 3.7);
            doc.setDrawColor(70);
            doc.setLineWidth(0.3);
            doc.rect(xConf + wConf / 2 - 1.8, ly + 1.5, 3.6, 3.6);
        });

        const lyTotal = cy + ficha.conferencia.length * H_CL;
        doc.setDrawColor(70);
        doc.setLineWidth(0.3);
        doc.line(ML, lyTotal, ML + CW, lyTotal);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(0);
        doc.text('TOTAL', ML + 2, lyTotal + 3.8);
        sizes.forEach((s, j) => {
            const v = ficha.totalBySize[s];
            if (v) centro(String(v), ML + wLabel + j * wSize + wSize / 2, lyTotal + 3.8);
        });
        doc.setFontSize(9.5);
        centro(String(ficha.totalPieces), xTotal + wTotal / 2, lyTotal + 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(110);
        doc.text('conferente __________________   data ___/___/______   divergencia ______________',
            ML + 2, fimConf + 4);

        // ── ANEXO: FOTOS DE REFERENCIA ───────────────────────────────────────
        //
        // Mesma grade do PDF do orcamento (utils/gradeDeFotos), pela mesma
        // razao: em coluna estreita a foto vira selo, e nao se confere costura,
        // acabamento nem tonalidade num selo. Aqui pesa ainda mais — esta e a
        // folha que fica na mesa de corte, e a foto E o gabarito.
        //
        // Tres coisas que a versao anterior nao fazia:
        //   1. FUROS. A folha vive perfurada numa pasta, e todas as outras
        //      paginas ganham as marcas do furador. As de foto nao ganhavam —
        //      perfurar no lugar errado atravessa a imagem.
        //   2. Titulo na continuacao. Da terceira foto em diante o anexo virava
        //      pagina de imagens soltas, sem dizer de que pedido eram.
        //   3. Contagem. Sem "3-4 de 6", quem recebe a folha nao tem como saber
        //      que existem outras fotos noutra pagina.
        if (opts?.photoDataUris && opts.photoDataUris.length > 0) {
            const fotos = opts.photoDataUris;
            const grade = montarGrade(CW);
            const H_CABECALHO = 13;   // titulo do anexo + numero do pedido

            const abrirFolha = (primeira: boolean) => {
                doc.addPage();
                furos();
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.setTextColor(0);
                doc.text(primeira ? 'FOTOS DE REFERENCIA' : 'FOTOS DE REFERENCIA (CONT.)', ML, MT + 4);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(120);
                doc.text(`Pedido #${order.order_number}`, ML, MT + 9);
                return MT + H_CABECALHO;
            };

            // O anexo sempre comeca em folha propria, entao a primeira fatia ja
            // conta com a folha inteira menos o cabecalho.
            const disponivel = alturaMaxima - (MT + H_CABECALHO);
            const blocos = paginarFotos(fotos.length, grade, {
                agora: disponivel,
                emPaginaNova: disponivel,
            });

            let primeira = true;
            for (const bloco of blocos) {
                const topo = abrirFolha(primeira);
                primeira = false;

                // Moldura do campo, no cinza da ficha — a folha e impressa em
                // preto e branco na mesa de corte, entao cor aqui nao ajuda.
                doc.setDrawColor(120);
                doc.setLineWidth(0.3);
                doc.rect(ML, topo, CW, bloco.altura);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6);
                doc.setTextColor(110);
                doc.text('REFERENCIAS', ML + grade.recheio, topo + 4.4);
                if (blocos.length > 1) {
                    doc.setFont('helvetica', 'normal');
                    direita(`${bloco.inicio + 1}-${bloco.inicio + bloco.quantidade} de ${fotos.length}`,
                        ML + CW - grade.recheio, topo + 4.4);
                }

                posicoesDoBloco(grade, bloco, CW).forEach((pos, i) => {
                    const dataUri = fotos[bloco.inicio + i];
                    const fx = ML + pos.x;
                    const fy = topo + pos.y;
                    try {
                        // Encaixa preservando a proporcao — esticar deformava retrato.
                        const prop = doc.getImageProperties(dataUri);
                        const escala = Math.min(grade.larguraDaCelula / prop.width,
                            grade.alturaDaCelula / prop.height);
                        const w = prop.width * escala;
                        const h = prop.height * escala;
                        doc.addImage(dataUri,
                            fx + (grade.larguraDaCelula - w) / 2,
                            fy + (grade.alturaDaCelula - h) / 2,
                            w, h, undefined, 'FAST');
                    } catch {
                        // Uma foto ilegivel nao pode custar a ficha inteira.
                        doc.setFontSize(7);
                        doc.setTextColor(150);
                        doc.text('foto em formato nao suportado', fx + 4, fy + grade.alturaDaCelula / 2);
                    }
                    doc.setDrawColor(200);
                    doc.setLineWidth(0.2);
                    doc.rect(fx, fy, grade.larguraDaCelula, grade.alturaDaCelula);
                });
            }
        }

        // RODAPE — a referencia do orcamento vive aqui, discreta
        const totalPaginas = doc.getNumberOfPages();
        for (let p = 1; p <= totalPaginas; p++) {
            doc.setPage(p);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6);
            doc.setTextColor(130);
            const partes = [
                budgetRef ? `ref. orcamento ${budgetRef}` : '',
                `gerado em ${formatDate(new Date().toISOString())}`,
            ].filter(Boolean);
            doc.text(partes.join('   ·   '), ML, PAGE_H - 7);
            direita(`pag. ${p}/${totalPaginas}`, PAGE_W - MR, PAGE_H - 7);
        }

        doc.save(`FichaCorte_${order.order_number}.pdf`);
    }

    public generateExecutiveReport(
        dreData: DRELine[],
        periodStr: string,
        companyProfile: CompanyProfile | null,
        topExpenses: { name: string, value: number }[],
        kpis: { revenue: number, expenses: number, ebitda: number, result: number }
    ) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const date = new Date();
        const refId = `FIN-REP-${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        let currentY = this.drawHeader(doc, "RELATÓRIO EXECUTIVO", refId, "Emitido em", formatDate(date.toISOString()), companyProfile);

        // --- SCORECARD ---
        doc.setFillColor(...PdfService.COR.superficie);
        doc.setDrawColor(...PdfService.COR.borda);
        doc.roundedRect(14, currentY, pageWidth - 28, 25, 1, 1, 'FD');

        const colWidth = (pageWidth - 28) / 4;
        const labels = ['Receita Líquida', 'Total Despesas', 'EBITDA', 'Resultado Líquido'];
        const values = [kpis.revenue, kpis.expenses, kpis.ebitda, kpis.result];

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);

        labels.forEach((label, i) => {
            doc.text(label.toUpperCase(), 14 + (colWidth * i) + (colWidth / 2), currentY + 8, { align: 'center' });
        });

        doc.setFontSize(12);
        doc.setFont("helvetica", 'bold');
        doc.setTextColor(0, 0, 0);

        values.forEach((val, i) => {
            const text = formatCurrency(val);
            if (i === 3) doc.setTextColor(val >= 0 ? 0 : 200, val >= 0 ? 150 : 0, 0); // Green or Red for Result
            doc.text(text, 14 + (colWidth * i) + (colWidth / 2), currentY + 18, { align: 'center' });
            doc.setTextColor(0, 0, 0); // Reset
        });

        currentY += 35;

        // --- NEW SECTION: GOALS ANALYSIS (METAS) ---
        if (companyProfile?.revenue_goal || companyProfile?.expense_limit) {
            doc.setFontSize(11);
            doc.setTextColor(201, 162, 77); // Gold
            doc.text("ANÁLISE DE METAS (KPIs)", 14, currentY);
            currentY += 3;

            const goalBody = [];
            if (companyProfile.revenue_goal) {
                const pct = (kpis.revenue / companyProfile.revenue_goal) * 100;
                goalBody.push(['Faturamento Mensal', formatCurrency(kpis.revenue), formatCurrency(companyProfile.revenue_goal), percentual(pct)]);
            }
            if (companyProfile.expense_limit) {
                const pct = (kpis.expenses / companyProfile.expense_limit) * 100;
                goalBody.push(['Teto de Gastos', formatCurrency(kpis.expenses), formatCurrency(companyProfile.expense_limit), percentual(pct)]);
            }

            autoTable(doc, {
                startY: currentY,
                head: [['Indicador', 'Realizado', 'Meta / Limite', '% Atingido']],
                body: goalBody,
                theme: 'striped',
                headStyles: { fillColor: [50, 50, 50] },
                bodyStyles: { fontSize: 10 },
                columnStyles: { 3: { fontStyle: 'bold' } }
            });

            // @ts-ignore
            currentY = doc.lastAutoTable.finalY + 15;
        }

        // --- DRE TABLE ---
        doc.setFontSize(11);
        doc.setTextColor(201, 162, 77); // Gold
        doc.text("D.R.E - DEMONSTRAÇÃO DO RESULTADO", 14, currentY);
        currentY += 3;

        const tableBody = dreData.map(row => {
            const indent = row.level === 1 ? '' : row.level === 2 ? '   ' : '      ';
            const label = indent + row.label;
            const valStr = formatCurrency(row.value);
            const displayVal = row.is_deduction ? `(${valStr})` : valStr;
            const percentStr = row.percent !== undefined ? percentual(row.percent) : '-';
            return [label, percentStr, displayVal];
        });

        autoTable(doc, {
            startY: currentY,
            head: [['Descrição da Conta', 'A.V. %', 'Valor (R$)']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: [20, 20, 20],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                lineWidth: 0
            },
            styles: {
                cellPadding: 4,
                fontSize: 9,
                textColor: [50, 50, 50],
                lineColor: [230, 230, 230],
                lineWidth: 0.1
            },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 25, halign: 'center' },
                2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
            },
            didParseCell: (data) => {
                const rowIndex = data.row.index;
                const rowData = dreData[rowIndex];
                if (data.section === 'body' && rowData) {
                    if (rowData.is_total) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [245, 245, 245];
                    }
                    if (data.column.index === 2) {
                        if (rowData.is_deduction) data.cell.styles.textColor = [180, 0, 0];
                        if (rowData.label.includes('LUCRO LÍQUIDO') || rowData.label.includes('EBITDA')) {
                            data.cell.styles.textColor = rowData.value >= 0 ? [0, 120, 0] : [180, 0, 0];
                        }
                    }
                }
            }
        });

        // @ts-ignore
        let finalY = doc.lastAutoTable.finalY + 15;

        // --- TOP EXPENSES ---
        // Check space
        if (finalY + 60 > doc.internal.pageSize.getHeight()) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(11);
        doc.setTextColor(201, 162, 77);
        doc.text("PRINCIPAIS DESPESAS DO PERÍODO", 14, finalY);
        finalY += 5;

        const expenseRows = topExpenses.slice(0, 5).map(e => [e.name, formatCurrency(e.value)]);

        autoTable(doc, {
            startY: finalY,
            head: [['Categoria', 'Valor']],
            body: expenseRows,
            theme: 'striped',
            headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
            bodyStyles: { fontSize: 9 },
            columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
            margin: { right: pageWidth / 2 } // Half width table
        });

        // --- FOOTER NOTE WITH BANK INFO ---
        const pageHeight = doc.internal.pageSize.getHeight();
        let footerY = pageHeight - 20;

        if (companyProfile?.bank_name || companyProfile?.pix_key) {
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Dados Bancários: ${companyProfile.bank_name || ''} | AG: ${companyProfile.bank_agency || ''} CC: ${companyProfile.bank_account || ''} | PIX: ${companyProfile.pix_key || ''}`, 14, footerY - 5);
        }

        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("Este relatório foi gerado automaticamente pelo BOTEZINI ERP para fins de análise gerencial.", 14, footerY);

        doc.save(`Relatorio_Executivo_${periodStr}.pdf`);
    }

    // PCP — Lista de Compras semanal. Estoque zero (30/10): sem coluna de saldo, a sobra não abate.
    public generatePurchaseListPDF(
        lines: Array<{ insumo_name: string; unit: string; needed: number; in_stock: number; to_buy: number; unit_cost: number; est_cost: number }>,
        periodLabel: string,
        totalCost: number,
    ) {
        const doc = new jsPDF();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(20, 20, 20);
        doc.text('LISTA DE COMPRAS', 14, 20);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text(`Período: ${periodLabel}`, 14, 27);
        doc.text(`Gerado em ${formatDate(new Date().toISOString())}`, 14, 32);

        autoTable(doc, {
            startY: 38,
            head: [['Insumo', 'Necessário', 'Comprar', 'Custo unit.', 'Custo estimado']],
            // Linha nula na lista derrubava a exportação inteira com TypeError.
            // Um PDF é saída de relatório: não pode quebrar por causa de um
            // registro sujo — descarta a linha e imprime o resto.
            body: (lines || []).filter(Boolean).map(l => [
                l.insumo_name ?? '(insumo desconhecido)',
                `${l.needed ?? 0} ${l.unit ?? ''}`.trim(),
                l.to_buy > 0 ? `${l.to_buy} ${l.unit ?? ''}`.trim() : '-',
                formatCurrency(l.unit_cost),
                l.est_cost > 0 ? formatCurrency(l.est_cost) : '-',
            ]),
            foot: [['', '', '', 'Total a comprar', formatCurrency(totalCost)]],
            theme: 'striped',
            headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontSize: 8 },
            footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold' },
            bodyStyles: { fontSize: 8 },
            columnStyles: {
                1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
            },
        });

        doc.save(`Lista_Compras_${new Date().toISOString().slice(0, 10)}.pdf`);
    }
}

export const pdfService = new PdfService();
