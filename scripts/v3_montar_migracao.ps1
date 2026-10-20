# =============================================================================
# MONTAR A MIGRACAO DA V3 PARA UM BANCO NOVO (nuvem)
#
#     powershell -ExecutionPolicy Bypass -File .\scripts\v3_montar_migracao.ps1 -Dump C:\caminho\do\backup.sql
#
# Sem -Dump, usa o backup mais recente de ..\botezinipvd-1\backups.
#
# NAO TOCA NA PRODUCAO NEM EM BANCO NENHUM
#   So le um ARQUIVO de backup e escreve num conteiner descartavel desta maquina,
#   que some no fim. A saida e UM arquivo: migracao\botezini_v3_migracao.sql.
#
# O QUE ACONTECE
#   1. o backup entra inteiro num Postgres do Supabase descartavel;
#   2. nele rodam, na ordem, os 5 SQLs da v3 e a limpeza_de_dados_v3.sql;
#   3. de la sai tudo que e da Botezini (esquema public com os dados, as contas
#      de login, o bucket de anexos e as regras) SEM dono (OWNER TO): quem
#      aplicar vira o dono, como deve ser num projeto novo do Supabase.
#
# O arquivo tem dados reais (clientes, contas, hashes de senha): a pasta
# migracao\ esta no .gitignore. Nao suba, nao envie, nao cole em chat.
# Para aplicar no banco novo: scripts\v3_aplicar_migracao.ps1.
# =============================================================================

# -JaTratado: o backup e do proprio banco da v3 na nuvem (scripts\v3_backup_nuvem.ps1), que ja
# passou pelos SQLs e pela limpeza. Rodar a limpeza de novo apagaria insumos e juntaria clientes
# criados depois dela: com -JaTratado, nenhum SQL de tratamento roda, so a montagem.
param([string]$Dump, [switch]$JaTratado)

$ErrorActionPreference = 'Stop'

$Raiz     = Split-Path -Parent $PSScriptRoot
$Transito = 'v3-migracao'
$Imagem   = 'supabase/postgres:17.6.1.167'
$Saida    = Join-Path $Raiz 'migracao\botezini_v3_migracao.sql'
$Sqls     = @('financeiro_v3_1_entrega', 'financeiro_v3_2_conferencia_e_entrega', 'cadastros_v3_1',
              'compras_por_pedido', 'entrada_vale_antes_da_entrega', 'limpeza_de_dados_v3',
              'seguranca_view_atrasos')

function Invoke-Nativo {
    param([string]$Exe, [string[]]$Argumentos, [switch]$Mostrar)
    $antes = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Mostrar) { & $Exe @Argumentos 2>&1 | ForEach-Object { "    $_" } }
        else { & $Exe @Argumentos 2>&1 | Out-Null }
    } finally { $ErrorActionPreference = $antes }
}
function Falhar([string]$Msg) {
    Write-Host ""; Write-Host "  $Msg" -ForegroundColor Red
    Invoke-Nativo docker @('rm', '-f', $Transito)
    exit 1
}

Write-Host ""
Write-Host "  MONTAR A MIGRACAO DA V3" -ForegroundColor Cyan
Write-Host "  -----------------------"

Invoke-Nativo docker @('info')
if ($LASTEXITCODE -ne 0) { Falhar "Docker nao esta respondendo. Abra o Docker Desktop." }

if (-not $Dump) {
    $pasta = Join-Path (Split-Path -Parent $Raiz) 'botezinipvd-1\backups'
    $ultimo = Get-ChildItem $pasta -Filter 'botezini_*.sql' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $ultimo) { Falhar "Nenhum backup em $pasta. Passe -Dump C:\caminho\do\arquivo.sql" }
    $Dump = $ultimo.FullName
}
if (-not (Test-Path $Dump)) { Falhar "Backup nao encontrado: $Dump" }
Write-Host "  Backup: $Dump" -ForegroundColor DarkGray

Invoke-Nativo docker @('rm', '-f', $Transito)
Write-Host "  Restaurando o backup num banco descartavel..." -ForegroundColor DarkGray
Invoke-Nativo docker @('run', '-d', '--name', $Transito, '-e', 'POSTGRES_PASSWORD=descartavel', $Imagem)
if ($LASTEXITCODE -ne 0) { Falhar "Nao consegui subir o conteiner descartavel." }

$pronto = $false
$antes = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    foreach ($i in 1..120) {
        $log = & docker logs $Transito 2>&1 | Out-String
        if ($log -match 'init process complete') {
            & docker exec $Transito psql -U postgres -tAc 'SELECT 1' 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { $pronto = $true; break }
        }
        Start-Sleep -Seconds 2
    }
} finally { $ErrorActionPreference = $antes }
if (-not $pronto) { Falhar "O banco descartavel nao ficou pronto em 4 minutos." }

# Backup da v3 guarda permissoes de papeis internos do Supabase que o descartavel nao tem.
$antes = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
foreach ($papel in @('supabase_realtime_admin')) {
    & docker exec $Transito psql -U supabase_admin -d postgres -qc "DO `$`$ BEGIN CREATE ROLE $papel NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END `$`$;" 2>&1 | Out-Null
}
$ErrorActionPreference = $antes
Invoke-Nativo docker @('cp', $Dump, "${Transito}:/tmp/dump.sql")
Invoke-Nativo docker @('exec', $Transito, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/dump.sql')
if ($LASTEXITCODE -ne 0) { Falhar "O backup nao restaurou no banco descartavel." }


if ($JaTratado) { $Sqls = @(); Write-Host "  Backup ja tratado (v3): nenhum SQL de tratamento roda." -ForegroundColor DarkGray }
foreach ($nome in $Sqls) {
    Write-Host "  Rodando $nome.sql..." -ForegroundColor DarkGray
    Invoke-Nativo docker @('cp', (Join-Path $Raiz "supabase\$nome.sql"), "${Transito}:/tmp/x.sql")
    # A limpeza ja tem BEGIN/COMMIT proprio; os demais rodam numa transacao so (-1).
    $um = if ($nome -eq 'limpeza_de_dados_v3') { @() } else { @('-1') }
    Invoke-Nativo docker (@('exec', $Transito, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1') + $um + @('-f', '/tmp/x.sql'))
    if ($LASTEXITCODE -ne 0) { Falhar "$nome.sql falhou (nada foi gravado em lugar nenhum)." }
}

Write-Host "  Montando a migracao..." -ForegroundColor DarkGray
Invoke-Nativo docker @('cp', (Join-Path $PSScriptRoot 'v3\montar_carga.sh'), "${Transito}:/tmp/montar_carga.sh")
Invoke-Nativo docker @('exec', $Transito, 'sed', '-i', 's/\r$//', '/tmp/montar_carga.sh')
Invoke-Nativo docker @('exec', '-e', 'SEM_DONO=1', $Transito, 'sh', '/tmp/montar_carga.sh') -Mostrar
if ($LASTEXITCODE -ne 0) { Falhar "Nao consegui montar a migracao." }

New-Item -ItemType Directory -Force (Split-Path -Parent $Saida) | Out-Null
Invoke-Nativo docker @('cp', "${Transito}:/tmp/v3/carga.sql", $Saida)

# O backup guarda as permissoes que existem, nao as que foram TIRADAS: ao recriar o objeto, o
# Supabase devolve o padrao (anon com tudo). Os ajustes de permissao rodam de novo no fim da
# carga, dentro da mesma transacao (antes do COMMIT final). Achado em 19/10: a view de atrasos
# voltava a ser lida pelo anonimo.
$DepoisDaCarga = @('seguranca_view_atrasos')
$carga = [IO.File]::ReadAllText($Saida)
$fim = $carga.LastIndexOf('COMMIT;')
if ($fim -lt 0) { Falhar "A carga nao termina em COMMIT; - nao sei onde acrescentar os ajustes." }
$extra = ($DepoisDaCarga | ForEach-Object { "-- ===== $_.sql (reaplicado no fim da carga) =====`n" + [IO.File]::ReadAllText((Join-Path $Raiz "supabase\$_.sql")) }) -join "`n"
[IO.File]::WriteAllText($Saida, $carga.Substring(0, $fim) + $extra + "`n" + $carga.Substring($fim), (New-Object Text.UTF8Encoding $false))
$contagem = "SELECT 'pedidos ' || (SELECT count(*) FROM public.orders) || ' | orcamentos ' || (SELECT count(*) FROM public.budgets) || ' | clientes ' || (SELECT count(*) FROM public.clients) || ' | insumos ' || (SELECT count(*) FROM public.insumos) || ' | contas financeiras ' || (SELECT count(*) FROM public.financial_obligations) || ' | logins ' || (SELECT count(*) FROM auth.users);" |
    & docker exec -i $Transito psql -U postgres -tA 2>$null
Invoke-Nativo docker @('rm', '-f', $Transito)

if (-not (Test-Path $Saida)) { Falhar "O arquivo da migracao nao foi criado." }
$tam = [math]::Round((Get-Item $Saida).Length / 1MB, 2)
Write-Host ""
Write-Host "  MIGRACAO PRONTA" -ForegroundColor Green
Write-Host "  $Saida ($tam MB)"
Write-Host "  $contagem"
Write-Host "  Proximo passo: scripts\v3_aplicar_migracao.ps1 (com a conexao do banco NOVO)."
Write-Host ""
