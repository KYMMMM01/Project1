# Renders the narration: one WAV per line with the Windows voice "Microsoft Heami Desktop" (System.Speech), plus the time of every word.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/video/tts.ps1 -Lines <lines.json> -OutDir <dir> [-Rate 2] [-Voice "Microsoft Heami Desktop"]
# lines.json: [{ "id": "c01", "say": "text the voice reads" }, ...]. Writes <dir>/<id>.wav and <dir>/<id>.words.json
# ([{ "t": seconds from the start of the audio, "i": character index in `say`, "n": length }]). A line whose WAV already exists and is newer
# than lines.json and has the same text hash is kept (-Force renders everything again).
param(
  [Parameter(Mandatory = $true)][string]$Lines,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$Rate = 2,
  [string]$Voice = 'Microsoft Heami Desktop',
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
public class WordTap {
  public List<string> Rows = new List<string>();
  public void Attach(SpeechSynthesizer s) {
    s.SpeakProgress += delegate(object o, SpeakProgressEventArgs e) {
      Rows.Add(e.AudioPosition.TotalSeconds.ToString("0.000", System.Globalization.CultureInfo.InvariantCulture) + "," + e.CharacterPosition + "," + e.CharacterCount);
    };
  }
}
'@ -ReferencedAssemblies System.Speech

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$items = Get-Content -Raw -Encoding UTF8 -Path $Lines | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$names = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
if ($names -notcontains $Voice) { throw "Voice '$Voice' is not installed. Installed: $($names -join ', ')" }
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
$synth.Volume = 100
$sha = [System.Security.Cryptography.SHA1]::Create()
foreach ($it in $items) {
  $wav = Join-Path $OutDir ($it.id + '.wav')
  $wordsFile = Join-Path $OutDir ($it.id + '.words.json')
  $hashFile = Join-Path $OutDir ($it.id + '.hash')
  $key = $Voice + '|' + $Rate + '|' + $it.say
  $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key))).Replace('-', '')
  if (-not $Force -and (Test-Path $wav) -and (Test-Path $hashFile) -and ((Get-Content -Raw $hashFile).Trim() -eq $hash)) { Write-Output ("keep  " + $it.id); continue }
  $tap = New-Object WordTap
  $tap.Attach($synth)
  $synth.SetOutputToWaveFile($wav)
  $synth.Speak([string]$it.say)
  $synth.SetOutputToNull()
  $rows = @()
  foreach ($r in $tap.Rows) { $p = $r.Split(','); $rows += [pscustomobject]@{ t = [double]$p[0]; i = [int]$p[1]; n = [int]$p[2] } }
  $json = '[' + (($rows | ForEach-Object { '{"t":' + $_.t.ToString([Globalization.CultureInfo]::InvariantCulture) + ',"i":' + $_.i + ',"n":' + $_.n + '}' }) -join ',') + ']'
  [IO.File]::WriteAllText($wordsFile, $json, (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText($hashFile, $hash)
  Write-Output ("wrote " + $it.id + "  " + (Get-Item $wav).Length + " bytes, " + $rows.Count + " words")
}
$synth.Dispose()
