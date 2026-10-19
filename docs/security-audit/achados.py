# -*- coding: utf-8 -*-
"""
Os achados da auditoria, como dado — separados de como o PDF os desenha.

Ficam num módulo próprio para que regerar o relatório depois de corrigir algo
seja editar UMA lista, e não caçar texto dentro do gerador. `severidade` e
`categoria` são chaves fechadas de propósito: um valor novo quebra a geração em
vez de sair sem cor no gráfico.
"""

PROJETO = "Botezini ERP"
DATA = "28 de agosto de 2026"

# ── paleta pedida ───────────────────────────────────────────────────────────
CORES = {
    "critica":     "#B91C1C",
    "alta":        "#EA580C",
    "media":       "#D97706",
    "baixa":       "#2563EB",
    "ponto-forte": "#059669",
}

ROTULO_SEVERIDADE = {
    "critica": "CRÍTICA",
    "alta": "ALTA",
    "media": "MÉDIA",
    "baixa": "BAIXA",
    "informativa": "INFORMATIVA",
}

CATEGORIAS = {
    "C1": "Banco sem tranca (isolamento)",
    "C2": "Permissão definida no navegador",
    "C3": "IDOR",
    "C4": "Chaves expostas",
    "C5": "Inputs sem tratamento (XSS)",
}

ESCOPO = (
    "Todo o código-fonte da aplicação (<b>src/</b>, 268 arquivos TypeScript/TSX), "
    "todas as 46 migrações SQL em <b>supabase/</b>, o dump do schema de produção "
    "versionado no repositório, os scripts em <b>scripts/</b>, os arquivos de "
    "ambiente e o histórico completo do Git."
)

METODOLOGIA = [
    ("Stack detectada",
     "SPA React 18 + TypeScript + Vite + Tailwind v4. <b>Não existe backend próprio</b>: "
     "o navegador fala direto com o PostgREST do Supabase usando a chave anônima. "
     "Autenticação: Supabase Auth. Sem Docker, sem CI, sem Helm ou Terraform. "
     "Deploy pela Vercel."),
    ("Mecanismo de isolamento",
     "<b>RLS do PostgreSQL, em modelo single-tenant.</b> Não há filtro por organização: "
     "é uma empresa só, e a separação acontece por PAPEL — <font face=\"Courier\">admin</font>, "
     "<font face=\"Courier\">manager</font> e <font face=\"Courier\">factory</font> — através das funções "
     "<font face=\"Courier\">is_admin_or_manager()</font> e <font face=\"Courier\">is_factory()</font>. "
     "A auditoria mediu se essa tranca existe e se fecha."),
    ("C1 — Banco sem tranca",
     "Mapeado para: tabelas sem RLS habilitada, políticas permissivas demais, e políticas "
     "antigas que sobrevivem a uma migração de endurecimento. <b>Políticas de RLS são "
     "combinadas por OU</b> — uma política frouxa esquecida anula todas as rigorosas."),
    ("C2 — Permissão no navegador",
     "Cada porta que o frontend fecha por papel foi cruzada com o equivalente no servidor: "
     "política de RLS ou verificação dentro da função RPC."),
    ("C3 — IDOR",
     "Sem rotas de backend, o equivalente são as <b>55 funções SECURITY DEFINER</b> — que "
     "ignoram RLS por definição — e o acesso ao Storage por caminho. Todas foram inspecionadas, "
     "uma a uma, não por amostragem."),
    ("C4 — Chaves expostas",
     "Código-fonte, SQL, scripts, arquivos de ambiente, o bundle compilado e o histórico "
     "completo do Git."),
    ("C5 — XSS",
     "Busca por todos os sinks do React e do DOM, por URLs controladas pelo usuário em "
     "<font face=\"Courier\">href</font>/<font face=\"Courier\">src</font>, e pelo caminho de upload de arquivos."),
]

# ── achados ─────────────────────────────────────────────────────────────────
ACHADOS = [
    {
        "id": 1,
        "severidade": "critica",
        "categoria": "C1",
        "titulo": "Qualquer usuário pode se promover a administrador",
        "arquivo": "supabase/schema_live.sqlnpx:2103 (dump de produção)",
        "codigo":
            'CREATE POLICY "owner" ON "public"."profiles"\n'
            '  USING (("auth"."uid"() = "id"))\n'
            '  WITH CHECK (("auth"."uid"() = "id"))',
        "porque":
            "A política não tem cláusula <font face=\"Courier\">FOR</font>, então vale para SELECT, INSERT, "
            "UPDATE e DELETE. A única condição de escrita é que a linha seja a sua — a coluna "
            "<font face=\"Courier\">role</font> fica sem restrição nenhuma.<br/><br/>"
            "A migração <font face=\"Courier\">perfil_nome_e_foto.sql:39-47</font> cria uma política correta, que "
            "prende o cargo no <font face=\"Courier\">WITH CHECK</font>. Mas <b>políticas de RLS são combinadas "
            "por OU</b>: basta uma permitir. A política <font face=\"Courier\">owner</font> nunca é removida — "
            "nenhuma das 46 migrações a derruba, e <font face=\"Courier\">security_hardening_single_tenant.sql</font> "
            "só ACRESCENTA políticas.<br/><br/>"
            "Exploração, do console do navegador, com uma conta <font face=\"Courier\">factory</font>:<br/>"
            "<font face=\"Courier\">await supabase.from('profiles').update({role:'admin'}).eq('id', meuId)</font><br/><br/>"
            "A partir daí <font face=\"Courier\">is_admin_or_manager()</font> passa a devolver verdadeiro, e "
            "todo o Financeiro, todos os dados e todas as RPCs se abrem.",
        "impacto":
            "Escalada completa de privilégio, do papel mais baixo ao de administrador. "
            "Dá acesso a saldos bancários, contas a pagar e receber, cadastro de clientes e "
            "à capacidade de apagar dados.",
        "condicao":
            "Requer uma conta autenticada de qualquer papel. Nenhuma configuração especial. "
            "A chave anônima necessária está publicada no bundle, por desenho.",
        "correcao":
            "Derrubar a política antiga e verificar que nenhuma outra permissiva sobrou:<br/><br/>"
            "<font face=\"Courier\">DROP POLICY IF EXISTS \"owner\" ON public.profiles;</font><br/><br/>"
            "Depois conferir com <font face=\"Courier\">SELECT policyname, cmd, qual, with_check FROM pg_policies "
            "WHERE tablename='profiles';</font> — devem sobrar apenas as duas de "
            "<font face=\"Courier\">perfil_nome_e_foto.sql</font> e a de admin/manager.<br/><br/>"
            "Como defesa em profundidade, um gatilho <font face=\"Courier\">BEFORE UPDATE</font> em "
            "<font face=\"Courier\">profiles</font> que rejeite mudança de <font face=\"Courier\">role</font> quando "
            "<font face=\"Courier\">auth.uid() = NEW.id</font>: a promoção passa a exigir outra pessoa, "
            "independentemente de qual política venha a existir no futuro.",
        "aceite": [
            "A política <font face=\"Courier\">owner</font> não aparece mais em <font face=\"Courier\">pg_policies</font> para <font face=\"Courier\">profiles</font>",
            "Uma conta <font face=\"Courier\">factory</font> recebe erro ao tentar gravar <font face=\"Courier\">role='admin'</font> em si mesma",
            "A mesma conta continua conseguindo alterar o próprio nome e a própria foto",
            "Um administrador continua conseguindo alterar o papel de outra pessoa",
        ],
    },
    {
        "id": 2,
        "severidade": "alta",
        "categoria": "C2",
        "titulo": "Papel de fábrica lê indicadores financeiros por RPC",
        "arquivo": "supabase/fix_liquidez_dias_e_ciclo.sql:9-16, 88-89",
        "codigo":
            "CREATE OR REPLACE FUNCTION public.get_liquidity_kpis(\n"
            "  p_start date, p_end date\n"
            ") RETURNS TABLE(pmr_days, pmp_days, cce_days, coverage_days, avg_daily_outflow)\n"
            "LANGUAGE plpgsql\n"
            "SECURITY DEFINER            -- ignora RLS\n"
            "...\n"
            "GRANT EXECUTE ON FUNCTION public.get_liquidity_kpis(date, date) TO authenticated;",
        "porque":
            "É a <b>única</b> função financeira das 55 auditadas que não chama "
            "<font face=\"Courier\">assert_finance_access()</font>. Sendo <font face=\"Courier\">SECURITY DEFINER</font>, "
            "ela roda com os privilégios do dono e <b>ignora a RLS</b> que protege "
            "<font face=\"Courier\">financial_obligations</font> e <font face=\"Courier\">obligation_payments</font>.<br/><br/>"
            "O frontend esconde o Financeiro do papel <font face=\"Courier\">factory</font> "
            "(<font face=\"Courier\">src/App.tsx:99, 126, 186</font>), mas isso é decisão de navegador. "
            "A RPC está concedida a <font face=\"Courier\">authenticated</font>, sem distinção de papel:<br/>"
            "<font face=\"Courier\">await supabase.rpc('get_liquidity_kpis',{p_start:'2020-01-01',p_end:'2030-01-01'})</font>",
        "impacto":
            "Prazo médio de recebimento e de pagamento, ciclo de conversão de caixa, "
            "saída média diária e dias de cobertura — o retrato financeiro da empresa "
            "para quem só deveria ver o chão de fábrica.",
        "condicao":
            "Conta autenticada com papel <font face=\"Courier\">factory</font>. Expõe agregados, não linhas.",
        "correcao":
            "Acrescentar <font face=\"Courier\">PERFORM public.assert_finance_access();</font> como primeira "
            "instrução do corpo, como já fazem <font face=\"Courier\">set_bank_balance</font>, "
            "<font face=\"Courier\">pay_obligation</font>, <font face=\"Courier\">reverse_payment</font> e "
            "<font face=\"Courier\">recalculate_all_bank_balances</font>.",
        "aceite": [
            "<font face=\"Courier\">get_liquidity_kpis</font> chama <font face=\"Courier\">assert_finance_access()</font> antes de qualquer leitura",
            "Conta <font face=\"Courier\">factory</font> recebe 'Acesso financeiro negado' ao chamar a RPC",
            "O painel financeiro de admin/manager continua carregando os indicadores",
            "Uma consulta a <font face=\"Courier\">pg_proc</font> confirma que nenhuma outra função SECURITY DEFINER financeira ficou sem a checagem",
        ],
    },
    {
        "id": 3,
        "severidade": "alta",
        "categoria": "C2",
        "titulo": "Papel de fábrica altera qualquer coluna de um pedido, inclusive o valor",
        "arquivo": "supabase/security_hardening_single_tenant.sql:169-173",
        "codigo":
            "CREATE POLICY single_tenant_factory_update_orders\n"
            "  ON public.orders\n"
            "  FOR UPDATE TO authenticated\n"
            "  USING (public.is_factory())\n"
            "  WITH CHECK (public.is_factory());",
        "porque":
            "A política autoriza UPDATE na tabela inteira, sem recortar colunas. A intenção "
            "legítima é permitir que a fábrica mova o pedido de setor no kanban — e é só isso "
            "que o frontend oferece. Mas <font face=\"Courier\">orders</font> guarda, nas mesmas linhas, "
            "<font face=\"Courier\">total_amount</font>, <font face=\"Courier\">amount_paid</font>, "
            "<font face=\"Courier\">discount</font>, <font face=\"Courier\">status</font> e "
            "<font face=\"Courier\">client_id</font> (<font face=\"Courier\">supabase/schema_botezini.sql:347-357</font>).<br/><br/>"
            "<font face=\"Courier\">await supabase.from('orders').update({total_amount:0}).eq('id', qualquerPedido)</font>",
        "impacto":
            "Adulteração do valor de venda, do desconto e do valor já pago; troca do cliente "
            "do pedido; marcação de pedidos como entregues. Contamina faturamento, margem e "
            "as contas a receber geradas a partir do pedido.",
        "condicao":
            "Conta autenticada com papel <font face=\"Courier\">factory</font>. Explorável direto pelo cliente Supabase.",
        "correcao":
            "PostgreSQL não recorta colunas dentro de uma política. Dois caminhos:<br/><br/>"
            "<b>(a)</b> Um gatilho <font face=\"Courier\">BEFORE UPDATE</font> em <font face=\"Courier\">orders</font> que, "
            "quando <font face=\"Courier\">is_factory()</font>, rejeite qualquer alteração fora de "
            "<font face=\"Courier\">production_stage</font>, <font face=\"Courier\">items</font> e "
            "<font face=\"Courier\">updated_at</font>.<br/><br/>"
            "<b>(b)</b> Remover a política e mover o avanço de etapa para uma RPC "
            "<font face=\"Courier\">SECURITY DEFINER</font> que aceite só o pedido e o setor — no mesmo "
            "molde de <font face=\"Courier\">log_production</font>. É a opção mais limpa, porque a "
            "superfície passa a ser um argumento em vez de uma tabela.",
        "aceite": [
            "Conta <font face=\"Courier\">factory</font> não consegue alterar <font face=\"Courier\">total_amount</font>, <font face=\"Courier\">discount</font>, <font face=\"Courier\">amount_paid</font> nem <font face=\"Courier\">client_id</font>",
            "A mesma conta continua movendo cartões entre setores no kanban",
            "Existe teste ou consulta que comprove a recusa",
        ],
    },
    {
        "id": 4,
        "severidade": "media",
        "categoria": "C4",
        "titulo": "Credenciais no histórico do Git",
        "arquivo": ".env, .env.local, .env.vercel — commits ea41fd6, b1dd8b4, 51f0dfc",
        "codigo":
            'VERCEL_OIDC_TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIs..."   # truncado\n'
            'VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # 2 projetos',
        "porque":
            "Três arquivos de ambiente foram versionados e depois removidos do rastreio, "
            "mas <b>permanecem recuperáveis no histórico</b>: qualquer pessoa com acesso ao "
            "repositório (inclusive um clone antigo) lê os valores com "
            "<font face=\"Courier\">git log -p</font>.<br/><br/>"
            "O <font face=\"Courier\">VERCEL_OIDC_TOKEN</font> é credencial real de deploy — os dois exemplares "
            "encontrados já expiraram (<font face=\"Courier\">exp</font> de ~12 h), o que reduz o dano "
            "<i>destes</i>, mas confirma que o fluxo de trabalho comita segredo.<br/><br/>"
            "As <font face=\"Courier\">VITE_SUPABASE_ANON_KEY</font> (de dois projetos, "
            "<font face=\"Courier\">diajunbzicuruxqyfngm</font> e <font face=\"Courier\">ggrmdfagierzntrtzpey</font>) "
            "são <b>públicas por desenho</b> — vão no bundle de qualquer forma. Não são vazamento; "
            "o que elas revelam é a identidade dos projetos, e o quanto a segurança depende "
            "inteiramente da RLS estar correta.",
        "impacto":
            "Tokens de deploy expirados, portanto sem impacto direto hoje. O risco é o padrão: "
            "o próximo segredo comitado pode ser de vida longa. Os refs de projeto expostos "
            "tornam o achado nº 1 diretamente endereçável.",
        "condicao":
            "Acesso de leitura ao repositório ou a qualquer clone.",
        "correcao":
            "Rotacionar o token da Vercel por precaução. Reescrever o histórico "
            "(<font face=\"Courier\">git filter-repo --path .env --path .env.local --path .env.vercel --invert-paths</font>) "
            "e forçar o envio, avisando quem tiver clone — ou, se reescrever não for viável, "
            "registrar a decisão de aceitar o risco por os tokens já terem expirado. "
            "O <font face=\"Courier\">.gitignore</font> já cobre <font face=\"Courier\">.env*</font> desde "
            "<font face=\"Courier\">51f0dfc</font>; acrescentar um hook de pré-commit que recuse padrões de segredo.",
        "aceite": [
            "Token da Vercel rotacionado",
            "<font face=\"Courier\">git log --all -S 'VERCEL_OIDC_TOKEN'</font> não retorna nada, OU a exceção está registrada por escrito",
            "Hook de pré-commit recusa arquivos <font face=\"Courier\">.env</font> e cadeias no formato JWT",
        ],
    },
    {
        "id": 5,
        "severidade": "media",
        "categoria": "C3",
        "titulo": "Anexo sem validação de tipo, e URL assinada para caminho arbitrário",
        "arquivo": "src/repositories/attachmentRepository.ts:9-14, 20-27",
        "codigo":
            "const ext = file.name.split('.').pop();          // linha 9 — vem do usuário\n"
            "const fileName = `${user.id}/${folder}/${Date.now()}_...${ext}`;\n"
            "await supabase.storage.from('financial-attachments').upload(fileName, file);\n"
            "\n"
            "async getAttachmentUrl(path: string) {           // linha 20 — path do chamador\n"
            "  ...createSignedUrl(path, 3600);\n"
            "}",
        "porque":
            "<b>Sem validação de tipo:</b> a extensão sai do nome do arquivo, sem lista de "
            "permitidos e sem conferir o MIME. Um <font face=\"Courier\">.svg</font> ou um HTML disfarçado "
            "é aceito, e o visualizador o entrega em "
            "<font face=\"Courier\">&lt;iframe src={url}&gt;</font> ou num link direto "
            "(<font face=\"Courier\">src/components/finance/AttachmentViewer.tsx:54, 61</font>). "
            "Script embutido executa na origem do Storage — outro domínio que não o do app, "
            "o que limita o dano, mas é XSS armazenado numa origem confiável.<br/><br/>"
            "<b>Caminho arbitrário:</b> <font face=\"Courier\">getAttachmentUrl</font> assina o que receber. "
            "Como o caminho começa com o id de quem enviou, informar o id de outra pessoa é IDOR "
            "direto — <i>a menos que</i> a política do bucket barre. "
            "<b>Não há política de Storage versionada em nenhuma das 46 migrações</b>, então essa "
            "proteção não pode ser confirmada a partir do código.",
        "impacto":
            "Leitura de anexos financeiros de terceiros (notas, comprovantes) se a política "
            "do bucket for permissiva; execução de script numa origem confiável via arquivo enviado.",
        "condicao":
            "O IDOR depende da política do bucket <font face=\"Courier\">financial-attachments</font>, que não "
            "está no repositório e precisa ser conferida no painel do Supabase. A falta de "
            "validação de tipo é incondicional.",
        "correcao":
            "Restringir tipo e tamanho no envio (lista de permitidos por MIME <b>e</b> extensão) e "
            "passar <font face=\"Courier\">contentType</font> explícito no upload. Versionar a política do bucket "
            "numa migração, restringindo por prefixo de caminho — "
            "<font face=\"Courier\">(storage.foldername(name))[1] = auth.uid()::text</font> — ou por papel, "
            "conforme a regra do negócio. Servir anexo com "
            "<font face=\"Courier\">Content-Disposition: attachment</font>.",
        "aceite": [
            "Envio recusa extensão fora da lista permitida (teste com <font face=\"Courier\">.svg</font> e <font face=\"Courier\">.html</font>)",
            "A política do bucket está numa migração dentro de <font face=\"Courier\">supabase/</font>",
            "Usuário A recebe erro ao pedir URL assinada de um caminho do usuário B",
            "Anexo abre como download, não renderizado inline",
        ],
    },
    {
        "id": 6,
        "severidade": "baixa",
        "categoria": "C1",
        "titulo": "Tabelas de almoxarifado abertas a qualquer usuário autenticado",
        "arquivo": "supabase/schema_live.sqlnpx (dump de produção) — 5 políticas",
        "codigo":
            'CREATE POLICY "authenticated" ON "public"."wms_items"          USING ((auth.uid() IS NOT NULL))\n'
            'CREATE POLICY "authenticated" ON "public"."wms_categories"     USING ((auth.uid() IS NOT NULL))\n'
            'CREATE POLICY "authenticated" ON "public"."wms_item_variations" USING ((auth.uid() IS NOT NULL))\n'
            'CREATE POLICY "authenticated" ON "public"."wms_stock_items"    USING ((auth.uid() IS NOT NULL))\n'
            'CREATE POLICY "authenticated" ON "public"."wms_stock_movements" USING ((auth.uid() IS NOT NULL))',
        "porque":
            "<font face=\"Courier\">auth.uid() IS NOT NULL</font> é verdadeiro para <b>todo</b> usuário logado. "
            "A RLS está habilitada — o que faz a tabela parecer protegida numa auditoria "
            "superficial — mas a condição não filtra nada. Sem cláusula "
            "<font face=\"Courier\">FOR</font>, vale também para escrita e exclusão.<br/><br/>"
            "Atenuante verificado: <b>o frontend não referencia nenhuma tabela "
            "<font face=\"Courier\">wms_*</font></b> — busca por <font face=\"Courier\">wms_</font> em "
            "<font face=\"Courier\">src/</font> não retorna nada. São remanescentes de um módulo de "
            "almoxarifado que não está em uso.",
        "impacto":
            "Leitura e escrita irrestritas em cinco tabelas por qualquer conta autenticada, "
            "incluindo <font face=\"Courier\">factory</font>. Hoje sem dado sensível em uso; o risco é a "
            "tabela voltar a ser usada com a política frouxa ainda no lugar.",
        "condicao":
            "Qualquer conta autenticada. Sem impacto prático enquanto as tabelas seguirem vazias e sem uso.",
        "correcao":
            "Se o módulo foi abandonado, remover as tabelas — código morto com porta aberta é "
            "pior que código morto. Se houver plano de retomá-lo, trocar a política pelo padrão "
            "do resto do sistema: <font face=\"Courier\">USING (public.is_admin_or_manager())</font>.",
        "aceite": [
            "As tabelas <font face=\"Courier\">wms_*</font> foram removidas OU passaram a usar <font face=\"Courier\">is_admin_or_manager()</font>",
            "Nenhuma política do banco usa <font face=\"Courier\">auth.uid() IS NOT NULL</font> como única condição",
        ],
    },
]

# ── pontos fortes ───────────────────────────────────────────────────────────
PONTOS_FORTES = [
    ("Nenhum sink de XSS no frontend inteiro",
     "Busca em 268 arquivos: zero ocorrências de <font face=\"Courier\">dangerouslySetInnerHTML</font>, "
     "<font face=\"Courier\">.innerHTML</font>, <font face=\"Courier\">eval()</font> ou "
     "<font face=\"Courier\">new Function()</font>. Todo texto vindo do usuário passa pelo escape "
     "automático do JSX. Não há renderização de Markdown nem de HTML."),
    ("URL de WhatsApp construída à prova de esquema perigoso",
     "<font face=\"Courier\">src/utils/mensagensCliente.ts:457-462</font> — o telefone é reduzido a dígitos "
     "(<font face=\"Courier\">replace(/\\D/g,'')</font>), o texto passa por "
     "<font face=\"Courier\">encodeURIComponent</font> e o endereço é fixo em "
     "<font face=\"Courier\">https://wa.me/</font>. Um <font face=\"Courier\">javascript:</font> não tem por onde entrar."),
    ("Cadastro de usuário não aceita papel vindo do cliente",
     "<font face=\"Courier\">security_hardening_single_tenant.sql:66-80</font> — "
     "<font face=\"Courier\">handle_new_user()</font> grava <font face=\"Courier\">'factory'</font> literal, ignorando "
     "<font face=\"Courier\">raw_user_meta_data</font>. E a coluna tem "
     "<font face=\"Courier\">DEFAULT 'factory'</font>. Fecha a escalada mais comum em Supabase: "
     "pedir <font face=\"Courier\">role: admin</font> no cadastro."),
    ("A política de edição de perfil foi escrita corretamente",
     "<font face=\"Courier\">perfil_nome_e_foto.sql:39-47</font> prende o cargo no "
     "<font face=\"Courier\">WITH CHECK</font>, comparando com o valor atual. O raciocínio está certo e "
     "documentado no próprio arquivo — ela só não tem efeito porque a política antiga "
     "sobreviveu (achado nº 1)."),
    ("RLS habilitada em 30 de 30 tabelas de produção",
     "Conferido no dump versionado: toda tabela do schema <font face=\"Courier\">public</font> aparece com "
     "<font face=\"Courier\">ENABLE ROW LEVEL SECURITY</font>. As tabelas criadas depois "
     "(<font face=\"Courier\">leads</font>, <font face=\"Courier\">client_contacts</font>, "
     "<font face=\"Courier\">consumo_nao_apurado</font>, <font face=\"Courier\">rendimento_do_corte</font>, "
     "<font face=\"Courier\">producao_baixas</font>) trazem RLS e política nas próprias migrações."),
    ("50 de 55 funções SECURITY DEFINER verificam autorização",
     "Todas as funções financeiras que escrevem — <font face=\"Courier\">pay_obligation</font>, "
     "<font face=\"Courier\">reverse_payment</font>, <font face=\"Courier\">cancel_obligation</font>, "
     "<font face=\"Courier\">set_bank_balance</font>, <font face=\"Courier\">recalculate_all_bank_balances</font>, "
     "<font face=\"Courier\">move_envelope</font>, <font face=\"Courier\">transfer_envelope</font> — abrem com "
     "<font face=\"Courier\">assert_finance_access()</font>. As de produção verificam "
     "<font face=\"Courier\">is_admin_or_manager() OR is_factory()</font>. As cinco sem checagem são "
     "gatilhos internos ou o auxiliar <font face=\"Courier\">current_user_role()</font>, exceto o achado nº 2."),
    ("Papel anônimo revogado de tudo",
     "<font face=\"Courier\">security_hardening_single_tenant.sql:83-86</font> — "
     "<font face=\"Courier\">REVOKE ALL</font> em tabelas, sequências e funções para "
     "<font face=\"Courier\">anon</font>. Sem sessão, o banco não responde nada."),
    ("A chave no bundle é a anônima, como deve ser",
     "<font face=\"Courier\">src/config/env.ts:21-22</font> lê apenas "
     "<font face=\"Courier\">VITE_SUPABASE_URL</font> e <font face=\"Courier\">VITE_SUPABASE_ANON_KEY</font>. "
     "Nenhuma <font face=\"Courier\">service_role</font> no código, no bundle ou no histórico. "
     "Sem valores embutidos: ausência de chave apenas liga o Modo Restrito, "
     "não cai num padrão inseguro."),
    ("Nenhum IDOR nas funções RPC",
     "As 55 funções SECURITY DEFINER foram lidas uma a uma. As que recebem id — "
     "<font face=\"Courier\">informar_gasto_do_corte</font>, <font face=\"Courier\">resolver_consumo_nao_apurado</font>, "
     "<font face=\"Courier\">reverse_payment</font>, <font face=\"Courier\">cancel_obligation</font> — verificam papel "
     "antes de agir. No modelo single-tenant, papel é o critério correto: não existe "
     "dono por linha a conferir."),
]

PONTOS_FRACOS = [
    ("Uma política esquecida anula todo o endurecimento",
     "O risco central. O sistema foi migrado de um modelo por dono "
     "(<font face=\"Courier\">auth.uid() = user_id</font>) para um modelo por papel, mas a migração de "
     "endurecimento só ACRESCENTA políticas — nunca derruba as antigas. Como políticas de RLS "
     "são combinadas por OU, as antigas continuam valendo em paralelo. Em "
     "<font face=\"Courier\">profiles</font> isso é escalada de privilégio; nas demais tabelas é "
     "permissividade extra que ninguém revisou."),
    ("A separação de papéis existe na tela, não sempre no banco",
     "O frontend fecha o Financeiro para o papel <font face=\"Courier\">factory</font> em três pontos de "
     "<font face=\"Courier\">App.tsx</font>. No servidor, quase tudo tem o equivalente — mas as duas "
     "exceções encontradas (achados 2 e 3) são justamente as que dão acesso a dinheiro."),
    ("A superfície de segurança do Storage não está no repositório",
     "Nenhuma das 46 migrações versiona política de bucket. Quem revisar o código não tem "
     "como saber se os anexos financeiros estão protegidos, e um ajuste feito no painel não "
     "deixa rastro em revisão nem em histórico."),
]

RECOMENDACOES = [
    ("P1", "critica",
     "Derrubar a política <font face=\"Courier\">owner</font> de <font face=\"Courier\">profiles</font> e auditar "
     "políticas duplicadas em todas as tabelas",
     "É uma linha de SQL e fecha a escalada de privilégio. Na mesma sessão, listar "
     "<font face=\"Courier\">pg_policies</font> inteiro e derrubar toda política do modelo antigo por dono "
     "que tenha sobrevivido — o problema do achado nº 1 pode estar repetido em silêncio "
     "em outras tabelas."),
    ("P2", "alta",
     "Fechar as duas portas do papel de fábrica para o dinheiro",
     "Acrescentar <font face=\"Courier\">assert_finance_access()</font> em "
     "<font face=\"Courier\">get_liquidity_kpis</font> e restringir por gatilho as colunas que "
     "<font face=\"Courier\">factory</font> pode alterar em <font face=\"Courier\">orders</font>. Juntas, são as duas "
     "exceções à regra que o resto do sistema já segue."),
    ("P3", "media",
     "Versionar a política do bucket e validar o tipo do anexo",
     "Trazer a autorização do Storage para dentro de <font face=\"Courier\">supabase/</font>, onde é revisável, "
     "e restringir o envio por MIME e extensão."),
    ("P4", "media",
     "Rotacionar o token da Vercel e barrar segredo no pré-commit",
     "Os tokens encontrados já expiraram; o que precisa mudar é o hábito que os comitou."),
    ("P5", "baixa",
     "Remover as tabelas <font face=\"Courier\">wms_*</font> ou alinhá-las ao padrão",
     "Cinco tabelas sem uso com política que não filtra nada. Remover é melhor que corrigir: "
     "não há código que dependa delas."),
]
