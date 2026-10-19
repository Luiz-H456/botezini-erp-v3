// O pré-prompt que transforma uma lista bruta no CSV que o importador espera.
//
// Mora aqui, e não dentro do componente, por dois motivos: é texto que vai mudar
// com o uso (a regra que mais falha é a que precisa de ajuste), e ele é a
// especificação do formato tanto quanto o parser é. Quem mexer nas colunas de
// `importacaoDeLeads.ts` tem de mexer aqui — estarem no mesmo diretório é o
// lembrete mais barato disso.
//
// A ordem das regras não é decorativa. A nº 1 vem primeiro porque é a única
// irreversível: um telefone plausível e errado custa uma ligação para a pessoa
// errada, e nenhuma conferência posterior pega isso.
//
// As regras 7 a 9 entraram com a fase 4 da Prospecção 2.0. A do capital social
// diz DUAS vezes para não escrever zero, e não é redundância: "capital social:
// 0" é a saída natural de uma IA que não achou o dado e quer preencher a
// coluna — e zero, diferente de vazio, é uma afirmação sobre a empresa que vai
// pesar na fila do dia.

import { COLUNAS_ESPERADAS, SEGMENTOS } from './importacaoDeLeads.ts';

export const PRE_PROMPT_DO_CSV = `Você vai normalizar uma lista de empresas para importação num ERP de confecção de uniformes profissionais. O destino é uma aba de prospecção: cada linha é uma empresa que talvez seja abordada por telefone ou WhatsApp.

Devolva APENAS um CSV, com este cabeçalho exato, nesta ordem:
${COLUNAS_ESPERADAS.join(',')}

REGRAS

1. NUNCA invente dado. Campo sem informação na fonte fica VAZIO.
   Um telefone plausível e errado é pior que um campo em branco: alguém vai ligar.
   Isto vale especialmente para CNPJ. Não complete, não deduza, não "corrija".

2. razao_social é o único campo obrigatório. Linha sem ele não entra.

3. cnpj: apenas dígitos, 14 caracteres, sem pontos, barras ou traços.
   CNPJ incompleto, ilegível ou de filial não confirmada: deixe VAZIO.

4. telefone: apenas dígitos, com DDD. Celular 11 dígitos, fixo 10.
   Vários números: use o primeiro e ponha os demais em observacao.

5. porte_funcionarios: inteiro estimado de funcionários.
   Se a fonte der faixa ("50 a 100"), use o PISO (50).
   Se der só faturamento ou área, deixe vazio — não converta por regra de bolso.

6. segmento: uma palavra em minúscula, escolhida SOMENTE desta lista:
   ${SEGMENTOS.join(', ')}
   Não crie categorias novas. Na dúvida entre duas, use "outro".

7. capital_social: o capital social em reais, se a fonte trouxer.
   Use ponto de milhar e vírgula decimal (1.500.000,00) ou só os dígitos.
   NÃO confunda com faturamento, receita ou patrimônio — são outras coisas.
   Sem o dado, deixe VAZIO. Nunca escreva 0: zero é uma afirmação sobre a
   empresa, e o que você tem é ausência de informação.

8. cnae_principal: o código CNAE principal, no formato da fonte (8610-1/01).
   Só o principal, nunca os secundários. Vazio se não souber.

9. data_abertura: a data de abertura da empresa, em 2020-05-14 ou 14/05/2020.
   Vazio se a fonte não trouxer. Não estime pelo "desde 1998" do site.

10. uf: duas letras maiúsculas. cidade: nome por extenso, sem UF junto.

11. contato_cargo: o que a fonte disser, minúsculo e curto
   (compras, rh, diretoria, administrativo, financeiro).
   Vazio se não souber. Não deduza cargo pelo nome da pessoa.

12. Uma linha por EMPRESA, nunca por contato.
   Dois contatos da mesma empresa: escolha o de compras ou administrativo
   e ponha o outro em observacao.

13. observacao: o que não coube nos campos e ajuda a abordar —
    horário de funcionamento, quem decide, número de unidades,
    se já foi cliente, se usa uniforme hoje, telefone secundário.
    Sem opinião sua, sem "parece ser um bom lead".

14. Campos com vírgula vão entre aspas duplas.

15. Não escreva nada antes do CSV: sem introdução, sem markdown, sem crase tripla.

Segue a lista:
`;
