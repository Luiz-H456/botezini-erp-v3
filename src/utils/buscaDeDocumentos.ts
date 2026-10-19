/**
 * Procurar pedido e orçamento pelo nome da empresa.
 *
 * O QUE NÃO FUNCIONAVA. A busca de pedidos olhava `order_number` e
 * `budget_serial_number`, e nada mais. Digitar "Hospital Santa Casa" não
 * achava nada — mas ninguém guarda "PED-BZ-2026-041" de cabeça; guarda o nome
 * do cliente que acabou de ligar. Para achar o pedido era preciso primeiro
 * lembrar o número do pedido, que é justamente o que se está procurando.
 *
 * O QUE ENTRA NA BUSCA
 *   número do pedido e do orçamento   — para quem tem o papel na mão
 *   razão social e nome fantasia      — para quem acabou de desligar o telefone
 *   CNPJ                              — para quem está com a nota fiscal aberta
 *
 * ACENTO NÃO PODE ATRAPALHAR. Quem digita rápido escreve "servicos" e "sao
 * paulo"; o cadastro tem "Serviços" e "São Paulo". Uma busca que exige o acento
 * certo é uma busca que falha justamente com quem tem pressa.
 *
 * O CNPJ COMPARA SÓ DÍGITOS. Ele é gravado de um jeito e digitado de outro:
 * com ponto, sem ponto, com barra, colado do e-mail do cliente. Comparar texto
 * cru faria "12.345.678/0001-90" não achar "12345678000190", que é o mesmo CNPJ.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

/** Tira acento, baixa a caixa e encolhe espaço repetido. */
export function normalizar(texto: string | null | undefined): string {
    return (texto || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

const digitos = (v: string | null | undefined) => (v || '').replace(/\D/g, '');

export interface ClienteBuscavel {
    id: string;
    company_name?: string | null;
    trade_name?: string | null;
    cnpj?: string | null;
}

export interface DocumentoBuscavel {
    client_id?: string | null;
    order_number?: string | null;
    serial_number?: string | null;
    budget_serial_number?: string | null;
}

/** id do cliente -> o texto onde a busca procura. Montado uma vez, não por linha. */
export function indexarClientes(clientes: ClienteBuscavel[]): Map<string, string> {
    const mapa = new Map<string, string>();
    for (const c of clientes || []) {
        mapa.set(c.id, [
            normalizar(c.company_name),
            normalizar(c.trade_name),
            digitos(c.cnpj),
        ].filter(Boolean).join(' '));
    }
    return mapa;
}

/**
 * O documento casa com o termo?
 *
 * Termo vazio casa com tudo — quem não digitou nada não está filtrando, e
 * devolver lista vazia nesse caso faria a tela parecer quebrada ao abrir.
 *
 * Termo só de dígitos vale como CNPJ E como número: "041" acha o
 * PED-BZ-2026-041, e "12345678" acha o CNPJ. São perguntas diferentes que se
 * escrevem igual, e adivinhar qual delas seria pior que atender às duas.
 */
export function documentoCasa(
    doc: DocumentoBuscavel,
    termo: string,
    indiceDeClientes: Map<string, string>,
): boolean {
    const t = normalizar(termo);
    if (!t) return true;

    const numeros = [doc.order_number, doc.serial_number, doc.budget_serial_number];
    for (const n of numeros) {
        if (n && normalizar(n).includes(t)) return true;
    }

    const doCliente = (doc.client_id && indiceDeClientes.get(doc.client_id)) || '';
    if (doCliente.includes(t)) return true;

    // Só agora, e só se o que foi digitado tiver dígitos: evita que um termo
    // como "sa" caia aqui e case com qualquer CNPJ por acidente.
    const d = digitos(termo);
    if (d && doCliente.includes(d)) return true;

    return false;
}

export function filtrarDocumentos<T extends DocumentoBuscavel>(
    documentos: T[],
    termo: string,
    indiceDeClientes: Map<string, string>,
): T[] {
    if (!normalizar(termo)) return documentos;
    return (documentos || []).filter(d => documentoCasa(d, termo, indiceDeClientes));
}
