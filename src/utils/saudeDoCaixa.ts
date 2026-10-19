// Saúde do caixa: o mês fecha, e a operação se sustenta.
//
// São DUAS perguntas, e o motivo deste arquivo existir é não deixar que virem
// uma só. Elas se contradizem com frequência:
//
//   · O mês fecha no azul porque um cliente grande antecipou — e a operação
//     está queimando caixa todos os meses.
//   · O mês fecha no vermelho porque dois clientes atrasaram — e a operação
//     está perfeitamente saudável.
//
// Quem confunde as duas corta custo de operação sadia, ou comemora um mês bom
// enquanto o buraco cresce. Por isso o cálculo é separado, e existe uma função
// só para dizer quando as respostas discordam.

export type Natureza = 'fixo' | 'variavel';

const DIA_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Soma dias a uma data ISO, devolvendo aaaa-mm-dd. */
function somarDias(data: string, dias: number): string {
    return new Date(Date.parse(data.slice(0, 10)) + dias * DIA_MS).toISOString().slice(0, 10);
}

// ── Painel 1: o mês fecha? ──────────────────────────────────────────────────

export interface MovimentoPrevisto {
    /** Data em que o dinheiro se move de fato (não o vencimento). */
    data: string;
    /** Sempre positivo — o sentido vem de `entra`. */
    valor: number;
    entra: boolean;
    descricao?: string;
}

export interface PontoDoSaldo {
    data: string;
    entradas: number;
    saidas: number;
    /** Saldo ao FIM do dia. */
    saldo: number;
}

/**
 * Saldo dia a dia entre duas datas.
 *
 * Todo dia do intervalo aparece, mesmo sem movimento: é uma linha de saldo, e
 * saltar os dias parados distorceria a inclinação — dois dias distantes
 * viravam pontos vizinhos e a queda parecia mais suave do que é.
 *
 * O saldo é o do FIM do dia. Quem paga e recebe no mesmo dia não fica negativo
 * por causa da ordem em que as contas foram lançadas.
 */
export function projetarSaldo(
    saldoInicial: number,
    movimentos: MovimentoPrevisto[],
    de: string,
    ate: string,
): PontoDoSaldo[] {
    const porDia = new Map<string, { entradas: number; saidas: number }>();
    for (const m of movimentos) {
        if (!m.data) continue;
        const dia = m.data.slice(0, 10);
        if (dia < de || dia > ate) continue;
        const d = porDia.get(dia) || { entradas: 0, saidas: 0 };
        if (m.entra) d.entradas += Number(m.valor) || 0;
        else d.saidas += Number(m.valor) || 0;
        porDia.set(dia, d);
    }

    const pontos: PontoDoSaldo[] = [];
    let saldo = saldoInicial;
    for (let dia = de.slice(0, 10); dia <= ate.slice(0, 10); dia = somarDias(dia, 1)) {
        const d = porDia.get(dia) || { entradas: 0, saidas: 0 };
        saldo += d.entradas - d.saidas;
        pontos.push({
            data: dia,
            entradas: round2(d.entradas),
            saidas: round2(d.saidas),
            saldo: round2(saldo),
        });
    }
    return pontos;
}

export interface FechamentoDoMes {
    saldoInicial: number;
    entradas: number;
    saidas: number;
    saldoFinal: number;
    /** O fundo do poço no período, e quando acontece. */
    menorSaldo: number;
    diaDoMenorSaldo?: string;
    /** Primeiro dia em que o saldo fica negativo. Null se nunca fica. */
    primeiroDiaNegativo: string | null;
    /** Termina o período com saldo positivo? */
    fecha: boolean;
    /** Fecha positivo, mas passa por saldo negativo no caminho. */
    fechaMasFuraNoMeio: boolean;
    /**
     * Entradas − saídas do período. É a pergunta que o saldo final NÃO responde:
     * terminar com R$ 10.000 depois de começar com R$ 100.000 é saldo positivo
     * e queima de R$ 90.000. Um mês assim não é saudável, e repetido acaba com
     * a reserva — a trajetória importa mais que o ponto de chegada.
     */
    resultadoDoPeriodo: number;
    /** O período consumiu reserva (saiu mais do que entrou). */
    consomeReserva: boolean;
    /**
     * Em quantos meses a reserva acaba mantido este ritmo de queima.
     * `null` quando não está queimando. Arredonda para BAIXO — prazo otimista
     * em previsão de falta de caixa é o erro que custa caro.
     */
    mesesDeReserva: number | null;
}

/**
 * Resumo do período.
 *
 * `primeiroDiaNegativo` é o número que evita cheque especial, e é justamente o
 * que o saldo final esconde: um mês pode terminar positivo tendo passado três
 * dias no vermelho no dia 18, quando vence a folha. Terminar bem não é o mesmo
 * que nunca faltar dinheiro.
 */
export function resumirFechamento(pontos: PontoDoSaldo[], saldoInicial: number): FechamentoDoMes {
    if (pontos.length === 0) {
        return {
            saldoInicial, entradas: 0, saidas: 0, saldoFinal: saldoInicial,
            menorSaldo: saldoInicial, primeiroDiaNegativo: null,
            fecha: saldoInicial >= 0, fechaMasFuraNoMeio: false,
            resultadoDoPeriodo: 0, consomeReserva: false, mesesDeReserva: null,
        };
    }

    let menorSaldo = Infinity;
    let diaDoMenorSaldo: string | undefined;
    let primeiroDiaNegativo: string | null = null;
    let entradas = 0, saidas = 0;

    for (const p of pontos) {
        entradas += p.entradas;
        saidas += p.saidas;
        if (p.saldo < menorSaldo) { menorSaldo = p.saldo; diaDoMenorSaldo = p.data; }
        if (p.saldo < 0 && primeiroDiaNegativo === null) primeiroDiaNegativo = p.data;
    }

    const saldoFinal = pontos[pontos.length - 1].saldo;
    const fecha = saldoFinal >= 0;
    const resultadoDoPeriodo = round2(entradas - saidas);
    const consomeReserva = resultadoDoPeriodo < 0;
    // Math.floor: dizer "4 meses" quando são 4,9 antecipa o alarme; dizer "5"
    // quando são 4,1 atrasa. Em previsão de falta de caixa, errar cedo é barato.
    const mesesDeReserva = consomeReserva && saldoFinal > 0
        ? Math.floor(saldoFinal / Math.abs(resultadoDoPeriodo)) : consomeReserva ? 0 : null;
    return {
        resultadoDoPeriodo,
        consomeReserva,
        mesesDeReserva,
        saldoInicial: round2(saldoInicial),
        entradas: round2(entradas),
        saidas: round2(saidas),
        saldoFinal,
        menorSaldo: round2(menorSaldo),
        diaDoMenorSaldo,
        primeiroDiaNegativo,
        fecha,
        fechaMasFuraNoMeio: fecha && primeiroDiaNegativo !== null,
    };
}

// ── Painel 2: a operação se sustenta? ───────────────────────────────────────

export interface SaidaClassificada {
    valor: number;
    /** Ausente = categoria não classificada. Não é chutada. */
    natureza?: Natureza;
    categoria?: string;
}

/**
 * Base do ponto de equilíbrio — em REGIME DE COMPETÊNCIA.
 *
 * A primeira versão desta conta usava as contas a receber e a pagar que venciam
 * no mês. Estava errada, e o erro era de regime: aquilo é caixa, não resultado.
 * Uma venda de R$ 10.000 parcelada em três aparecia como R$ 3.333 de "receita"
 * num mês, e o tecido daquele mesmo pedido podia vencer no mês anterior — de
 * modo que a "margem de contribuição" comparava uma receita com um custo que
 * não tinha nada a ver com ela.
 *
 * A literatura é explícita: margem de contribuição opera sobre VENDAS
 * REALIZADAS e respeita o princípio de correspondência — o custo variável tem
 * de ser o daquela mesma receita. Por isso os campos abaixo são separados:
 * a receita e o custo variável vêm das PEÇAS VENDIDAS no período (casados peça
 * a peça), e não do que entrou ou saiu do banco.
 */
export interface BaseDoEquilibrio {
    /** Receita das vendas do período (preço × quantidade). */
    receita: number;
    /** Custo variável DAQUELAS MESMAS peças (custo unitário × quantidade). */
    custoVariavelDasVendas: number;
    /** Parte da receita cujo custo unitário não é conhecido — a margem dela está superestimada. */
    receitaSemCustoConhecido: number;
    /** Despesas fixas incorridas no período. */
    despesasFixas: SaidaClassificada[];
    /**
     * Despesas classificadas como variáveis lançadas no período.
     *
     * NÃO entra na conta — serve de confronto. Somá-la ao custo das peças
     * contaria o tecido duas vezes: ele já está no custo unitário da ficha
     * técnica. A comparação entre os dois revela custo variável que existe mas
     * não está na ficha (frete, comissão), e aí a margem está otimista.
     */
    variaveisLancadas?: number;
}

/** Uma linha vendida, como montarItensVendidos a entrega — só o que o equilíbrio usa. */
export interface VendaParaEquilibrio {
    data: string;
    precoConhecido: boolean;
    valorTotal: number;
    produto: string;
    quantidade: number;
}

export interface ContaParaEquilibrio {
    type?: string | null;
    due_date: string;
    original_amount?: number | null;
    cancelled_at?: string | null;
    derived_status?: string | null;
    global_category_id?: string | null;
    category?: string | null;
    natureza_override?: Natureza | null;
}

export interface DadosDoEquilibrio {
    vendas: VendaParaEquilibrio[];
    /** Custo unitário por nome de produto (o que casa com a linha vendida). */
    custos: Map<string, number>;
    obrigacoes: ContaParaEquilibrio[];
    naturezaPorCategoriaId: Map<string, Natureza | undefined>;
    nomePorCategoriaId: Map<string, string>;
    de: string;
    ate: string;
}

/** A base do ponto de equilíbrio de UM período — a mesma conta da Saúde do caixa e da meta sugerida. */
export function baseDoEquilibrio(d: DadosDoEquilibrio): BaseDoEquilibrio {
    // Vendas do período, casadas peça a peça com o custo unitário da ficha.
    let receita = 0, custoVariavelDasVendas = 0, receitaSemCustoConhecido = 0;
    for (const l of d.vendas) {
        if (!l.data || l.data < d.de || l.data > d.ate) continue;
        if (!l.precoConhecido) continue;   // sem preço não há receita a somar
        receita += l.valorTotal;
        const unit = d.custos.get(l.produto);
        if (unit && unit > 0) custoVariavelDasVendas += unit * l.quantidade;
        else receitaSemCustoConhecido += l.valorTotal;
    }

    const doPeriodo = d.obrigacoes.filter(o =>
        !o.cancelled_at && o.due_date >= d.de && o.due_date <= d.ate && o.derived_status !== 'cancelled'
        && o.type === 'payable');

    // Sem marca, o custo é variável.
    //
    // O modelo anterior tinha três estados e o terceiro ("não sei") tirava a
    // despesa da conta, deixando um valor grande em limbo que ninguém tinha
    // onde resolver. Fixo é a exceção e é o que se marca; o resto acompanha a
    // produção. O que se perde é a distinção entre "revisei e é variável" e
    // "nunca olhei" — ela sobrevive no formulário de categorias, marcada como
    // "novo", onde dá para agir, em vez de virar buraco no indicador.
    const naturezaDe = (o: ContaParaEquilibrio) => (o.natureza_override
        || (o.global_category_id ? d.naturezaPorCategoriaId.get(o.global_category_id) : undefined)
        || 'variavel') as Natureza;

    const despesasFixas: SaidaClassificada[] = doPeriodo.map(o => ({
        valor: Number(o.original_amount) || 0,
        // A conta pode fugir da categoria: contador e frete convivem em
        // "Serviços". O override individual vence.
        natureza: naturezaDe(o),
        categoria: (o.global_category_id && d.nomePorCategoriaId.get(o.global_category_id)) || o.category || 'Sem categoria',
    }));

    // Só para confronto — não soma. O tecido já está no custo da ficha.
    const variaveisLancadas = doPeriodo
        .filter(o => naturezaDe(o) === 'variavel')
        .reduce((sum, o) => sum + (Number(o.original_amount) || 0), 0);

    return { receita, custoVariavelDasVendas, receitaSemCustoConhecido, despesasFixas, variaveisLancadas };
}

export interface PontoDeEquilibrio {
    receita: number;
    custoVariavel: number;
    /** Receita − custo variável: o que sobra para pagar o fixo. */
    margemContribuicao: number;
    /** Margem de contribuição sobre a receita, em % (o índice de MC). */
    margemContribuicaoPct: number;
    custoFixo: number;
    /**
     * Ponto de equilíbrio CONTÁBIL: custo fixo ÷ índice de margem de
     * contribuição. `null` quando a margem é zero ou negativa — nesse caso
     * nenhum volume resolve.
     */
    pontoDeEquilibrio: number | null;
    /** Receita − ponto de equilíbrio. Negativo = faltou faturar. */
    sobra: number | null;
    /** Quanto o faturamento pode cair antes de não pagar as contas, em %. */
    margemDeSeguranca: number | null;
    /** Receita − custo variável − custo fixo. O que sobrou de verdade. */
    lucro: number;
    /** Lucro sobre a receita, em %. Quanto sobra de cada real vendido. */
    margemDeLucroPct: number;
    /** A operação se paga no período? */
    sustenta: boolean;
    /** Saídas fixas sem natureza definida — ficam FORA da conta, e à vista. */
    naoClassificado: number;
    categoriasNaoClassificadas: string[];
    /** Receita cujo custo unitário é desconhecido: a MC está superestimada nela. */
    receitaSemCustoConhecido: number;
    /** Despesas variáveis lançadas no período, para confronto (não somadas). */
    variaveisLancadas: number;
    /**
     * Quanto as despesas variáveis lançadas excedem o custo das peças vendidas.
     * Positivo sugere custo variável fora da ficha técnica — margem otimista.
     */
    variavelForaDaFicha: number;
}

/**
 * Ponto de equilíbrio contábil do período.
 *
 *   PE = custo fixo ÷ (margem de contribuição ÷ receita)
 *
 * Despesa fixa sem natureza definida NÃO é chutada — fica de fora e é devolvida
 * em `naoClassificado`. Distribuir por palpite daria um ponto de equilíbrio
 * errado com aparência de certo, que é pior do que um número faltando: com o
 * valor à vista, quem lê sabe o tamanho da dúvida e decide se o resultado serve.
 */
export function calcularPontoDeEquilibrio(base: BaseDoEquilibrio): PontoDeEquilibrio {
    let custoFixo = 0, naoClassificado = 0;
    const semClasse = new Set<string>();

    for (const s of base.despesasFixas) {
        const v = Number(s.valor) || 0;
        if (s.natureza === 'fixo') custoFixo += v;
        else if (s.natureza === 'variavel') continue;   // já está no custo das peças
        else { naoClassificado += v; if (s.categoria) semClasse.add(s.categoria); }
    }

    const receita = Number(base.receita) || 0;
    const custoVariavel = Number(base.custoVariavelDasVendas) || 0;
    const margemContribuicao = receita - custoVariavel;

    // Margem de contribuição não positiva: cada peça vendida piora o resultado,
    // então NÃO existe faturamento que empate. Devolver um número (mesmo
    // enorme) sugeriria que vender mais resolve, quando o que resolve é preço
    // ou custo.
    const temMargem = margemContribuicao > 0 && receita > 0;
    const indice = temMargem ? margemContribuicao / receita : 0;
    const pontoDeEquilibrio = !temMargem ? null : custoFixo > 0 ? custoFixo / indice : 0;

    const sobra = pontoDeEquilibrio === null ? null : round2(receita - pontoDeEquilibrio);
    const margemDeSeguranca = pontoDeEquilibrio === null ? null
        : Math.round(((receita - pontoDeEquilibrio) / receita) * 1000) / 10;

    const variaveisLancadas = Number(base.variaveisLancadas) || 0;

    return {
        receita: round2(receita),
        custoVariavel: round2(custoVariavel),
        margemContribuicao: round2(margemContribuicao),
        margemContribuicaoPct: receita > 0 ? Math.round(indice * 1000) / 10 : 0,
        custoFixo: round2(custoFixo),
        pontoDeEquilibrio: pontoDeEquilibrio === null ? null : round2(pontoDeEquilibrio),
        sobra,
        margemDeSeguranca,
        lucro: round2(margemContribuicao - custoFixo),
        // Sobre a receita, não sobre o custo: "margem" é sempre parte do preço.
        margemDeLucroPct: receita > 0
            ? Math.round(((margemContribuicao - custoFixo) / receita) * 1000) / 10 : 0,
        sustenta: temMargem && margemContribuicao >= custoFixo,
        naoClassificado: round2(naoClassificado),
        categoriasNaoClassificadas: [...semClasse].sort(),
        receitaSemCustoConhecido: round2(Number(base.receitaSemCustoConhecido) || 0),
        variaveisLancadas: round2(variaveisLancadas),
        variavelForaDaFicha: round2(Math.max(0, variaveisLancadas - custoVariavel)),
    };
}

// ── O cruzamento das duas respostas ─────────────────────────────────────────

export type Veredito =
    | 'tudo_bem'                   // fecha, não queima reserva e se sustenta
    | 'queima_reserva'             // saldo positivo só porque havia reserva
    | 'fecha_mas_nao_para_de_pe'   // caixa salvo por timing, operação no vermelho
    | 'nao_fecha_mas_e_saudavel'   // operação boa, problema é de prazo
    | 'ruim_dos_dois_lados'
    | 'sem_dados';

export interface LeituraDaSaude {
    veredito: Veredito;
    titulo: string;
    explicacao: string;
}

/**
 * Traduz os dois painéis numa frase.
 *
 * Existe porque conciliar "fechou no azul" com "está abaixo do ponto de
 * equilíbrio" de cabeça é exatamente onde a leitura erra — e os dois casos
 * cruzados pedem ações opostas: um é problema de cobrança, o outro é de preço.
 */
export function lerSaude(fech: FechamentoDoMes, pe: PontoDeEquilibrio): LeituraDaSaude {
    if (pe.receita <= 0) {
        return {
            veredito: 'sem_dados',
            titulo: 'Sem faturamento no período',
            explicacao: 'Não há receita registrada para comparar com os custos.',
        };
    }

    // A queima vem ANTES do "tudo bem": saldo positivo com entradas menores que
    // as saídas não é saúde, é reserva sendo gasta. O saldo final sozinho
    // esconde exatamente isso, e repetido por alguns meses zera o caixa.
    if (fech.consomeReserva && fech.fecha) {
        const prazo = fech.mesesDeReserva === null ? ''
            : fech.mesesDeReserva <= 0 ? ' No ritmo atual, a reserva não cobre nem mais um mês.'
            : ` No ritmo atual, a reserva cobre cerca de ${fech.mesesDeReserva} ${fech.mesesDeReserva === 1 ? 'mês' : 'meses'}.`;
        return {
            veredito: 'queima_reserva',
            titulo: 'O saldo é positivo, mas o caixa está encolhendo',
            explicacao: `Saiu mais do que entrou no período — o saldo só não ficou negativo porque havia reserva.${prazo} `
                + (pe.sustenta
                    ? 'A operação se paga no papel, então o descompasso é de prazo: o dinheiro entra depois das contas.'
                    : 'E a operação também não se paga: as duas frentes puxam o caixa para baixo.'),
        };
    }

    if (fech.fecha && pe.sustenta) {
        return {
            veredito: 'tudo_bem',
            titulo: 'O mês fecha e a operação se paga',
            explicacao: fech.fechaMasFuraNoMeio
                ? `Atenção só ao dia ${fech.primeiroDiaNegativo}: o saldo passa pelo negativo antes de se recompor.`
                : 'Entradas cobrem as saídas e a margem cobre o custo fixo.',
        };
    }

    if (fech.fecha && !pe.sustenta) {
        return {
            veredito: 'fecha_mas_nao_para_de_pe',
            titulo: 'O caixa fecha, mas a operação não se paga',
            explicacao: 'O saldo positivo veio do momento em que o dinheiro entrou, não do resultado. '
                + 'Repetindo assim, o buraco aparece nos próximos meses. É problema de preço ou de custo, não de cobrança.',
        };
    }

    if (!fech.fecha && pe.sustenta) {
        return {
            veredito: 'nao_fecha_mas_e_saudavel',
            titulo: 'A operação se paga, mas o caixa não fecha',
            explicacao: 'A margem cobre os custos — o aperto é de prazo: o dinheiro entra depois das contas vencerem. '
                + 'É problema de cobrança e prazo, não de preço.',
        };
    }

    return {
        veredito: 'ruim_dos_dois_lados',
        titulo: 'O caixa não fecha e a operação não se paga',
        explicacao: 'As duas frentes pedem ação: o resultado não cobre o custo fixo e o dinheiro ainda entra tarde.',
    };
}
