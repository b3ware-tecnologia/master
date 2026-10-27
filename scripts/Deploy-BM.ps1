param([ValidateSet('web','worker')][string]$Service='web',[string]$Message='BM Crédito release')
$ErrorActionPreference='Stop'
$bmRoot=Split-Path -Parent $PSScriptRoot
$bmTarget=Get-Content -LiteralPath (Join-Path $bmRoot 'ops/railway-target.json') -Raw | ConvertFrom-Json
$env:RAILWAY_CALLER='skill:use-railway@1.7.0'
$env:RAILWAY_AGENT_SESSION='bm-guarded-deployment'
$bmAccount=railway whoami --json | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $bmAccount.email -ne $bmTarget.ownerEmail -or $bmTarget.workspaceId -notin $bmAccount.workspaces.id){throw 'Conta Railway incorreta para BM Crédito. Nenhuma publicação foi iniciada.'}
$bmProject=railway status -p $bmTarget.projectId -e $bmTarget.environmentId --json | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $bmProject.id -ne $bmTarget.projectId){throw 'Projeto Railway incorreto. Nenhuma publicação foi iniciada.'}
Push-Location -LiteralPath $bmRoot
try{railway up -p $bmTarget.projectId -e $bmTarget.environmentId -s $bmTarget.services.$Service --detach -m $Message;if($LASTEXITCODE -ne 0){throw 'Falha ao publicar.'}}finally{Pop-Location}
