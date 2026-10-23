# =============================================================================
# COPIAR OS ANEXOS (fotos de referência e comprovantes) DO PROJETO ANTIGO PARA O NOVO
#
#     powershell -ExecutionPolicy Bypass -File .\scripts\v3_copiar_anexos.ps1           # so mostra o que faria
#     powershell -ExecutionPolicy Bypass -File .\scripts\v3_copiar_anexos.ps1 -Copiar   # copia
#
# POR QUE: a migracao leva o REGISTRO de cada anexo (o caminho em reference_photos e
# attachments), nao o ARQUIVO, que mora no Storage do projeto antigo. No projeto novo o
# PDF do orcamento dizia "nao foi possivel carregar as fotos" (ORC-BZ-2026-064, 22/10).
#
# O QUE FAZ: pega no banco NOVO a lista de caminhos citados (orcamentos, pedidos, clientes,
# contas, pagamentos), e para cada um: se ja existe no novo, pula; senao LE no antigo e
# GRAVA no novo, no mesmo caminho do bucket financial-attachments. Nunca grava no antigo.
#
# PRECISA (variaveis do seu perfil; nada e impresso):
#   BOTEZINI_DB_URI            conexao da producao antiga (ja existe) -> so o project-ref
#   BOTEZINI_NOVO_DB_URI       conexao do banco novo (ja existe)      -> lista de caminhos e project-ref
#   BOTEZINI_PROD_SERVICE_KEY  chave de servico (secret / service_role) do projeto ANTIGO
#   BOTEZINI_NOVO_SERVICE_KEY  chave de servico (secret / service_role) do projeto NOVO
# =============================================================================
param([switch]$Copiar)

$ErrorActionPreference = 'Stop'
$Bucket = 'financial-attachments'
$Imagem = 'supabase/postgres:17.6.1.167'
function Falhar([string]$Msg) { Write-Host ""; Write-Host "  $Msg" -ForegroundColor Red; exit 1 }
function DoPerfil([string]$n) { $v = [Environment]::GetEnvironmentVariable($n, 'User'); if (-not $v) { $v = [Environment]::GetEnvironmentVariable($n, 'Process') }; return $v }
function RefDa([string]$uri) { if ($uri -match '^postgres(?:ql)?://postgres\.([a-z0-9]+):') { return $Matches[1] }; return $null }

Write-Host ""
Write-Host "  COPIAR ANEXOS: projeto antigo -> projeto novo" -ForegroundColor Cyan
Write-Host "  ---------------------------------------------"

$uriProd = DoPerfil 'BOTEZINI_DB_URI'
$uriNovo = DoPerfil 'BOTEZINI_NOVO_DB_URI'
$chaveProd = DoPerfil 'BOTEZINI_PROD_SERVICE_KEY'
$chaveNovo = DoPerfil 'BOTEZINI_NOVO_SERVICE_KEY'
if (-not $uriProd -or -not $uriNovo) { Falhar 'Faltam BOTEZINI_DB_URI ou BOTEZINI_NOVO_DB_URI no seu perfil.' }
$refProd = RefDa $uriProd; $refNovo = RefDa $uriNovo
if (-not $refProd -or -not $refNovo) { Falhar 'Nao consegui ler o project-ref de uma das conexoes (use a do Session pooler).' }
if ($refProd -eq $refNovo) { Falhar 'As duas conexoes apontam para o MESMO projeto. Recusando.' }
if (-not $chaveProd -or -not $chaveNovo) {
    Write-Host "  Faltam as chaves de servico. Guarde as duas no seu PowerShell (pede escondido):" -ForegroundColor Yellow
    Write-Host "    Supabase > projeto > Project Settings > API Keys > secret (ou service_role)" -ForegroundColor DarkGray
    foreach ($n in 'BOTEZINI_PROD_SERVICE_KEY', 'BOTEZINI_NOVO_SERVICE_KEY') {
        Write-Host "    `$k = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host '$n' -AsSecureString))); [Environment]::SetEnvironmentVariable('$n', `$k, 'User'); Remove-Variable k"
    }
    exit 1
}
if ($chaveProd -eq $chaveNovo) { Falhar 'As duas chaves sao iguais. Recusando.' }

# A chave anon/publishable e ACEITA pelo Supabase, mas o bucket e privado: com ela todo arquivo
# "nao existe" (RLS) e o script contaria 62 de 62 como faltando. Recusa antes de comecar.
function PapelDaChave([string]$k) {
    if ($k.StartsWith('sb_secret_')) { return 'service_role' }
    if ($k.StartsWith('sb_publishable_')) { return 'anon' }
    if ($k -match '^eyJ[\w-]+\.([\w-]+)\.') {
        $p = $Matches[1]; $p += '=' * ((4 - $p.Length % 4) % 4)
        try { return ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p.Replace('-', '+').Replace('_', '/'))) | ConvertFrom-Json).role } catch { }
    }
    return 'desconhecido'
}
foreach ($par in @(@('BOTEZINI_PROD_SERVICE_KEY', $chaveProd), @('BOTEZINI_NOVO_SERVICE_KEY', $chaveNovo))) {
    $papel = PapelDaChave $par[1]
    if ($papel -ne 'service_role') { Falhar "$($par[0]) e uma chave '$papel', nao a de servico. Pegue a 'secret' (sb_secret_...) ou 'service_role' em Project Settings > API Keys." }
}
Write-Host "  antigo: $($refProd.Substring(0,6))...   novo: $($refNovo.Substring(0,6))..." -ForegroundColor DarkGray

# Chave nova (sb_secret_...) vai so no apikey; a antiga (JWT service_role) vai nos dois cabecalhos.
function Cabecalhos([string]$k) { if ($k.StartsWith('sb_')) { return @{ apikey = $k } } else { return @{ apikey = $k; Authorization = "Bearer $k" } } }
function UrlDo([string]$ref, [string]$caminho) {
    $partes = $caminho.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }
    return "https://$ref.supabase.co/storage/v1/object/$Bucket/$($partes -join '/')"
}

# --- 1. caminhos citados no banco novo (so leitura) ---
$sql = @"
SELECT DISTINCT c FROM (
  SELECT jsonb_array_elements_text(reference_photos) AS c FROM public.budgets WHERE jsonb_typeof(reference_photos) = 'array'
  UNION ALL SELECT jsonb_array_elements_text(reference_photos) FROM public.orders WHERE jsonb_typeof(reference_photos) = 'array'
  UNION ALL SELECT jsonb_array_elements_text(reference_photos) FROM public.clients WHERE jsonb_typeof(reference_photos) = 'array'
  UNION ALL SELECT jsonb_array_elements_text(attachments) FROM public.financial_obligations WHERE jsonb_typeof(attachments) = 'array'
  UNION ALL SELECT jsonb_array_elements_text(attachments) FROM public.obligation_payments WHERE jsonb_typeof(attachments) = 'array'
) t WHERE c <> '' ORDER BY 1;
"@
$env:BOTEZINI_NOVO_DB_URI = $uriNovo
$antes = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
$cmd = 'psql \"$BOTEZINI_NOVO_DB_URI\" -tA -v ON_ERROR_STOP=1 -f -'
$caminhos = @($sql | & docker run -i --rm -e BOTEZINI_NOVO_DB_URI -e PGOPTIONS='-c default_transaction_read_only=on' $Imagem sh -c $cmd 2>&1 | ForEach-Object { "$_".Trim() } | Where-Object { $_ -and $_ -notmatch '^(psql|ERROR|FATAL)' })
$ErrorActionPreference = $antes
if ($caminhos.Count -eq 0) { Falhar 'Nenhum caminho de anexo citado no banco novo (ou a leitura falhou).' }
Write-Host "  Anexos citados no banco novo: $($caminhos.Count)"

# --- 2. um a um ---
$tmp = Join-Path $env:TEMP 'botezini_anexo.tmp'
$ja = 0; $copiados = 0; $faltaNoAntigo = 0; $copiaveis = 0; $erros = @()
foreach ($c in $caminhos) {
    try {
        Invoke-WebRequest -Method Head -Uri (UrlDo $refNovo $c) -Headers (Cabecalhos $chaveNovo) -UseBasicParsing | Out-Null
        $ja++; continue
    } catch { }
    try {
        $r = Invoke-WebRequest -Uri (UrlDo $refProd $c) -Headers (Cabecalhos $chaveProd) -UseBasicParsing -OutFile $tmp -PassThru
    } catch {
        # O Storage responde 400 tanto para "objeto nao existe" quanto para chave recusada
        # (InvalidJWT, invalid signature). So conta como faltando quando o corpo diz not_found;
        # o resto e erro, com a mensagem do servidor (que nao carrega a chave).
        $codigo = $_.Exception.Response.StatusCode.value__
        $corpo = "$($_.ErrorDetails.Message)"
        if ($codigo -eq 404 -or $corpo -match 'not_found|Object not found') { $faltaNoAntigo++ }
        else { $erros += "$c (ler no antigo: $codigo $corpo)" }
        continue
    }
    $copiaveis++
    if (-not $Copiar) { continue }
    try {
        $h = Cabecalhos $chaveNovo; $h['x-upsert'] = 'false'
        $tipo = if ($r.Headers['Content-Type']) { $r.Headers['Content-Type'] } else { 'application/octet-stream' }
        Invoke-WebRequest -Method Post -Uri (UrlDo $refNovo $c) -Headers $h -ContentType $tipo -InFile $tmp -UseBasicParsing | Out-Null
        $copiados++
    } catch {
        $erros += "$c (gravar no novo: $($_.Exception.Response.StatusCode.value__))"
    }
}
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  Ja estavam no novo      : $ja"
Write-Host "  Existem no antigo       : $copiaveis $(if ($Copiar) { "(copiados: $copiados)" } else { '(nada copiado: rode com -Copiar)' })"
Write-Host "  Nao existem nem no antigo: $faltaNoAntigo (registro sem arquivo; o PDF sai sem eles e avisa)"
if ($erros.Count) { Write-Host "  Erros: $($erros.Count)" -ForegroundColor Red; $erros | Select-Object -First 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor Red } }
if ($erros.Count -eq $caminhos.Count) { Write-Host "  TODOS falharam igual: e a chave do projeto ANTIGO (ou o project-ref), nao os arquivos." -ForegroundColor Yellow }
Write-Host ""
