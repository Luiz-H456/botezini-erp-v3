import { descreverCondicao } from './condicaoDePagamento.ts';
import type { ParcelaDaCondicao } from './condicaoDePagamento.ts';
// Mensagens prontas de WhatsApp, já com os dados do cliente. Sem imports.
//
// Ficam aqui, separadas da tela, por dois motivos: são texto que muda com
// frequência (tom, política de pagamento) e não deveria exigir mexer em
// componente; e são testáveis — o erro que importa aqui é mandar o nome de um
// cliente para outro, ou um valor errado numa cobrança.
//
// Onde cada uma aparece está definido em docs/mensagens-whatsapp.md. A regra:
// o botão mora ONDE A MUDANÇA DE ESTADO ACONTECE, porque é o momento em que
// você tem a notícia e o dado ao mesmo tempo.

/** Campos opcionais aceitam `null` porque é assim que vêm do banco — exigir
 *  `undefined` obrigaria a converter em cada ponto de uso. */
export interface DadosDoCliente {
    company_name?: string | null;
    contact_person?: string | null;
    cnpj?: string | null;
    inscricao_estadual?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
}

const dinheiro = (v?: number | null) =>
    (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const data = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '___');

/**
 * Como chamar a pessoa.
 *
 * Prefere o nome do contato à razão social: ninguém quer ser cumprimentado como
 * "Olá, Hospital Santa Casa Ltda". Sem contato cadastrado, cai num vocativo
 * neutro em vez de deixar um buraco na mensagem.
 */
export function tratamento(c?: DadosDoCliente): string {
    const nome = (c?.contact_person || '').trim();
    if (nome) return nome.split(' ')[0];
    const empresa = (c?.company_name || '').trim();
    return empresa || 'tudo bem';
}

/** Junta linhas descartando as vazias — campo ausente não vira linha em branco. */
const bloco = (linhas: (string | false | null | undefined)[]) =>
    linhas.filter(Boolean).join('\n');

// -- 0. Abordagem de prospeccao --

/** So o que a abordagem fria precisa saber da empresa. */
export interface DadosDoLead {
    razao_social?: string | null;
    nome_fantasia?: string | null;
    contato_nome?: string | null;
    contato_cargo?: string | null;
    cidade?: string | null;
}

/**
 * Primeira mensagem para quem ainda nao e cliente.
 *
 * E DIFERENTE de msgPrimeiroContato, e a diferenca e toda: aquela responde a
 * quem ja procurou a fabrica e por isso pode pedir CNPJ e endereco de cara.
 * Esta chega sem ser chamada. Pedir seis dados na primeira frase a um
 * desconhecido e o jeito mais rapido de ser bloqueado.
 *
 * Entao ela faz uma coisa so: diz quem e, mostra que sabe com quem esta
 * falando, e pergunta se ha interesse. O cadastro vem depois, quando a resposta
 * disser que vale a pena.
 */
export function msgAbordagemDeLead(l?: DadosDoLead, empresa?: string | null): string {
    const nome = (l?.contato_nome || '').trim().split(' ')[0];
    const alvo = (l?.nome_fantasia || l?.razao_social || '').trim();
    const casa = (empresa || 'Botezini Uniformes').trim();

    return bloco([
        nome ? `Ola, ${nome}! Tudo bem?` : 'Ola! Tudo bem?',
        '',
        `Aqui e da ${casa} - a gente fabrica uniformes profissionais` +
        (l?.cidade ? ` e atende bastante empresa em ${l.cidade.trim()}.` : '.'),
        '',
        alvo
            ? `Estou entrando em contato porque a ${alvo} pode se encaixar bem no que fazemos.`
            : 'Estou entrando em contato porque acho que podemos ajudar voces.',
        '',
        'Voces tem uniforme hoje? Se fizer sentido, mando uns modelos e um orcamento sem compromisso.',
    ]);
}

// ── 1. Primeiro contato ─────────────────────────────────────────────────────

export function msgPrimeiroContato(c?: DadosDoCliente): string {
    return bloco([
        `Olá, ${tratamento(c)}! Que bom ter vocês por aqui 😊`,
        '',
        'Para eu abrir o cadastro e já preparar seu orçamento, me manda por favor:',
        '',
        '• Razão social',
        '• CNPJ',
        '• Inscrição estadual (ou "isento", se for o caso)',
        '• Nome de quem eu falo no dia a dia',
        '• Telefone e e-mail para envio de orçamento e nota',
        '• Endereço de entrega (com CEP)',
        '',
        'Pode mandar tudo numa mensagem só. Qualquer dúvida é só chamar!',
    ]);
}

/** Só o que ainda falta no cadastro — não pede o que já está preenchido. */
export function msgCompletarCadastro(c: DadosDoCliente): string {
    const faltando = bloco([
        !c.cnpj && '• CNPJ',
        !c.inscricao_estadual && '• Inscrição estadual (ou "isento")',
        !c.contact_person && '• Nome de quem eu falo no dia a dia',
        !c.phone && '• Telefone',
        !c.email && '• E-mail para orçamento e nota',
        !c.address && '• Endereço de entrega (com CEP)',
    ]);
    if (!faltando) return '';
    return bloco([
        `Oi ${tratamento(c)}, tudo bem?`,
        '',
        'Para eu deixar seu cadastro completo, falta só:',
        '',
        faltando,
        '',
        'Quando puder me manda 👍',
    ]);
}

// ── 2 e 3. Levantamento e grade ─────────────────────────────────────────────

export function msgLevantamento(c?: DadosDoCliente): string {
    return bloco([
        `Perfeito, ${tratamento(c)}! Agora me conta sobre as peças:`,
        '',
        '• Que peça você precisa? (camisa polo, camiseta, jaleco, avental, calça…)',
        '• Manga curta ou longa?',
        '• Masculina, feminina ou unissex?',
        '• Tem preferência de tecido? (se não tiver, eu sugiro pelo uso)',
        '• Cor — nossa cartela está em botezini.com.br/cores',
        '• Vai levar bordado, silk ou DTF? Se sim, em que posição?',
        '• Precisa de faixa refletiva?',
        '',
        'E a *grade de tamanhos* — quantas peças de cada:',
        'P: 5 · M: 12 · G: 8 · GG: 3 · XG: 2',
        '',
        'Preciso dela já nesta etapa porque tamanhos maiores levam mais tecido e '
        + 'têm preço diferente. Com a grade em mãos eu te passo o valor certo de primeira.',
        '',
        'Se ainda não souber a grade exata, me manda uma estimativa que eu já adianto o orçamento.',
    ]);
}

export function msgCobrarGrade(c?: DadosDoCliente, prazo?: string): string {
    return bloco([
        `${tratamento(c)}, só falta a *grade de tamanhos* para eu fechar o valor.`,
        '',
        'P: __ · M: __ · G: __ · GG: __ · XG: __',
        '',
        'Sem ela eu consigo te dar só uma faixa de preço, porque os tamanhos maiores custam mais. '
        + 'Com a grade sai o número exato.',
        '',
        prazo ? `Consegue me mandar até ${data(prazo)}?` : 'Consegue me mandar ainda hoje?',
        'Se for difícil levantar agora, me manda uma estimativa que já ajuda.',
    ]);
}

// ── 4. Orçamento e fechamento ───────────────────────────────────────────────

export interface DadosDoOrcamento {
    serial_number?: string | null;
    total_amount?: number;
    delivery_time_days?: number;
    validity_days?: number;
    /** aaaa-mm-dd — referência do que vence "na confirmação". */
    date?: string | null;
    /** A condição real. Quando existe, manda nela. */
    payment_plan?: ParcelaDaCondicao[] | null;
    /**
     * Campos do modelo antigo (entrada + saldo na entrega). Só são lidos quando
     * NÃO há plano: com plano, `down_payment_value` guarda a primeira parcela,
     * que não é a mesma coisa que entrada — ver condicaoDePagamento.ts.
     */
    down_payment_value?: number;
    delivery_payment_value?: number;
}

/** A condição real do orçamento, com a emissão como referência. */
const condicaoDe = (o: DadosDoOrcamento) =>
    descreverCondicao(
        {
            payment_plan: o.payment_plan,
            total_amount: o.total_amount,
            date: o.date,
            down_payment_value: o.down_payment_value,
            delivery_payment_value: o.delivery_payment_value,
        },
        (o.date || '').slice(0, 10),
    );

/**
 * O pagamento em linhas de mensagem.
 *
 * Uma linha por parcela quando são poucas; acima de três, o resumo — a
 * mensagem de fechamento é lida no celular, e seis linhas de parcela empurram
 * os dados da nota fiscal para fora da tela.
 */
function linhasDaCondicao(o: DadosDoOrcamento): string[] {
    const c = condicaoDe(o);
    if (c.origem === 'vazio') return ['• *Pagamento:* ___'];
    if (c.parcelas.length > 3) return [`• *Pagamento:* ${c.resumo}`];
    return c.parcelas.map((p, i) => {
        const quando = p.naConfirmacao
            ? 'na confirmação'
            : (p.vencimento ? `até ${p.vencimento.split('-').reverse().join('/')}` : 'na entrega');
        const rotulo = c.parcelas.length === 1
            ? 'Pagamento'
            : (p.naConfirmacao ? 'Entrada' : `Parcela ${i + 1}`);
        return `• *${rotulo}:* ${dinheiro(p.valor)} ${quando}`;
    });
}

export function msgOrcamentoEnviado(c: DadosDoCliente, o: DadosDoOrcamento): string {
    return bloco([
        `${tratamento(c)}, segue o orçamento *${o.serial_number || ''}* 👇`,
        '',
        `Valor total: *${dinheiro(o.total_amount)}*`,
        o.delivery_time_days ? `Prazo de produção: ${o.delivery_time_days} dias úteis após a confirmação` : '',
        o.validity_days ? `Validade da proposta: ${o.validity_days} dias` : '',
        '',
        'Qualquer ajuste de quantidade, tecido ou cor é só falar que eu refaço.',
    ]);
}

/**
 * Retomar um orcamento que ficou sem resposta.
 *
 * Nao repete a proposta inteira: quem recebeu ja tem o PDF, e reenviar os
 * valores parece cobranca. A mensagem faz duas coisas — lembra que existe, e
 * abre a porta para o motivo real do silencio, que quase sempre e preco,
 * quantidade ou prazo. Perguntar isso e o que transforma um "vou ver" em
 * informacao aproveitavel.
 *
 * `diasParados` entra so quando passa de uma semana: dizer "faz tres dias"
 * soa como cobranca de quem nao tem o que fazer.
 */
export function msgRetomarOrcamento(
    c: DadosDoCliente,
    o: DadosDoOrcamento,
    diasParados?: number | null,
    diasAteVencer?: number | null,
): string {
    const tempo = Number(diasParados) >= 7
        ? ` (mandei ha ${diasParados} dias)`
        : '';

    const vencimento = typeof diasAteVencer === 'number' && diasAteVencer >= 0 && diasAteVencer <= 7
        ? (diasAteVencer === 0
            ? 'So um aviso: a validade dessa proposta termina hoje. Se precisar de mais prazo, eu renovo sem problema.'
            : `So um aviso: a validade dessa proposta termina em ${diasAteVencer} ${diasAteVencer === 1 ? 'dia' : 'dias'}. Se precisar de mais prazo, eu renovo sem problema.`)
        : '';

    return bloco([
        `${tratamento(c)}, tudo bem? Passando para saber do orcamento *${o.serial_number || ''}*${tempo}.`,
        '',
        'Ficou alguma duvida, ou tem algo que voce gostaria de ajustar? Quantidade, tecido, prazo — o que precisar eu refaco.',
        vencimento ? '' : '',
        vencimento,
    ]);
}

export function msgFechamento(c: DadosDoCliente, o: DadosDoOrcamento): string {
    return bloco([
        `Fechado, ${tratamento(c)}! Últimos combinados:`,
        '',
        o.delivery_time_days
            ? `• *Prazo de entrega:* ${o.delivery_time_days} dias úteis a partir da confirmação`
            : '• *Prazo de entrega:* ___ dias úteis a partir da confirmação',
        // A condição sai do PLANO, não do campo `down_payment_value`. Dizer
        // "entrada de X, saldo na entrega" para quem combinou 30/60/90 é
        // inventar um acordo que não existe — e para "à vista em 30 dias" era
        // pior ainda: anunciava o total inteiro como entrada.
        ...linhasDaCondicao(o),
        '• *Forma:* PIX, boleto ou transferência?',
        '',
        // Não repergunta razão social e CNPJ: já estão no cadastro. Mostra para
        // conferência, que é mais rápido para o cliente e evita erro de digitação.
        '*Dados para a nota fiscal* — confere se está tudo certo:',
        c.company_name ? `${c.company_name}` : '',
        c.cnpj ? `CNPJ ${c.cnpj}` : '',
        c.inscricao_estadual ? `IE ${c.inscricao_estadual}` : '',
        c.address ? `${c.address}` : '',
        '',
        'Se algo mudou, me avisa. Confirmando, eu já coloco na fila de produção.',
    ]);
}

/**
 * Cobrança da entrada que destrava a produção.
 *
 * Fica entre o fechamento e o "pedido confirmado": o cliente já aprovou o
 * valor, mas a fila só anda quando a entrada cai. É a cobrança mais frequente
 * da casa e a que mais atrasa pedido — e também a mais delicada de escrever na
 * hora, porque cobrar sem soar ríspido dá trabalho justamente quando se está
 * com pressa.
 *
 * Diz o MOTIVO, não só o valor: quem lê entende que não é burocracia, é o que
 * libera o corte do tecido. E oferece o comprovante como gatilho — mandar o
 * comprovante é uma ação mais fácil de executar do que "pagar".
 */
export function msgCobrarEntrada(
    c: DadosDoCliente,
    o: DadosDoOrcamento & { chave_pix?: string | null },
): string {
    return bloco([
        `${tratamento(c)}, tudo certo com o orçamento${o.serial_number ? ` *${o.serial_number}*` : ''}!`,
        '',
        // Só cobra entrada quando existe entrada. Antes, um orçamento a prazo
        // (30, 30/60, 30/60/90) gerava "falta a entrada de R$ 1.400,00" — o
        // total inteiro cobrado como sinal de um cliente que não devia nada
        // ainda. É o tipo de mensagem que custa a venda, não só a informação.
        ...(() => {
            const c = condicaoDe(o);
            if (c.temEntrada) {
                return [
                    `Para eu já colocar na fila de produção, falta a entrada de *${dinheiro(c.entrada)}*.`,
                    c.aPrazo > 0 ? `O restante, ${dinheiro(c.aPrazo)}, segue o combinado: ${c.resumo}.` : '',
                ];
            }
            if (c.origem === 'vazio') {
                return ['Para eu já colocar na fila de produção, falta a entrada combinada.'];
            }
            return [
                'Para eu já colocar na fila de produção, falta a confirmação do pedido.',
                `O pagamento combinado foi ${c.resumo}.`,
            ];
        })(),
        '',
        // A entrada não é taxa: é o que paga o tecido que vai ser cortado. Dizer
        // isso transforma a cobrança em explicação.
        'É ela que libera a compra do tecido e a reserva da máquina — assim que cair, o'
        + (o.delivery_time_days ? ` prazo de ${o.delivery_time_days} dias úteis começa a contar.` : ' prazo começa a contar.'),
        '',
        o.chave_pix ? `*PIX:* ${o.chave_pix}` : '*PIX:* ___',
        '',
        'Me manda o comprovante por aqui mesmo que eu já dou início 👍',
    ]);
}

// ── 5. Arte ─────────────────────────────────────────────────────────────────

export function msgAprovacaoDeArte(c: DadosDoCliente): string {
    return bloco([
        `${tratamento(c)}, segue a arte para aprovação 👇`,
        '',
        'Confere por favor:',
        '• Grafia do nome / escrita',
        '• Posição e tamanho',
        '• Cores',
        '',
        '*Me responde "aprovado" para eu liberar a produção.* Depois de bordado não tem '
        + 'como alterar, então vale uma última olhada com calma.',
    ]);
}

// ── 6 a 8. Produção e entrega ───────────────────────────────────────────────

export interface DadosDoPedido {
    order_number?: string | null;
    deadline?: string | null;
    total_amount?: number;
    amount_paid?: number;
}

export function msgProducaoIniciada(c: DadosDoCliente, p: DadosDoPedido): string {
    return bloco([
        `Boa notícia, ${tratamento(c)}: seu pedido *#${p.order_number || ''}* entrou em produção hoje 🧵`,
        '',
        p.deadline ? `Previsão de entrega: *${data(p.deadline)}*` : '',
        '',
        'Te aviso quando estiver pronto. Qualquer mudança de prazo eu falo antes, não depois.',
    ]);
}

export interface PecaEntregue { descricao: string; quantidade: number }

export function msgEntregaParcial(
    c: DadosDoCliente, p: DadosDoPedido, pecas: PecaEntregue[],
): string {
    return bloco([
        `${tratamento(c)}, parte do seu pedido *#${p.order_number || ''}* já está pronta:`,
        '',
        ...pecas.map(x => `• ${x.descricao}: ${x.quantidade} peças`),
        '',
        p.deadline
            ? `Quer que eu já envie essa parte, ou prefere receber tudo junto em ${data(p.deadline)}?`
            : 'Quer que eu já envie essa parte, ou prefere receber tudo junto?',
    ]);
}

/**
 * `saldo` vem das contas a receber do pedido (resumirPagamentoDoPedido(...).falta), não do
 * total − amount_paid, que é campo antigo e fica sempre em 0. `null` = não se sabe (leitura
 * falhou, ou papel fábrica): a mensagem sai sem a linha do saldo, nunca com número inventado.
 */
export function msgEntregue(c: DadosDoCliente, p: DadosDoPedido, saldo: number | null): string {
    // Só menciona saldo se houver de fato — cobrar quem já pagou tudo é o
    // tipo de erro que custa o cliente.
    const devendo = saldo !== null && saldo > 0 ? saldo : 0;
    return bloco([
        `Pedido *#${p.order_number || ''}* entregue, ${tratamento(c)}! 🎉`,
        '',
        'Qualquer coisa fora do combinado, me avisa nos próximos dias que a gente resolve.',
        devendo ? '' : false,
        devendo ? `Fica o saldo de *${dinheiro(devendo)}*. Te mando o PIX separado.` : false,
    ]);
}

// ── 9 e 10. Cobrança ────────────────────────────────────────────────────────

export interface DadosDaConta {
    description?: string | null;
    remaining_amount?: number | null;
    due_date?: string | null;
}

export function msgLembreteDeVencimento(c: DadosDoCliente, ct: DadosDaConta): string {
    return bloco([
        `Oi ${tratamento(c)}, tudo bem? Passando só para lembrar que o pagamento de `
        + `*${dinheiro(ct.remaining_amount)}* vence em *${data(ct.due_date)}*.`,
        ct.description ? `(${ct.description})` : '',
        '',
        'Te mando a chave PIX / o boleto na sequência.',
        '',
        'Se precisar de outro prazo, me fala que a gente ajeita 👍',
    ]);
}

export function msgCobrancaVencida(c: DadosDoCliente, ct: DadosDaConta, diasDeAtraso?: number): string {
    return bloco([
        `${tratamento(c)}, tudo certo por aí?`,
        '',
        `O pagamento de *${dinheiro(ct.remaining_amount)}* venceu em *${data(ct.due_date)}*`
        + (diasDeAtraso && diasDeAtraso > 0 ? ` (${diasDeAtraso} dias)` : '')
        + ' e ainda não identifiquei aqui.',
        'Pode ser que tenha passado batido no meio da correria.',
        '',
        'Se já pagou, me manda o comprovante que eu baixo na hora. '
        + 'Se ficou apertado, me fala que a gente combina uma data.',
    ]);
}

/**
 * Link direto do WhatsApp, quando há telefone cadastrado.
 *
 * Mantém só os dígitos e assume DDI 55 quando o número vem sem ele — telefone
 * brasileiro cadastrado à mão quase nunca tem o 55 na frente, e sem ele o link
 * abre uma conversa vazia com número inválido.
 */
export function linkDoWhatsApp(telefone?: string | null, texto?: string): string | null {
    const digitos = (telefone || '').replace(/\D/g, '');
    if (digitos.length < 10) return null;
    const comDdi = digitos.startsWith('55') ? digitos : `55${digitos}`;
    return `https://wa.me/${comDdi}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

// ── Confirmação do pedido ───────────────────────────────────────────────────

/**
 * Confirmação de que o orçamento virou pedido.
 *
 * O prazo é contado a partir da CONVERSÃO, não da data do orçamento: um
 * orçamento feito em março e aprovado em maio entrega em maio + prazo, não em
 * março + prazo. Por isso a mensagem cita a data de confirmação junto — é ela
 * que o cliente vai usar para cobrar você, e deixá-la implícita gera discussão.
 */
export function msgPedidoConfirmado(
    c: DadosDoCliente,
    p: DadosDoPedido & { confirmado_em?: string | null; prazo_dias?: number | null },
): string {
    // Sem valores: a confirmação é sobre PRAZO. Dinheiro já foi combinado no
    // fechamento, e repeti-lo aqui transforma uma boa notícia em cobrança.
    return bloco([
        `Pedido confirmado, ${tratamento(c)}! ✅`,
        '',
        `Número do pedido: *#${p.order_number || ''}*`,
        p.confirmado_em ? `Confirmado em: ${data(p.confirmado_em)}` : '',
        p.prazo_dias ? `Prazo combinado: ${p.prazo_dias} dias úteis a partir da confirmação` : '',
        p.deadline ? `*Previsão de entrega: ${data(p.deadline)}*` : '',
        '',
        'Já está na fila de produção. Te aviso a cada etapa 👍',
    ]);
}

// ── Andamento por etapa da produção ─────────────────────────────────────────

/**
 * Uma frase por etapa do kanban.
 *
 * O cliente não sabe o que é "enfesto" nem "finalização" — cada texto diz o que
 * está acontecendo em português de cliente, e o que vem a seguir. Etapa
 * desconhecida cai num texto genérico em vez de vazar o nome interno da coluna.
 */
const FRASE_DA_ETAPA: Record<string, { titulo: string; explica: string }> = {
    'Aguardando Material': {
        titulo: 'aguardando o tecido chegar',
        explica: 'Assim que o material entrar, seguimos direto para o corte.',
    },
    'Corte': {
        titulo: 'no corte',
        explica: 'As peças estão sendo cortadas no tecido e na cor que você escolheu.',
    },
    'Personalização': {
        titulo: 'na personalização',
        explica: 'Bordado e estampa sendo aplicados, exatamente como na arte aprovada.',
    },
    'Costura': {
        titulo: 'na costura',
        explica: 'É a etapa mais longa — daqui vai direto para o acabamento.',
    },
    'Finalização': {
        titulo: 'na finalização',
        explica: 'Acabamento, revisão peça a peça e embalagem. Estamos quase lá.',
    },
    'Transporte': {
        titulo: 'saindo para entrega',
        explica: 'Pedido embalado e a caminho.',
    },
};

export function msgAndamento(
    c: DadosDoCliente,
    p: DadosDoPedido,
    etapa?: string | null,
): string {
    const f = etapa ? FRASE_DA_ETAPA[etapa] : undefined;
    return bloco([
        f
            ? `${tratamento(c)}, atualização do seu pedido *#${p.order_number || ''}*: está *${f.titulo}* 🧵`
            : `${tratamento(c)}, seu pedido *#${p.order_number || ''}* está em andamento na produção.`,
        '',
        f ? f.explica : 'Te aviso assim que avançar de etapa.',
        '',
        p.deadline ? `Previsão de entrega segue para *${data(p.deadline)}*.` : '',
    ]);
}
