# Now playing on Windows: reads the system media controls (the panel Windows shows next
# to the volume flyout) through WinRT and prints one JSON line whenever something
# changes. Reads commands from stdin, one per line: play-pause, next, previous, quit.
# Ends when stdin closes, so it never outlives the app.
#
# Runs in Windows PowerShell 5.1 (built into Windows 10 and 11). ASCII only: the app
# passes it with -EncodedCommand.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

function Send($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 3))
  [Console]::Out.Flush()
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $T_Manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $T_Props = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
  $T_Stream = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $T_Reader = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

  # WinRT async calls become .NET tasks through WindowsRuntimeSystemExtensions.AsTask.
  $AsTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1

  function Await($op, [Type]$type) {
    $task = $AsTask.MakeGenericMethod($type).Invoke($null, @($op))
    if (-not $task.Wait(4000)) { throw 'WinRT call timed out' }
    return $task.Result
  }

  $Manager = Await ($T_Manager::RequestAsync()) $T_Manager
} catch {
  Send ([ordered]@{ t = 'error'; message = "$($_.Exception.Message)" })
  exit 2
}

# The session to show: one that plays beats a paused one, Spotify beats other players,
# and the one Windows itself shows wins a tie.
function Pick-Session {
  $sessions = @($Manager.GetSessions())
  if ($sessions.Count -eq 0) { return $null }
  $current = $null
  try { $c = $Manager.GetCurrentSession(); if ($null -ne $c) { $current = $c.SourceAppUserModelId } } catch { }
  $best = $null
  $bestScore = -1
  foreach ($s in $sessions) {
    $score = 0
    try { if ("$($s.GetPlaybackInfo().PlaybackStatus)" -eq 'Playing') { $score += 4 } } catch { }
    if ("$($s.SourceAppUserModelId)" -match 'spotify') { $score += 2 }
    if ($s.SourceAppUserModelId -eq $current) { $score += 1 }
    if ($score -gt $bestScore) { $best = $s; $bestScore = $score }
  }
  return $best
}

function Read-Cover($props) {
  if ($null -eq $props -or $null -eq $props.Thumbnail) { return '' }
  $stream = Await ($props.Thumbnail.OpenReadAsync()) $T_Stream
  try {
    $size = [int64]$stream.Size
    if ($size -le 0 -or $size -gt 4MB) { return '' }
    $bytes = $null
    try {
      $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
      $ms = New-Object System.IO.MemoryStream
      $net.CopyTo($ms)
      $bytes = $ms.ToArray()
    } catch {
      $reader = $T_Reader::new($stream.GetInputStreamAt(0))
      $null = Await ($reader.LoadAsync([uint32]$size)) ([uint32])
      $bytes = New-Object byte[] $size
      $reader.ReadBytes($bytes)
    }
    if ($null -eq $bytes -or $bytes.Length -eq 0) { return '' }
    $mime = "$($stream.ContentType)"
    if ($mime -notmatch '^image/') { $mime = 'image/jpeg' }
    return "data:$mime;base64,$([Convert]::ToBase64String($bytes))"
  } finally {
    try { $stream.Dispose() } catch { }
  }
}

function Run-Command($cmd) {
  $s = Pick-Session
  if ($null -eq $s) { return }
  switch ($cmd) {
    'play-pause' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
    'next' { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
    'previous' { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
  }
}

$stdin = New-Object System.IO.StreamReader ([Console]::OpenStandardInput())
$pending = $stdin.ReadLineAsync()
$lastJson = ''
$track = ''
$cover = ''
$coverChecks = 0
$wait = 0

while ($true) {
  if ($pending.IsCompleted) {
    $line = $null
    try { $line = $pending.Result } catch { }
    if ($null -eq $line) { break }
    $cmd = $line.Trim()
    if ($cmd -eq 'quit') { break }
    try { Run-Command $cmd } catch { }
    $pending = $stdin.ReadLineAsync()
    $wait = 0
    Start-Sleep -Milliseconds 200
  }

  if ($wait -le 0) {
    $wait = 4
    $state = [ordered]@{ t = 'state'; status = 'none'; app = ''; title = ''; artist = ''; album = ''; canPlayPause = $false; canNext = $false; canPrev = $false }
    $props = $null
    try {
      $s = Pick-Session
      if ($null -ne $s) {
        $info = $s.GetPlaybackInfo()
        $props = Await ($s.TryGetMediaPropertiesAsync()) $T_Props
        $state.status = "$($info.PlaybackStatus)"
        $state.app = "$($s.SourceAppUserModelId)"
        $state.title = "$($props.Title)"
        $state.artist = "$($props.Artist)"
        $state.album = "$($props.AlbumTitle)"
        $state.canPlayPause = [bool]$info.Controls.IsPlayPauseToggleEnabled
        $state.canNext = [bool]$info.Controls.IsNextEnabled
        $state.canPrev = [bool]$info.Controls.IsPreviousEnabled
      }
    } catch { }

    # Players often hand over the new cover a moment after the new title, so the cover
    # is read again twice after each song change.
    $key = "$($state.app)|$($state.title)|$($state.artist)|$($state.album)"
    $newCover = $null
    if ($key -ne $track) {
      $track = $key
      $coverChecks = 3
    }
    if ($coverChecks -gt 0) {
      $coverChecks -= 1
      $c = ''
      try { $c = Read-Cover $props } catch { }
      if ($c -ne $cover -or $coverChecks -eq 2) { $cover = $c; $newCover = $c }
    }

    $json = $state | ConvertTo-Json -Compress -Depth 3
    if ($json -ne $lastJson -or $null -ne $newCover) {
      $lastJson = $json
      if ($null -ne $newCover) { $state.cover = $newCover }
      Send $state
    }
  }
  $wait -= 1
  Start-Sleep -Milliseconds 250
}
