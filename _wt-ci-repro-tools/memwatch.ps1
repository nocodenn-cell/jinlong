param(
  [Parameter(Mandatory)][string]$OutCsv,
  [int]$IntervalSec = 2,
  [int]$MaxMinutes = 60
)
# Amostra RSS (WorkingSet) dos processos node/chrome/headless_shell a cada N s.
# Colunas: ts, elapsed_s, proc, pid, rss_mb, cmd (curto). Só leitura; não altera nada.
$start = Get-Date
"ts,elapsed_s,proc,pid,rss_mb,cmd" | Out-File -Encoding utf8 $OutCsv
while (((Get-Date) - $start).TotalMinutes -lt $MaxMinutes) {
  $now = Get-Date
  $el = [int]($now - $start).TotalSeconds
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='chrome.exe' OR Name='chrome-headless-shell.exe'" |
    Select-Object ProcessId, Name, WorkingSetSize, CommandLine
  foreach ($p in $procs) {
    $mb = [math]::Round($p.WorkingSetSize / 1MB, 0)
    if ($mb -lt 150) { continue }
    $cmd = ($p.CommandLine -replace '"', '' -replace ',', ';')
    if ($cmd.Length -gt 110) { $cmd = $cmd.Substring(0, 110) }
    "{0},{1},{2},{3},{4},{5}" -f $now.ToString('HH:mm:ss'), $el, $p.Name, $p.ProcessId, $mb, $cmd | Out-File -Append -Encoding utf8 $OutCsv
  }
  Start-Sleep -Seconds $IntervalSec
}
