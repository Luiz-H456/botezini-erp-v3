# Financeiro v3 — fechamento da execução

Plano: docs/superpowers/plans/2026-10-06-financeiro-v3.md · Spec: docs/superpowers/specs/2026-10-06-financeiro-v3-design.md
Executado em 06/10/2026 por subagentes (tarefas 1–14 e 16; a 15 foi substituída pelo desenho da navegação por objetivos).
Commits: 2adf801..c428269. Suíte: 1363 testes passando; tsc limpo. Revisão geral + re-revisão: limpas.

## Antes de apagar as telas antigas (portão)
- **I4:** não existe, na v3, "desfazer conferência com motivo". Hoje só nas telas antigas (Finance.tsx). Tem de entrar no plano da navegação antes de elas saírem.
- O teste `nenhuma seção volta a ser uma lista longa` (navegacao.test.ts) teve o teto subido de 3 para 4 por causa da entrada provisória "Finanças v3" — voltar a 3.
- 07/10: decisão de adaptar a tela atual em vez de manter as telas novas (spec 2026-10-07-financas-v3-adaptacao-design.md). I4 resolvido: desfazer conferência com motivo continua no cartão da conta. O teto de navegação fica em 4 até o Resultado ir para "Como estamos indo".

## Para rodar na produção (o Luiz roda; nesta ordem; app só depois)
1. `supabase/financeiro_v3_1_entrega.sql` — antes, comparar (leitura) o corpo da view obligation_summary e das 5 funções com o vivo da produção: o arquivo foi escrito a partir do dump de 06/10.
2. `supabase/financeiro_v3_2_conferencia_e_entrega.sql` — função marcar_conferida e trigger que preenche delivered_at.
3. Conferência: `supabase/conferencia_financeiro_v3.sql` (só leitura).

## Achados nos dados de produção (não mexidos)
- Pagamento `204cb2cb-166e-4fe7-8ec3-aa95df6183aa`: R$ 209.254,00 em 10/09/2026, banco Botezini, numa conta de R$ 2.546,67 ("Salário integral — Zelia (1/12)"). Provável erro de digitação; o caminho limpo é estornar e lançar o valor certo.
- Categorias globais "Imposto" e "Cartão de crédito" marcadas custo_do_produto = true.
- Dois cadastros de cliente com o mesmo nome "Granha Ligas".
- 22 pedidos entregues antes da v3 têm delivered_at aproximado por updated_at (a migração lista todos).

## Decisões tomadas durante a execução
- (1) As verificações no navegador (login com o usuário de teste da v3) ficam com o controlador, não com os implementadores; os implementadores rodam testes, tsc e as consultas SQL e não sobem dev server — o servidor `botezini-v3` (porta 5175, strictPort) já está de pé na sessão do controlador — um segundo `npm run dev:v3` falharia na porta, e o navegador é um só — custo se errado: um defeito visual passa uma tarefa adiante até o checkpoint do controlador (após T8, T11, T14, T16).
- (2) Ordem de execução 1→14, depois 16; 15 pulada — decisão do Luiz — custo se errado: nenhum; T16 não depende de T15.
- (3) Plano ajustado antes das tarefas 2/4/5/12: Resultado ganha Mês|Trimestre (trimestreDe, nomeDoTrimestre; caixaDoPeriodo/vendasDoPeriodo recebem meses: string[]) — pedido explícito do Luiz em 06/10 ("quero ver lucro e resultado trimestral também"); spec 4.2 atualizada — custo se errado: renomear duas funções e tirar um seletor
- (4) Janelas novas do financeiro renderizam via createPortal(..., document.body), como as janelas de caixinha já fazem — o Modal comum não usa portal e fica preso ao contêiner do kanban — custo se errado: nenhum; vale para as tarefas 8–14
- (5) Parcela proposta pela janela de entrega vence em max(prazo do pedido, hoje) — parcela nova não pode nascer vencida; a spec diz 'o prazo', escrita quando o prazo ainda não tinha passado — custo se errado: o Luiz troca a data na janela
- (6) A checagem de cancelamento rodando antes de os pagamentos carregarem (minor do revisor) entra no fix de I1 — é a mesma função e decide se a conta pode ser cancelada — custo se errado: nenhum
- (7) O minor 'texto sem dígitos vira 0,00 e pode dizer bate com o extrato' entra no fix de I1 — é um falso ✓ de conferência, mesma janela — custo se errado: nenhum
- (8) Filtro padrão da lista vira 'Agora' (vencidas + próximos 7 dias, pagar e receber) em vez de 'Abertas': o checkpoint mostrou 391 contas abertas por causa das recorrentes futuras, o contrário da tela leve que o Luiz pediu; 'Abertas' continua um clique ao lado — custo se errado: trocar o padrão de volta numa constante
- (9) Aceito o acréscimo do implementador na T11: com 'agora', busca/cliente deixam passar as que aguardam entrega (preserva a regra da spec de que procurar mostra essas parcelas) — custo se errado: uma busca no 'Agora' mostra também parcelas em produção
- (10) Classificação de saída: imposto casa por nome no singular ou plural (normalizeCategoryName contém 'imposto') e tem precedência; sem global_category_id, a categoria global é achada pelo nome normalizado para ler custo_do_produto — custo se errado: um lançamento muda de linha no Resultado
- (11) Clique na barra de categoria abre a Visão geral com categoria + 'Pagas' e SEM filtro de mês: as barras somam por data de pagamento e o filtro de mês da lista usa vencimento, então o mês dava um conjunto diferente do total — custo se errado: a lista mostra pagamentos de outros meses daquela categoria
- (12) Fix wave inclui I1, I2, I3, I5, I6, I7 e os 3 minors must-fix; I4 (desfazer conferência com motivo na v3) vai para o plano da navegação, com prazo: antes de apagar as telas antigas — custo se errado: até lá, desfazer conferência só pela tela antiga
- (13) I1 resolve com função nova no banco que só MARCA (idempotente), em supabase/financeiro_v3_2_*.sql aplicado só no local — o toggle atual não tem como ser seguro contra outra aba — custo se errado: um arquivo SQL a mais para o Luiz rodar
- (14) I7 resolve com trigger que preenche orders.delivered_at quando status vira 'Entregue' (vale para o app antigo também) — custo se errado: trigger a mais em orders
- (15) I6: no saveOrderStage, se a criação do recebível falhar por 'Acesso financeiro negado', a entrega segue como sucesso (o recebível já existe desde a conversão do pedido; pedido sem plano fica para o financeiro) — custo se errado: pedido antigo sem plano entregue pela fábrica fica sem conta a receber até alguém do financeiro abrir

## Pequenas pendências adiadas (nenhuma bloqueia; triadas pela revisão geral)
- T1: senha do usuário de teste vai no argv do docker e poderia ecoar num erro do psql
- T1: criar_usuario_teste.sh não protege contra V3_TESTE_EMAIL ausente nem .env.v3.local sem quebra de linha final
- T1: sem .gitattributes, checkout com autocrlf vira os .sh em CRLF e quebra o `sh`
- T1: `IS DISTINCT FROM 'Entregue'` também marca como aguardando um futuro status 'Cancelado' (0 linhas hoje)
- T2: centavos(1.005) dá 1, não 1.01 — Number.EPSILON não ajuda acima de 2; teste de 'meio centavo' só cobre valor pequeno (+3 minors no task-2-review.md)
- T3: 4 opcionais — acumulador sem arredondar em projecao.ts, sem teste de conta a pagar com awaiting_delivery, bordas sem teste, um cast 'as' (ver task-3-review.md)
- T4: categoria com saldo líquido negativo some do porCategoria mas fica nos totais; bordas sem teste; nome global vazio (ver task-4-review.md)
- T5: progressoDaMeta arredonda 99,5% para 100% e pode ficar negativo; auto_fund_pct sem teto de 100; literal 'Entregue' fixo e delivered_at nulo sem teste; lacunas de teste (vendas em vários meses, desempate por created_at)
- T6: ordem de separarParcelas e planoMudou casa por índice sem desempate por installment_no; planoMudou sem Number() (a UI já grava número); faltam testes de 'Sobram', planoMudou com 'Parcela única' e parcela fixa paga em parte
- T7: lacunas de teste (desempate por aVencer); saldo do banco sem centavos; FILTROS_VAZIOS não congelado; filtro 'hoje' deixa passar aguardando entrega quando há busca/cliente, 'semana' não
- T8: 7 — campos de valor ignoram o modo privacidade; Voltar/X ativos durante o salvamento; 'tirar' sem aria-label; entrada numérica sem arredondar; docblock fora do lugar; estado inicial de carregando; modal sem rolagem nem ajuste para celular (ver task-8-review.md)
- T9: restante com ruído de ponto flutuante; sim/não sem aria-pressed; janela fecha durante o salvamento; 85vh + cabeçalho pode cortar em celular baixo; dois botões com a mesma ação; valor editável sem máscara de privacidade (igual ao PaymentModal)
- T10: 85vh + cabeçalho pode cortar em celular baixo; botões 'conferido' sem aria-label e erro sem role=alert; onAlterado dentro do try pode rotular sucesso como falha; diferença sem sentido (a mais/a menos); linha mostra paid_amount da conta inteira, não a parte daquele banco
- T11: onFechar da baixa recarrega até em cancelamento simples; recarregar() concorrente pode resolver fora de ordem; recorte mantém os outros filtros (tipo velho pode esvaziar a lista); '✓' e Recebi/Paguei sem aria-label; no modo privacidade a linha do saldo e o âmbar ainda aparecem
- T12: h1 não acompanha o período; deps de useMemo acusariam o lint exhaustive-deps (estão certas); barras desabilitadas/Outros sem dica nem foco; categorias de mesmo nome colapsam num id; larguras das barras aparecem no modo privacidade
- T13: zeros piscam antes da visão carregar; acessibilidade das janelas; botões de ação pequenos sem estilo; 'depois' sem tratamento de erro; salvar formulário ignora falha
- T14: '1 dias'; link Cobrar sem aria-label e área de toque pequena; th vazio sem nome acessível; coluna Cliente não fixa na rolagem do celular (+5 no task-14-review.md)
