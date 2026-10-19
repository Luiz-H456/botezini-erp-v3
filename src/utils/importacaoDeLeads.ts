// Importação de leads a partir de um CSV — ler, classificar, só então gravar.
//
// POR QUE NÃO GRAVA DIRETO
// Já existem dezenas de clientes cadastrados. Um CSV de prospecção comprado ou
// montado à mão vai trazer, inevitavelmente, empresas que já são clientes.
// Importá-las como leads cria um funil que mente: a taxa de conversão passa a
// contar quem já tinha convertido antes de a lista existir.
//
// O CASO QUE VALE OURO
// Filial de cliente existente, achada pela raiz do CNPJ. É a venda mais fácil de
// qualquer lista — a empresa já conhece o produto, já tem preço acordado, e a
// única pergunta é por que a outra unidade ainda não compra. Sem cruzar a raiz,
// ela entraria como uma linha igual a todas as outras.
//
// O QUE FOI EDITADO À MÃO NUNCA É SOBRESCRITO
// Quem corrigiu um telefone errado na tela não pode perder a correção por rodar
// a importação de novo. A reimportação preenche buraco; não repinta parede.
//
// Sem imports do app além de outro util puro, para ser testado direto.

import { soDigitos, raizDoCnpj } from './apelidosDeCliente.ts';

/** As colunas que o pré-prompt manda a IA produzir, nesta ordem. */
export const COLUNAS_ESPERADAS = [
    'razao_social', 'nome_fantasia', 'cnpj', 'segmento', 'porte_funcionarios',
    'cidade', 'uf', 'contato_nome', 'contato_cargo', 'telefone', 'email',
    'site', 'observacao',
    // As tres da fase 4. Entraram no FIM da lista de proposito: planilha antiga
    // continua importando sem elas, e os campos ficam vazios — que e o que
    // "nao informado" quer dizer.
    'capital_social', 'cnae_principal', 'data_abertura',
] as const;

/** Lista fechada de propósito: IA solta inventa categoria nova a cada arquivo. */
export const SEGMENTOS = [
    'saude', 'educacao', 'industria', 'alimentacao', 'construcao',
    'servicos', 'varejo', 'publico', 'outro',
] as const;

export type Segmento = typeof SEGMENTOS[number];

export interface LinhaBruta {
    [coluna: string]: string;
}

export interface LeadImportado {
    razao_social: string;
    nome_fantasia?: string;
    cnpj?: string;
    segmento?: string;
    porte_funcionarios?: number;
    capital_social?: number;
    cnae_principal?: string;
    data_abertura?: string;
    cidade?: string;
    uf?: string;
    contato_nome?: string;
    contato_cargo?: string;
    telefone?: string;
    email?: string;
    site?: string;
    notas?: string;
    origem?: string;
}

// ── 1. Ler o arquivo ────────────────────────────────────────────────────────

/**
 * Divide uma linha de CSV respeitando aspas.
 *
 * Escrito à mão e não com `split(',')` porque razão social com vírgula é a
 * regra, não a exceção: "MERCADO SÃO JOSÉ COMERCIO DE ALIMENTOS, LTDA" quebraria
 * em duas colunas e desalinharia a linha inteira — e o telefone acabaria no
 * campo do e-mail sem ninguém perceber.
 *
 * Aspas duplas dentro de campo entre aspas se escrevem dobradas ("" → ").
 */
export function dividirLinha(linha: string, separador = ','): string[] {
    const campos: string[] = [];
    let atual = '';
    let dentroDeAspas = false;

    for (let i = 0; i < linha.length; i++) {
        const c = linha[i];

        if (dentroDeAspas) {
            if (c === '"') {
                if (linha[i + 1] === '"') { atual += '"'; i++; }
                else dentroDeAspas = false;
            } else atual += c;
            continue;
        }

        if (c === '"') { dentroDeAspas = true; continue; }
        if (c === separador) { campos.push(atual); atual = ''; continue; }
        atual += c;
    }

    campos.push(atual);
    return campos.map(c => c.trim());
}

/**
 * Descobre o separador do arquivo.
 *
 * Excel em português salva CSV com ponto e vírgula, e é de lá que metade dos
 * arquivos vem. Adivinhar pelo cabeçalho custa nada e evita a importação que
 * traz tudo numa coluna só.
 */
export function detectarSeparador(cabecalho: string): string {
    const virgulas = (cabecalho.match(/,/g) || []).length;
    const pontos = (cabecalho.match(/;/g) || []).length;
    return pontos > virgulas ? ';' : ',';
}

export interface CsvLido {
    colunas: string[];
    linhas: LinhaBruta[];
    /** Colunas esperadas que o arquivo não trouxe. */
    faltando: string[];
    separador: string;
}

const normalizarColuna = (c: string) =>
    c.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');

/**
 * Lê o texto inteiro do CSV.
 *
 * Tolera BOM (o Excel põe), CRLF e linha em branco no fim. Não tolera campo com
 * quebra de linha dentro das aspas — é raro nesta origem, e suportá-lo exigiria
 * um leitor de estados que não se paga aqui.
 */
export function lerCsv(texto: string | null | undefined): CsvLido {
    const limpo = (texto || '').replace(/^\uFEFF/, '');
    const linhas = limpo.split(/\r?\n/).filter(l => l.trim() !== '');

    if (linhas.length === 0) {
        return { colunas: [], linhas: [], faltando: [...COLUNAS_ESPERADAS], separador: ',' };
    }

    const separador = detectarSeparador(linhas[0]);
    const colunas = dividirLinha(linhas[0], separador).map(normalizarColuna);

    const dados: LinhaBruta[] = [];
    for (let i = 1; i < linhas.length; i++) {
        const campos = dividirLinha(linhas[i], separador);
        const linha: LinhaBruta = {};
        colunas.forEach((col, j) => { linha[col] = campos[j] ?? ''; });
        dados.push(linha);
    }

    return {
        colunas,
        linhas: dados,
        faltando: COLUNAS_ESPERADAS.filter(c => !colunas.includes(c)),
        separador,
    };
}

// ── 2. Normalizar cada linha ────────────────────────────────────────────────

const texto = (v?: string) => (v || '').trim();

/**
 * CNPJ só vale se estiver completo.
 *
 * Catorze dígitos ou nada. Um CNPJ pela metade não cruza com cliente nenhum e
 * ainda ocupa o índice único, impedindo que a linha certa entre depois.
 */
export const cnpjValido = (v?: string | null): string | undefined => {
    const d = soDigitos(v);
    return d.length === 14 ? d : undefined;
};

/**
 * Capital social como a planilha manda: "1.500.000,00", "1500000", "R$ 250 mil"
 * — o que a IA devolve varia com o arquivo de origem.
 *
 * A regra do separador: se há vírgula, ela é o decimal e o ponto é milhar, que
 * é o padrão brasileiro. Sem vírgula, ponto isolado com três casas depois
 * TAMBÉM é milhar ("1.500" é mil e quinhentos, não um e meio) — o caso que uma
 * leitura ingênua erra por mil vezes.
 */
export function valorEmReais(v: string | undefined | null): number | undefined {
    const bruto = texto(v ?? undefined).replace(/[R$\s]/gi, '');
    if (!bruto) return undefined;

    let normalizado: string;
    if (bruto.includes(',')) {
        normalizado = bruto.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(bruto)) {
        normalizado = bruto.replace(/\./g, '');
    } else {
        normalizado = bruto;
    }

    const n = Number(normalizado);
    return Number.isFinite(n) ? n : undefined;
}

/** Data em ISO. Aceita 2020-05-14 e 14/05/2020, que é como o brasileiro digita. */
export function dataISO(v: string | undefined | null): string | undefined {
    const t = texto(v ?? undefined);
    if (!t) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return undefined;
}

/** Converte a linha bruta no que vai para o banco. Nada é inventado. */
export function normalizarLinha(linha: LinhaBruta): LeadImportado {
    const porte = parseInt(texto(linha.porte_funcionarios).replace(/\D/g, ''), 10);
    const segmento = texto(linha.segmento).toLowerCase();
    const capital = valorEmReais(linha.capital_social);

    return {
        razao_social: texto(linha.razao_social),
        nome_fantasia: texto(linha.nome_fantasia) || undefined,
        cnpj: cnpjValido(linha.cnpj),
        // Segmento fora da lista vira 'outro' em vez de criar categoria nova: é
        // a terceira importação que mata o filtro por segmento, quando já
        // existem "saúde", "Saude" e "área da saúde" como coisas diferentes.
        segmento: segmento
            ? ((SEGMENTOS as readonly string[]).includes(segmento) ? segmento : 'outro')
            : undefined,
        porte_funcionarios: Number.isFinite(porte) && porte > 0 ? porte : undefined,
        // Zero NAO passa: capital social zero seria uma afirmacao sobre a
        // empresa, e o que se tem e ausencia de informacao. Deixar em branco e
        // honesto; gravar zero mentiria para a fila do dia.
        capital_social: capital !== undefined && capital > 0 ? capital : undefined,
        cnae_principal: texto(linha.cnae_principal) || undefined,
        data_abertura: dataISO(linha.data_abertura),
        cidade: texto(linha.cidade) || undefined,
        uf: texto(linha.uf).toUpperCase().slice(0, 2) || undefined,
        contato_nome: texto(linha.contato_nome) || undefined,
        contato_cargo: texto(linha.contato_cargo).toLowerCase() || undefined,
        telefone: soDigitos(linha.telefone) || undefined,
        email: texto(linha.email).toLowerCase() || undefined,
        site: texto(linha.site) || undefined,
        notas: texto(linha.observacao) || undefined,
        origem: 'csv',
    };
}

// ── 3. Classificar ──────────────────────────────────────────────────────────

export type Categoria =
    | 'novo'
    | 'ja-cliente'
    | 'filial-de-cliente'
    | 'ja-lead'
    | 'incompleto';

export const ROTULO_DA_CATEGORIA: Record<Categoria, string> = {
    'novo': 'Novo',
    'ja-cliente': 'Já é cliente',
    'filial-de-cliente': 'Filial de cliente',
    'ja-lead': 'Já é lead',
    'incompleto': 'Incompleto',
};

export const EXPLICACAO_DA_CATEGORIA: Record<Categoria, string> = {
    'novo': 'Não existe em lugar nenhum. Entra no funil.',
    'ja-cliente': 'O CNPJ já está no cadastro de clientes. Não importa — importar criaria um funil que mente.',
    'filial-de-cliente': 'A raiz do CNPJ bate com um cliente. Entra como lead, e é a venda mais fácil da lista.',
    'ja-lead': 'Já está no funil. Preenche o que estiver vazio; nunca sobrescreve o que você editou.',
    'incompleto': 'Sem razão social. Não há o que importar.',
};

/** Só o que a classificação precisa saber de um cliente já cadastrado. */
export interface ClienteConhecido {
    id: string;
    company_name?: string | null;
    cnpj?: string | null;
}

export interface LinhaClassificada {
    /** Posição no arquivo, 1 = primeira linha de dados. Para apontar o erro. */
    numero: number;
    lead: LeadImportado;
    categoria: Categoria;
    /** O cliente que causou 'ja-cliente' ou 'filial-de-cliente'. */
    clienteRelacionado?: { id: string; nome: string };
    /** O lead já existente, em 'ja-lead'. */
    leadExistenteId?: string;
}

/** Só o que a classificação precisa saber de um lead já no funil. */
export interface LeadConhecido {
    id: string;
    cnpj?: string | null;
}

/**
 * Classifica uma linha contra o que já existe.
 *
 * A ordem das perguntas importa: razão social primeiro (sem ela não há o que
 * fazer), depois cliente exato, depois lead existente, depois filial. Cliente
 * exato antes de filial porque a mesma empresa é mais forte que o grupo dela.
 */
export function classificarLinha(
    numero: number,
    lead: LeadImportado,
    clientesPorCnpj: Map<string, ClienteConhecido>,
    clientesPorRaiz: Map<string, ClienteConhecido>,
    leadsPorCnpj: Map<string, LeadConhecido>,
): LinhaClassificada {
    if (!lead.razao_social) {
        return { numero, lead, categoria: 'incompleto' };
    }

    // Sem CNPJ não dá para cruzar com nada. Entra como novo — e é por isso que a
    // regra nº 1 do pré-prompt é não inventar CNPJ: um dígito trocado põe a
    // empresa no balde errado com cara de certeza.
    if (!lead.cnpj) return { numero, lead, categoria: 'novo' };

    const cliente = clientesPorCnpj.get(lead.cnpj);
    if (cliente) {
        return {
            numero, lead, categoria: 'ja-cliente',
            clienteRelacionado: { id: cliente.id, nome: cliente.company_name || '(sem nome)' },
        };
    }

    const jaLead = leadsPorCnpj.get(lead.cnpj);
    if (jaLead) {
        return { numero, lead, categoria: 'ja-lead', leadExistenteId: jaLead.id };
    }

    const raiz = raizDoCnpj(lead.cnpj);
    const irmao = raiz ? clientesPorRaiz.get(raiz) : undefined;
    if (irmao) {
        return {
            numero, lead, categoria: 'filial-de-cliente',
            clienteRelacionado: { id: irmao.id, nome: irmao.company_name || '(sem nome)' },
        };
    }

    return { numero, lead, categoria: 'novo' };
}

export interface Classificacao {
    linhas: LinhaClassificada[];
    contagem: Record<Categoria, number>;
    /** As que serão realmente gravadas se você confirmar. */
    aImportar: LinhaClassificada[];
    /** Colunas esperadas que o arquivo não trouxe. */
    faltando: string[];
    /** Linhas do arquivo, contando as descartadas. */
    total: number;
}

/** Categorias que vão para o banco. Cliente e incompleto ficam de fora. */
export const IMPORTAVEIS: Categoria[] = ['novo', 'filial-de-cliente', 'ja-lead'];

/**
 * O arquivo inteiro, classificado e pronto para conferência.
 *
 * Duplicatas DENTRO do próprio arquivo também são tratadas: a segunda ocorrência
 * do mesmo CNPJ vira 'ja-lead' apontando para a primeira. Sem isso, um arquivo
 * com a matriz repetida em duas linhas passaria pela classificação e só
 * quebraria no índice único, com uma mensagem de constraint.
 */
export function classificarImportacao(
    csv: CsvLido,
    clientes: ClienteConhecido[] | null | undefined,
    leadsExistentes: LeadConhecido[] | null | undefined,
): Classificacao {
    const clientesPorCnpj = new Map<string, ClienteConhecido>();
    const clientesPorRaiz = new Map<string, ClienteConhecido>();
    for (const c of clientes || []) {
        const cnpj = cnpjValido(c.cnpj);
        if (cnpj) clientesPorCnpj.set(cnpj, c);
        const raiz = raizDoCnpj(c.cnpj);
        // O primeiro de cada raiz basta: a mensagem é "existe cliente neste
        // grupo", e listar todos não muda o que se faz a seguir.
        if (raiz && raiz.length === 8 && !clientesPorRaiz.has(raiz)) clientesPorRaiz.set(raiz, c);
    }

    const leadsPorCnpj = new Map<string, LeadConhecido>();
    for (const l of leadsExistentes || []) {
        const cnpj = cnpjValido(l.cnpj);
        if (cnpj) leadsPorCnpj.set(cnpj, l);
    }

    const linhas: LinhaClassificada[] = [];
    const vistosNoArquivo = new Set<string>();

    csv.linhas.forEach((bruta, i) => {
        const lead = normalizarLinha(bruta);
        const classificada = classificarLinha(
            i + 1, lead, clientesPorCnpj, clientesPorRaiz, leadsPorCnpj);

        // Repetida dentro do próprio arquivo.
        if (lead.cnpj && classificada.categoria === 'novo') {
            if (vistosNoArquivo.has(lead.cnpj)) classificada.categoria = 'ja-lead';
            else vistosNoArquivo.add(lead.cnpj);
        }

        linhas.push(classificada);
    });

    const contagem = {
        'novo': 0, 'ja-cliente': 0, 'filial-de-cliente': 0, 'ja-lead': 0, 'incompleto': 0,
    } as Record<Categoria, number>;
    for (const l of linhas) contagem[l.categoria]++;

    return {
        linhas,
        contagem,
        aImportar: linhas.filter(l => IMPORTAVEIS.includes(l.categoria)),
        faltando: csv.faltando,
        total: linhas.length,
    };
}

/** Uma frase para o botão de confirmar — o que vai acontecer, sem eufemismo. */
export function resumirImportacao(c: Classificacao): string {
    const partes: string[] = [];
    if (c.contagem['novo'] > 0) partes.push(`${c.contagem['novo']} novos`);
    if (c.contagem['filial-de-cliente'] > 0) partes.push(`${c.contagem['filial-de-cliente']} filiais`);
    if (c.contagem['ja-lead'] > 0) partes.push(`${c.contagem['ja-lead']} já no funil`);
    if (partes.length === 0) return 'Nada a importar deste arquivo';
    return `Importar ${partes.join(', ')}`;
}
