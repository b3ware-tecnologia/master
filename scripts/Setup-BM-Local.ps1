$ErrorActionPreference='Stop'
$bmRoot=Split-Path -Parent $PSScriptRoot
$bmRuntime=Join-Path $bmRoot '.private/local-runtime'
New-Item -ItemType Directory -Force -Path $bmRuntime|Out-Null
if(!(Test-Path -LiteralPath (Join-Path $bmRoot 'node_modules/prisma/build/index.js'))){Push-Location -LiteralPath $bmRoot;try{npx.cmd --yes pnpm@11.19.0 install --frozen-lockfile;if($LASTEXITCODE -ne 0){throw 'Não foi possível preparar o sistema.'}}finally{Pop-Location}}
function Get-BMArchive([string]$Url,[string]$File,[string]$Hash,[string]$Destination){
 if(!(Test-Path -LiteralPath $File)){Invoke-WebRequest -Uri $Url -OutFile $File}
 if((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLower() -ne $Hash){throw "O arquivo $File não corresponde à versão esperada."}
 if(!(Test-Path -LiteralPath $Destination)){Expand-Archive -LiteralPath $File -DestinationPath $Destination}
}
Get-BMArchive 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616' (Join-Path $bmRuntime 'postgres.zip') '80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f' (Join-Path $bmRuntime 'postgres')
Get-BMArchive 'https://github.com/redis-windows/redis-windows/releases/download/8.10.3/Redis-8.10.3-Windows-x64-msys2.zip' (Join-Path $bmRuntime 'redis.zip') 'af16df340525b431e9ec8dabfd625d5e7a233f82805b5418819904ea909c447f' (Join-Path $bmRuntime 'redis')
$bmEvolution=Join-Path $bmRuntime 'evolution'
if(!(Test-Path -LiteralPath (Join-Path $bmEvolution '.git'))){git clone --depth 1 --branch 2.3.7 https://github.com/evolution-foundation/evolution-api.git $bmEvolution;if($LASTEXITCODE -ne 0){throw 'Não foi possível obter o conector WhatsApp.'}}
$bmRevision=git -C $bmEvolution rev-parse HEAD
if($bmRevision -ne 'cd800f2976e1e5b682fbf86a01ee4d85ae61f370'){throw 'A versão local da Evolution não corresponde à versão revisada.'}
if(!(Test-Path -LiteralPath (Join-Path $bmEvolution 'node_modules/.bin/prisma.cmd'))){
 Push-Location -LiteralPath $bmEvolution
 try{$env:HUSKY='0';$env:GIT_CONFIG_COUNT='1';$env:GIT_CONFIG_KEY_0='url.https://github.com/.insteadOf';$env:GIT_CONFIG_VALUE_0='ssh://git@github.com/';npm.cmd ci --no-audit --no-fund;if($LASTEXITCODE -ne 0){throw 'Não foi possível instalar o conector WhatsApp.'}}finally{$env:GIT_CONFIG_COUNT=$null;$env:GIT_CONFIG_KEY_0=$null;$env:GIT_CONFIG_VALUE_0=$null;Pop-Location}
}
Write-Output 'Componentes locais preparados. Execute scripts/Start-BM-Local.ps1.'
