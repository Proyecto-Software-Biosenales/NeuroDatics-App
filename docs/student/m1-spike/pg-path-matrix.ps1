param([string]$Bin, [string]$Data, [string]$Label, [int]$Port = 54330)
# One embedded-PG lifecycle attempt: initdb, start, query, stop. Prints one summary line.
# pg_ctl start/stop run through cmd with file redirection: the postmaster inherits the
# caller's stdout handle, so a pipe here never reaches EOF and the caller hangs.
$ErrorActionPreference = 'Continue'
$tmp = [IO.Path]::GetTempPath()
$pw = Join-Path $tmp 'nd-pgpass.txt'
Set-Content -Path $pw -Value 'spike-local-secret' -NoNewline -Encoding ascii
$out = [ordered]@{ label = $Label }
$initOut = Join-Path $tmp "nd-$Label-init.txt"
cmd /c "`"$Bin\initdb.exe`" -D `"$Data`" -U postgres -A scram-sha-256 --pwfile=`"$pw`" -E UTF8 --locale=C --no-instructions > `"$initOut`" 2>&1 < nul"
$out.initdb = $LASTEXITCODE
if ($LASTEXITCODE -ne 0) {
    $out.error = ((Get-Content $initOut -Encoding Default | Where-Object { $_ -match 'FATAL|error' } | Select-Object -First 1) -replace '[^\x20-\x7E]', '?')
} else {
    $log = Join-Path $tmp "nd-$Label-pg.log"
    $startOut = Join-Path $tmp "nd-$Label-start.txt"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    cmd /c "`"$Bin\pg_ctl.exe`" start -w -t 60 -D `"$Data`" -l `"$log`" -o `"-p $Port -c listen_addresses=127.0.0.1`" > `"$startOut`" 2>&1 < nul"
    $out.start = $LASTEXITCODE
    $out.ready_s = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    if ($LASTEXITCODE -eq 0) {
        $env:PGPASSWORD = 'spike-local-secret'
        $out.query = (& "$Bin\psql.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres -Atc "select current_setting('server_encoding')" 2>&1 | Select-Object -First 1)
        $sw.Restart()
        $stopOut = Join-Path $tmp "nd-$Label-stop.txt"
        cmd /c "`"$Bin\pg_ctl.exe`" stop -m fast -w -D `"$Data`" > `"$stopOut`" 2>&1 < nul"
        $out.stop = $LASTEXITCODE
        $out.stop_s = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    } else {
        $out.error = ((Get-Content $startOut -Encoding Default | Select-Object -Last 2) -join ' ' -replace '[^\x20-\x7E]', '?')
    }
}
($out.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' | '
