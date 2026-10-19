# =============================================================================
# CONFERIR O BACKUP — Botezini ERP
#
# Restaura o dump mais recente num banco DESCARTÁVEL e conta o que chegou.
#
#     powershell -ExecutionPolicy Bypass -File .\scripts\conferir_backup.ps1
#
# POR QUE ISTO EXISTE
#   O backup.ps1 confere quatro coisas no arquivo: tamanho, tabelas, dado e se
#   o dump fechou. Nada disso prova que ele RESTAURA. Um dump pode estar
#   íntegro e mesmo assim quebrar na volta — ordem de dependência, extensão que
#   falta, papel que não existe, objeto de dono errado. Só se descobre
#   restaurando, e o pior dia para descobrir é o dia em que você precisa dele.
#
#   Um backup que ninguém restaurou é uma hipótese, não um backup.
#
# NÃO TOCA NA PRODUÇÃO
#   Este script não conhece a BOTEZINI_DB_URI e não fala com o Supabase. Ele
#   sobe um Postgres vazio num contêiner, despeja o arquivo lá dentro e destrói
#   o contêiner no fim. Não há como ele escrever no banco de verdade.
# =============================================================================

param(
    [string]$Arquivo
)

$ErrorActionPreference = 'Stop'

# -----------------------------------------------------------------------------
# Chamar o docker sem que o PowerShell exploda
#
# No Windows PowerShell 5.1, redirecionar a saída de erro de um executável
# NATIVO embrulha cada linha num ErrorRecord. Com $ErrorActionPreference='Stop'
# isso vira EXCEÇÃO — mesmo quando o comando terminou bem.
#
# Os argumentos vão num ARRAY único, e não soltos. Soltos, o PowerShell tenta
# casá-los com os parâmetros da função antes de repassar, e o `-e` do
# `docker run` vira "nome de parâmetro ambíguo" por parecer o começo de
# -ErrorAction.
# -----------------------------------------------------------------------------
function Invoke-DockerSilencioso {
    param([string[]]$Argumentos)
    $antes = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & docker @Argumentos 2>&1 | Out-Null } finally { $ErrorActionPreference = $antes }
}

# A imagem tem de ser a do SUPABASE, não o Postgres puro.
#
# O backup.ps1 despeja o banco INTEIRO: junto com o `public` vêm `auth`,
# `storage`, `vault`, `realtime` e `graphql`. Isso é desejável — é por isso que
# o backup carrega o auth.users, ou seja, as contas de login de quem usa o
# sistema.
#
# Mas o dump abre com CREATE EXTENSION supabase_vault, que só existe na
# distribuição do Supabase. No postgres:17 oficial o psql parava ali e esta
# conferência anunciava "ESTE BACKUP NAO RESTAURA" — dizendo do backup um
# defeito que era do banco de teste. O mesmo valeria para os papéis
# authenticated, anon e service_role, que as políticas de RLS citam pelo nome.
#
# A versão acompanha a do servidor. Se um dia o Supabase atualizar, o cabeçalho
# do próprio dump diz qual usar: "Dumped from database version".
$ImagemPostgres = 'supabase/postgres:17.6.1.167'
$Cont  = 'botezini_conferencia'
$Senha = 'conferencia'

$Raiz    = Split-Path -Parent $PSScriptRoot
$Destino = Join-Path $Raiz 'backups'

Write-Host ""
Write-Host "  CONFERENCIA DO BACKUP" -ForegroundColor Cyan
Write-Host "  ---------------------"

Invoke-DockerSilencioso @('info')
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Docker nao esta respondendo. Abra o Docker Desktop." -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($Arquivo)) {
    $Alvo = Get-ChildItem -Path $Destino -Filter '*.sql' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $Alvo) {
        Write-Host ""
        Write-Host "  Nao ha nenhum .sql em backups." -ForegroundColor Yellow
        Write-Host "  Rode primeiro:  .\scripts\backup.ps1"
        Write-Host ""
        exit 2
    }
} else {
    if (-not (Test-Path $Arquivo)) {
        Write-Host "  Arquivo nao encontrado: $Arquivo" -ForegroundColor Red
        exit 1
    }
    $Alvo = Get-Item $Arquivo
}

$Mb = [math]::Round($Alvo.Length / 1MB, 2)
Write-Host "  Conferindo: $($Alvo.Name)  ($Mb MB, de $($Alvo.LastWriteTime.ToString('dd/MM HH:mm')))"
Write-Host ""

Invoke-DockerSilencioso @('rm', '-f', $Cont)
Write-Host "  Subindo um banco vazio... (a imagem do Supabase demora a iniciar)" -ForegroundColor DarkGray
Invoke-DockerSilencioso @('run', '-d', '--name', $Cont, '-e', "POSTGRES_PASSWORD=$Senha", $ImagemPostgres)
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Nao consegui subir o conteiner." -ForegroundColor Red
    exit 1
}

try {
    # ESPERAR DIREITO.
    #
    # A imagem do Supabase roda uma inicialização longa, e durante ela sobe um
    # servidor TEMPORÁRIO só para aplicar as migrações — que depois é desligado
    # e reiniciado. Um pg_isready ingênuo responde "pronto" contra esse servidor
    # temporário, e a restauração começava cedo demais: o servidor desligava no
    # meio e o psql morria com "server closed the connection unexpectedly", que
    # não parece nada com "esperei de menos".
    #
    # Por isso são duas condições, e não uma: o log dizer que o init terminou, E
    # uma consulta de verdade responder.
    Write-Host "  Esperando o banco ficar pronto de verdade..." -ForegroundColor DarkGray
    $pronto = $false
    # A preferencia cai durante TODO o laco: o proprio initdb escreve avisos na
    # saida de erro ("enabling trust authentication for local connections"), e
    # com 'Stop' o `docker logs` que so queria LER o log virava excecao.
    $antesEspera = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        foreach ($i in 1..120) {
            $saida = & docker logs $Cont 2>&1 | Out-String
            if ($saida -match 'init process complete') {
                & docker exec $Cont psql -U postgres -tAc 'SELECT 1' 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) { $pronto = $true; break }
            }
            Start-Sleep -Seconds 2
        }
    } finally { $ErrorActionPreference = $antesEspera }
    if (-not $pronto) {
        Write-Host "  O banco nao ficou pronto em 4 minutos." -ForegroundColor Red
        exit 1
    }

    # RESTAURAR COMO supabase_admin, E POR DENTRO.
    #
    # Duas decisões que custaram uma tentativa cada:
    #
    # 1. O dump é feito com --clean, então começa com 497 DROP. Os primeiros
    #    derrubam gatilhos de evento (pgrst_drop_watch, issue_pg_cron_access) e
    #    políticas de storage que pertencem ao supabase_admin. Restaurando como
    #    postgres, o psql para na linha 22 com "must be owner of event trigger"
    #    — antes de criar uma única tabela.
    #
    # 2. O arquivo entra por docker cp e o psql roda DENTRO do contêiner, pelo
    #    socket local. Assim não é preciso publicar porta nem ter senha do
    #    supabase_admin: a autenticação local do contêiner resolve.
    Write-Host "  Restaurando como supabase_admin (ON_ERROR_STOP=1)..." -ForegroundColor DarkGray
    Invoke-DockerSilencioso @('cp', $Alvo.FullName, "${Cont}:/tmp/conferencia.sql")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Nao consegui copiar o dump para dentro do conteiner." -ForegroundColor Red
        exit 1
    }

    $log = Join-Path $env:TEMP 'botezini_conferencia.log'
    $antes = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        # O ToString() tira a decoração de ErrorRecord do PowerShell, que
        # empilhava "+ ~~~~~~~~" e "CategoryInfo" por cima da mensagem do psql e
        # escondia justamente a linha que interessa.
        & docker exec $Cont psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 `
            -f /tmp/conferencia.sql 2>&1 |
            ForEach-Object { $_.ToString() } | Out-File -FilePath $log -Encoding utf8
        $codigo = $LASTEXITCODE
    } finally { $ErrorActionPreference = $antes }

    if ($codigo -ne 0) {
        Write-Host ""
        Write-Host "  A RESTAURACAO PAROU." -ForegroundColor Red
        Write-Host "  --------------------------"
        Write-Host "  O psql parou no primeiro erro (ON_ERROR_STOP=1)."
        Write-Host ""
        Write-Host "  Antes de culpar o backup, olhe DE QUE erro se trata:" -ForegroundColor Yellow
        Write-Host "    - 'extension X is not available', 'role X does not exist'"
        Write-Host "      ou 'must be owner of' sao falta no banco de TESTE."
        Write-Host "    - qualquer outro erro e do dump, e ai sim e problema."
        Write-Host ""
        Get-Content $log -Tail 12 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        Write-Host ""
        Write-Host "  Log inteiro: $log"
        Write-Host ""
        exit 1
    }

    # --- o que chegou do outro lado -------------------------------------------
    $sql = "SELECT (SELECT count(*) FROM pg_tables WHERE schemaname='public')::text" +
           " || '|' || (SELECT count(*) FROM pg_policies WHERE schemaname='public')::text" +
           " || '|' || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')::text" +
           " || '|' || (SELECT count(*) FROM auth.users)::text" +
           " || '|' || COALESCE((SELECT sum(n_live_tup) FROM pg_stat_user_tables),0)::text"
    Invoke-DockerSilencioso @('exec', $Cont, 'psql', '-U', 'postgres', '-q', '-c', 'ANALYZE')
    $antesLeitura = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $linha = & docker exec $Cont psql -U postgres -tAc $sql 2>$null
    } finally { $ErrorActionPreference = $antesLeitura }
    $p = ($linha -join '').Trim().Split('|')

    Write-Host ""
    if ([int]$p[0] -gt 0 -and [long]$p[4] -gt 0) {
        Write-Host "  O BACKUP RESTAURA" -ForegroundColor Green
    } else {
        Write-Host "  RESTAUROU VAZIO - confira antes de confiar nele" -ForegroundColor Yellow
    }
    Write-Host "  ---------------------"
    Write-Host "  Tabelas em public : $($p[0])"
    Write-Host "  Politicas de RLS  : $($p[1])"
    Write-Host "  Funcoes           : $($p[2])"
    Write-Host "  Contas de login   : $($p[3])"
    Write-Host "  Linhas            : $($p[4])   (estimativa do ANALYZE)"
    Write-Host ""
    if ([int]$p[1] -eq 0) {
        Write-Host "  ATENCAO: ZERO politicas. O dump nao trouxe a RLS junto, e um" -ForegroundColor Yellow
        Write-Host "  backup assim restaura os dados sem as travas que protegem eles." -ForegroundColor Yellow
        Write-Host ""
    }
    if ([int]$p[3] -eq 0) {
        Write-Host "  ATENCAO: ZERO contas de login. Restaurar este backup deixaria" -ForegroundColor Yellow
        Write-Host "  o sistema sem ninguem para entrar nele." -ForegroundColor Yellow
        Write-Host ""
    }

} finally {
    Invoke-DockerSilencioso @('rm', '-f', $Cont)
}
