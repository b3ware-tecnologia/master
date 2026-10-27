$ErrorActionPreference='Stop'
$bmRoot=Split-Path -Parent $PSScriptRoot
$bmRuntime=Join-Path $bmRoot '.private/local-runtime'
foreach($bmPort in @(3020,18080)){
 $bmListener=Get-NetTCPConnection -State Listen -LocalPort $bmPort -ErrorAction SilentlyContinue|Select-Object -First 1
 if($bmListener){$bmProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($bmListener.OwningProcess)";if(!$bmProcess.CommandLine.Contains($bmRoot)){throw "A porta $bmPort pertence a outro programa; ele não será encerrado."};Stop-Process -Id $bmListener.OwningProcess}
}
$bmPidFile=Join-Path $bmRuntime 'worker-pid.json'
if(Test-Path -LiteralPath $bmPidFile){$bmWorkerId=(Get-Content -LiteralPath $bmPidFile -Raw|ConvertFrom-Json).id;$bmProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$bmWorkerId";if($bmProcess -and $bmProcess.CommandLine.Contains((Join-Path $bmRoot 'src/workers/run.ts'))){Stop-Process -Id $bmWorkerId}}
$bmRedis=Get-NetTCPConnection -State Listen -LocalPort 57479 -ErrorAction SilentlyContinue|Select-Object -First 1
if($bmRedis){$bmProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($bmRedis.OwningProcess)";if(!$bmProcess.ExecutablePath.StartsWith($bmRuntime,[StringComparison]::OrdinalIgnoreCase)){throw 'O Redis dessa porta pertence a outro programa.'};$bmConfig=Get-Content -LiteralPath (Join-Path $bmRuntime 'config.json') -Raw|ConvertFrom-Json;$env:REDISCLI_AUTH=$bmConfig.redisPassword;try{& (Join-Path $bmRuntime 'redis/Redis-8.10.3-Windows-x64-msys2/redis-cli.exe') -h 127.0.0.1 -p 57479 shutdown save}finally{$env:REDISCLI_AUTH=$null}}
$bmPg=Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue|Select-Object -First 1
if($bmPg){$bmProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($bmPg.OwningProcess)";if(!$bmProcess.ExecutablePath.StartsWith($bmRuntime,[StringComparison]::OrdinalIgnoreCase)){throw 'O banco dessa porta pertence a outro programa.'};$bmStop=Start-Process -FilePath (Join-Path $bmRuntime 'postgres/pgsql/bin/pg_ctl.exe') -ArgumentList @('stop','-D',(Join-Path $bmRuntime 'data/postgres'),'-m','fast') -WindowStyle Hidden -PassThru;$bmStop.WaitForExit();if($bmStop.ExitCode -ne 0){throw 'Não foi possível encerrar o banco local.'}}
Write-Output 'BM Crédito local encerrado. Os dados e as conexões foram preservados.'
