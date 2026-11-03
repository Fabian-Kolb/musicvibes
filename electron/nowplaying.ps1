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
  $T_Buffer = [Windows.Storage.Streams.Buffer, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $T_IBuffer = [Windows.Storage.Streams.IBuffer, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $T_Options = [Windows.Storage.Streams.InputStreamOptions, Windows.Storage.Streams, ContentType = WindowsRuntime]

  # WinRT async calls become .NET tasks through WindowsRuntimeSystemExtensions.AsTask.
  $AsTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1
  $AsTaskProgress = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperationWithProgress`2'
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

# The cover comes as a WinRT stream. Three ways to get its bytes, because not every
# Windows build lets PowerShell use each of them; what failed is reported as coverError.
$script:CoverError = ''

function Read-Bytes($stream, $size) {
  $errors = @()
  try {
    $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead([Windows.Storage.Streams.IInputStream]$stream)
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms)
    if ($ms.Length -gt 0) { return ,$ms.ToArray() }
    $errors += 'stream: empty'
  } catch { $errors += "stream: $($_.Exception.Message)" }
  try {
    $buf = $T_Buffer::new([uint32]$size)
    $op = $stream.ReadAsync($buf, [uint32]$size, $T_Options::None)
    $task = $AsTaskProgress.MakeGenericMethod($T_IBuffer, [uint32]).Invoke($null, @($op))
    if (-not $task.Wait(4000)) { throw 'timed out' }
    $bytes = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::ToArray($task.Result)
    if ($bytes.Length -gt 0) { return ,$bytes }
    $errors += 'buffer: empty'
  } catch { $errors += "buffer: $($_.Exception.Message)" }
  try {
    $reader = $T_Reader::new($stream.GetInputStreamAt(0))
    $null = Await ($reader.LoadAsync([uint32]$size)) ([uint32])
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    if ($bytes.Length -gt 0) { return ,$bytes }
    $errors += 'reader: empty'
  } catch { $errors += "reader: $($_.Exception.Message)" }
  $script:CoverError = ($errors -join ' | ')
  return $null
}

function Read-Cover($props) {
  $script:CoverError = ''
  if ($null -eq $props) { return '' }
  if ($null -eq $props.Thumbnail) { $script:CoverError = 'no-thumbnail'; return '' }
  $stream = $null
  try {
    $stream = Await ($props.Thumbnail.OpenReadAsync()) $T_Stream
    $size = [int64]$stream.Size
    if ($size -le 0) { $script:CoverError = 'empty'; return '' }
    if ($size -gt 4MB) { $script:CoverError = 'too-big'; return '' }
    $bytes = Read-Bytes $stream $size
    if ($null -eq $bytes) { return '' }
    $mime = "$($stream.ContentType)"
    if ($mime -notmatch '^image/') { $mime = 'image/jpeg' }
    return "data:$mime;base64,$([Convert]::ToBase64String($bytes))"
  } catch {
    $script:CoverError = "open: $($_.Exception.Message)"
    return ''
  } finally {
    if ($null -ne $stream) { try { $stream.Dispose() } catch { } }
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
$coverReads = 0
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
    # is read again twice after each song change, and every second for ten seconds
    # while there is none.
    $key = "$($state.app)|$($state.title)|$($state.artist)|$($state.album)"
    $newCover = $null
    if ($key -ne $track) {
      $track = $key
      $coverChecks = 12
      $coverReads = 0
    }
    if ($coverChecks -gt 0 -and ($coverReads -lt 3 -or $cover -eq '')) {
      $coverChecks -= 1
      $coverReads += 1
      $c = Read-Cover $props
      if ($c -ne $cover -or $coverReads -eq 1) { $cover = $c; $newCover = $c }
    }
    $state.coverError = $script:CoverError

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
