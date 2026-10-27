param([switch]$SkipBootstrap)
$ErrorActionPreference='Stop'
$bmRoot=Split-Path -Parent $PSScriptRoot
$bmRuntime=Join-Path $bmRoot '.private/local-runtime'
$bmConfigPath=Join-Path $bmRuntime 'config.json'
if(!(Test-Path -LiteralPath $bmConfigPath)){
  function New-BMSecret { $bmBytes=New-Object byte[] 32;$bmGenerator=[Security.Cryptography.RandomNumberGenerator]::Create();try{$bmGenerator.GetBytes($bmBytes);return -join ($bmBytes|ForEach-Object {$_.ToString('x2')})}finally{$bmGenerator.Dispose()} }
  $bmConfig=@{databasePassword=New-BMSecret;redisPassword=New-BMSecret;evolutionKey=New-BMSecret;authSecret=New-BMSecret;webhookSecret=New-BMSecret;webChatSecret=New-BMSecret;encryptionKey=New-BMSecret}
  New-Item -ItemType Directory -Force -Path $bmRuntime|Out-Null
  [IO.File]::WriteAllText($bmConfigPath,($bmConfig|ConvertTo-Json))
}
$bmConfig=Get-Content -LiteralPath $bmConfigPath -Raw|ConvertFrom-Json
$bmPgBin=Join-Path $bmRuntime 'postgres/pgsql/bin'
$bmRedisBin=Join-Path $bmRuntime 'redis/Redis-8.10.3-Windows-x64-msys2'
$bmEvolution=Join-Path $bmRuntime 'evolution'
foreach($bmRequired in @((Join-Path $bmPgBin 'initdb.exe'),(Join-Path $bmRedisBin 'redis-server.exe'),(Join-Path $bmEvolution 'node_modules/.bin/prisma.cmd'))){if(!(Test-Path -LiteralPath $bmRequired)){throw 'Execute primeiro scripts/Setup-BM-Local.ps1 para preparar os componentes locais.'}}
$bmData=Join-Path $bmRuntime 'data';New-Item -ItemType Directory -Force -Path $bmData|Out-Null
$bmPgData=Join-Path $bmData 'postgres';$bmRedisData=Join-Path $bmData 'redis';New-Item -ItemType Directory -Force -Path $bmRedisData|Out-Null
function Wait-BMPort([int]$Port,[int]$Seconds=40){$bmDeadline=[DateTime]::UtcNow.AddSeconds($Seconds);while([DateTime]::UtcNow -lt $bmDeadline){$bmSocket=[Net.Sockets.TcpClient]::new();try{$bmSocket.Connect('127.0.0.1',$Port);return} catch{Start-Sleep -Milliseconds 300}finally{$bmSocket.Dispose()}};throw "O serviço local na porta $Port não iniciou. Consulte .private/local-runtime/*.log."}
function Find-BMPort([int]$Port){$bmFound=Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue|Select-Object -First 1;if($bmFound){$bmProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($bmFound.OwningProcess)";if(!$bmProcess.ExecutablePath.StartsWith($bmRoot,[StringComparison]::OrdinalIgnoreCase) -and !$bmProcess.CommandLine.Contains($bmRoot)){throw "A porta $Port está ocupada por outro programa. Ele não será alterado."};return $bmFound.OwningProcess};return $null}
function Start-BMNode([string]$Name,[string[]]$Arguments,[string]$Directory){$bmProcess=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $bmRuntime "$Name.log") -RedirectStandardError (Join-Path $bmRuntime "$Name-error.log") -PassThru;return $bmProcess.Id}
$env:PGPASSWORD=$bmConfig.databasePassword
if(!(Test-Path -LiteralPath (Join-Path $bmPgData 'PG_VERSION'))){$bmPasswordFile=Join-Path $bmRuntime 'postgres-init-secret';[IO.File]::WriteAllText($bmPasswordFile,$bmConfig.databasePassword);try{& (Join-Path $bmPgBin 'initdb.exe') -D $bmPgData -U bm_local -A scram-sha-256 --pwfile $bmPasswordFile --encoding UTF8 --locale C --no-instructions;if($LASTEXITCODE -ne 0){throw 'Não foi possível iniciar o banco local.'}}finally{Remove-Item -LiteralPath $bmPasswordFile}}
if(!(Find-BMPort 55432)){$bmPgStart=Start-Process -FilePath (Join-Path $bmPgBin 'pg_ctl.exe') -ArgumentList @('start','-D',$bmPgData,'-l',(Join-Path $bmRuntime 'postgres.log'),'-o','"-p 55432 -h 127.0.0.1"') -WindowStyle Hidden -PassThru;$bmPgStart.WaitForExit();if($bmPgStart.ExitCode -ne 0){throw 'Não foi possível abrir o banco local.'}}
Wait-BMPort 55432
foreach($bmDatabase in @('bm_credito','bm_evolution')){$bmExists=& (Join-Path $bmPgBin 'psql.exe') -h 127.0.0.1 -p 55432 -U bm_local -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$bmDatabase'";if($LASTEXITCODE -ne 0){throw 'Não foi possível consultar o banco local.'};if($bmExists -ne '1'){& (Join-Path $bmPgBin 'createdb.exe') -h 127.0.0.1 -p 55432 -U bm_local $bmDatabase;if($LASTEXITCODE -ne 0){throw 'Não foi possível criar o banco local.'}}}
$env:PGPASSWORD=$null
$bmRedisConfig=Join-Path $bmRedisBin 'bm-local.conf'
[IO.File]::WriteAllText($bmRedisConfig,"bind 127.0.0.1`nport 57479`nprotected-mode yes`nrequirepass $($bmConfig.redisPassword)`ndir $($bmRedisData.Replace('\','/'))`nsave 60 1`nappendonly yes`n")
if(!(Find-BMPort 57479)){Start-Process -FilePath (Join-Path $bmRedisBin 'redis-server.exe') -ArgumentList 'bm-local.conf' -WorkingDirectory $bmRedisBin -WindowStyle Hidden -RedirectStandardOutput (Join-Path $bmRuntime 'redis.log') -RedirectStandardError (Join-Path $bmRuntime 'redis-error.log')|Out-Null}
Wait-BMPort 57479 120
$env:NODE_ENV='development';$env:DATABASE_PROVIDER='postgresql';$env:DATABASE_CONNECTION_URI="postgresql://bm_local:$($bmConfig.databasePassword)@127.0.0.1:55432/bm_evolution?schema=public";$env:DATABASE_CONNECTION_CLIENT_NAME='bm_local'
$env:SERVER_TYPE='http';$env:SERVER_PORT='18080';$env:SERVER_URL='http://127.0.0.1:18080';$env:AUTHENTICATION_API_KEY=$bmConfig.evolutionKey;$env:AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES='false';$env:CACHE_REDIS_ENABLED='true';$env:CACHE_REDIS_URI="redis://:$($bmConfig.redisPassword)@127.0.0.1:57479/1";$env:CACHE_REDIS_PREFIX_KEY='bm_evolution';$env:CACHE_REDIS_SAVE_INSTANCES='true';$env:CACHE_LOCAL_ENABLED='false';$env:TELEMETRY_ENABLED='false';$env:LOG_LEVEL='ERROR,WARN';$env:LOG_BAILEYS='error';$env:LOG_COLOR='false';$env:CORS_ORIGIN='*';$env:OPENAI_ENABLED='false';$env:HUSKY='0'
if(!(Find-BMPort 18080)){
 Push-Location -LiteralPath $bmEvolution
 try{
  if(!(Test-Path -LiteralPath 'prisma/migrations')){Copy-Item -LiteralPath 'prisma/postgresql-migrations' -Destination 'prisma/migrations' -Recurse}
  & node.exe node_modules/prisma/build/index.js generate --schema prisma/postgresql-schema.prisma;if($LASTEXITCODE -ne 0){throw 'Falha ao preparar o conector WhatsApp.'}
  & node.exe node_modules/prisma/build/index.js migrate deploy --schema prisma/postgresql-schema.prisma;if($LASTEXITCODE -ne 0){throw 'Falha ao preparar o banco do WhatsApp.'}
  $bmMain=Join-Path $bmEvolution 'src/main.ts';$bmSource=[IO.File]::ReadAllText($bmMain);$bmSource=$bmSource.Replace('server.listen(httpServer.PORT, () =>',"server.listen(httpServer.PORT, '127.0.0.1', () =>");[IO.File]::WriteAllText($bmMain,$bmSource)
  if(!(Test-Path -LiteralPath 'dist/main.js')){& npm.cmd run build;if($LASTEXITCODE -ne 0){throw 'Falha ao preparar o serviço WhatsApp.'}}
 }finally{Pop-Location}
 $null=Start-BMNode 'evolution' @((Join-Path $bmEvolution 'dist/main.js')) $bmEvolution
}
Wait-BMPort 18080 120
$env:APP_URL='http://127.0.0.1:3020';$env:DATABASE_URL="postgresql://bm_local:$($bmConfig.databasePassword)@127.0.0.1:55432/bm_credito?schema=public";$env:REDIS_URL="redis://:$($bmConfig.redisPassword)@127.0.0.1:57479/0";$env:AUTH_SECRET=$bmConfig.authSecret;$env:WEB_CHAT_SECRET=$bmConfig.webChatSecret;$env:INTEGRATION_ENCRYPTION_KEY=$bmConfig.encryptionKey;$env:EVOLUTION_API_URL='http://127.0.0.1:18080';$env:EVOLUTION_API_KEY=$bmConfig.evolutionKey;$env:EVOLUTION_WEBHOOK_SECRET=$bmConfig.webhookSecret;$env:BM_SINGLE_COMPANY_MODE='true';$env:BM_COMPANY_SLUG='bm-credito';$env:BM_LOCAL_RUNTIME='true';$env:BM_LOCAL_NO_AUTH=if($bmConfig.noLogin -eq $false){'false'}else{'true'};$env:OPENAI_API_KEY='';$env:OPENAI_MODEL='gpt-6-luna';$env:AI_OUTREACH_ENABLED='true';$env:WHATSAPP_OUTBOUND_ENABLED='true';$env:TYPESAFE_API_KEY='';$env:JEV_ENABLED='false'
Push-Location -LiteralPath $bmRoot
try{& node.exe node_modules/prisma/build/index.js migrate deploy;if($LASTEXITCODE -ne 0){throw 'Falha ao preparar o sistema.'}; if(!$SkipBootstrap){& node.exe --import tsx scripts/bootstrap-local.ts;if($LASTEXITCODE -ne 0){throw 'Falha ao preparar seu acesso.'}}}finally{Pop-Location}
$bmProcesses=@{}
if(!(Find-BMPort 3020)){$bmProcesses.web=Start-BMNode 'web' @((Join-Path $bmRoot 'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3020') $bmRoot}
Wait-BMPort 3020 90
$bmWorkerFile=Join-Path $bmRuntime 'worker-pid.json';$bmWorkerRunning=$false
if(Test-Path -LiteralPath $bmWorkerFile){$bmWorkerPid=(Get-Content -LiteralPath $bmWorkerFile -Raw|ConvertFrom-Json).id;$bmExisting=Get-CimInstance Win32_Process -Filter "ProcessId=$bmWorkerPid";if($bmExisting -and $bmExisting.CommandLine.Contains((Join-Path $bmRoot 'src/workers/run.ts'))){$bmWorkerRunning=$true}}
if(!$bmWorkerRunning){$bmProcesses.worker=Start-BMNode 'worker' @('--import','tsx',(Join-Path $bmRoot 'src/workers/run.ts')) $bmRoot;[IO.File]::WriteAllText($bmWorkerFile,(@{id=$bmProcesses.worker}|ConvertTo-Json))}
Write-Output 'BM Crédito local: http://127.0.0.1:3020'
if($env:BM_LOCAL_NO_AUTH -eq 'true'){Write-Output 'Acesso direto local, sem login.'}elseif(Test-Path -LiteralPath (Join-Path $bmRuntime 'owner-activation.json')){Write-Output 'Ative seu acesso pelo convite em .private/local-runtime/owner-activation.json.'}else{Write-Output 'Entre com seu e-mail e senha.'}
