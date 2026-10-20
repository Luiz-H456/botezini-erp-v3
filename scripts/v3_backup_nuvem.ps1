# =============================================================================
# BACKUP DO BANCO DA V3 NA NUVEM (BOTEZINI_NOVO_DB_URI) - SOMENTE LEITURA
#
#     powershell -ExecutionPolicy Bypass -File .\scripts\v3_backup_nuvem.ps1
#
# Igual ao backup.ps1 da producao, com uma diferenca de proposito: GUARDA AS PERMISSOES
# (sem --no-privileges). A v3 ajusta permissoes (ex.: a view de atrasos sem acesso
# anonimo); um backup que as descarta volta, na restauracao, para as permissoes padrao.
#
# Le a conexao do seu perfil (BOTEZINI_NOVO_DB_URI) direto para dentro do conteiner: a
# URI nunca e impressa. Recusa a conexao da producao antiga (BOTEZINI_DB_URI).
# Saida: backups\botezini_v3_nuvem_AAAA-MM-DD_HHMM.sql (pasta no .gitignore: tem dado real).
# =============================================================================
$ErrorActionPreference = 'Stop'
$Raiz    = Split-Path -Parent $PSScriptRoot
$Imagem  = 'postgres:17'
$Destino = Join-Path $Raiz 'backups'
$Arquivo = "botezini_v3_nuvem_$(Get-Date -Format 'yyyy-MM-dd_HHmm').sql"
$Caminho = Join-Path $Destino $Arquivo

function Falhar([string]$Msg) { Write-Host ""; Write-Host "  $Msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  BACKUP DA V3 NA NUVEM" -ForegroundColor Cyan
Write-Host "  ---------------------"

if (-not $env:BOTEZINI_NOVO_DB_URI) { $env:BOTEZINI_NOVO_DB_URI = [Environment]::GetEnvironmentVariable('BOTEZINI_NOVO_DB_URI', 'User') }
if (-not $env:BOTEZINI_NOVO_DB_URI) { Falhar 'BOTEZINI_NOVO_DB_URI nao definida.' }
$prod = [Environment]::GetEnvironmentVariable('BOTEZINI_DB_URI', 'User')
if ($prod -and $env:BOTEZINI_NOVO_DB_URI -eq $prod) { Falhar 'Esta e a conexao da producao antiga. Recusando.' }
if (-not (Test-Path $Destino)) { New-Item -ItemType Directory $Destino | Out-Null }

# No PowerShell 5.1, stderr de executavel nativo com 'Stop' vira excecao: o aviso nunca sairia.
$ErrorActionPreference = 'Continue'
& docker info 2>&1 | Out-Null
$dockerOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = 'Stop'
if (-not $dockerOk) { Falhar 'Docker nao esta respondendo. Abra o Docker Desktop.' }

Write-Host "  Baixando (so leitura)..." -ForegroundColor DarkGray
$antes = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    # \" : o PowerShell 5.1 nao escapa aspas dentro de argumento de executavel nativo.
    $cmd = 'pg_dump \"$BOTEZINI_NOVO_DB_URI\" --no-owner --clean --if-exists -f /backup/' + $Arquivo
    & docker run --rm -e BOTEZINI_NOVO_DB_URI -e PGOPTIONS='-c default_transaction_read_only=on' -v "${Destino}:/backup" $Imagem sh -c $cmd 2>&1 |
        ForEach-Object { "    $_" }
    $codigo = $LASTEXITCODE
} finally { $ErrorActionPreference = $antes }
if ($codigo -ne 0) { Falhar "O pg_dump falhou (codigo $codigo). A mensagem esta logo acima." }
if (-not (Test-Path $Caminho)) { Falhar 'O pg_dump disse que deu certo, mas nao ha arquivo.' }

$Texto   = Get-Content -Raw -Encoding UTF8 $Caminho
$Tabelas = ([regex]::Matches($Texto, '(?m)^CREATE TABLE ')).Count
$Grants  = ([regex]::Matches($Texto, '(?m)^(GRANT|REVOKE) ')).Count
$Fechou  = $Texto -match 'PostgreSQL database dump complete'
Write-Host ""
if (-not ($Fechou -and $Tabelas -gt 0)) { Falhar "Backup incompleto: $Arquivo (tabelas $Tabelas, fechado $Fechou)." }
Write-Host "  BACKUP OK" -ForegroundColor Green
Write-Host "  Arquivo : backups\$Arquivo"
Write-Host "  Tamanho : $([math]::Round((Get-Item $Caminho).Length / 1MB, 2)) MB"
Write-Host "  Tabelas : $Tabelas | GRANT/REVOKE: $Grants | Fechado: sim"
Write-Host ""
