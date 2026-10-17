param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
$patchText = Get-Content -LiteralPath (Join-Path $sourceRoot 'PatchInfo\Patch.ini') -Raw
$versionMatch = [regex]::Match($patchText, '(?im)^\s*version\s*=\s*(\d+)\s*$')
if (-not $versionMatch.Success) { throw 'Patch version not found' }
$version = $versionMatch.Groups[1].Value
$snapshot = "$version-$(Get-Date -Format 'yyyyMMddHHmmss')"
$snapshotRoot = Join-Path $Destination $snapshot
New-Item -ItemType Directory -Path $snapshotRoot -Force | Out-Null
$extensions = @('.pak', '.dll', '.exe', '.ani', '.asi', '.bmp', '.crt', '.ico', '.bin', '.com', '.config')
$excluded = @('uninst.exe', 'GameRecovery.exe', 'ValofeMigration.exe')
$files = @(Get-ChildItem -LiteralPath $sourceRoot -File | Where-Object {
    ($_.Extension -in $extensions -or $_.Name -in @('icudtl.dat', 'font.ini')) -and $_.Name -notin $excluded
} | Sort-Object Name)
$entries = @()
$count = 0
foreach ($file in $files) {
    $sourceHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $target = Join-Path $snapshotRoot $file.Name
    Copy-Item -LiteralPath $file.FullName -Destination $target
    $copiedHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sourceHash -ne $copiedHash) { throw "Hash mismatch: $($file.Name)" }
    $entries += @{name=$file.Name; size=$file.Length; sha256=$sourceHash}
    $count++
    if ($count % 20 -eq 0) { Write-Output "Verified $count/$($files.Count) files" }
}
if ((Get-Content -LiteralPath (Join-Path $sourceRoot 'PatchInfo\Patch.ini') -Raw) -ne $patchText) { throw 'Patch version changed during copy' }
$manifest = @{version=$version; snapshot=$snapshot; createdAt=[DateTime]::UtcNow.ToString('o'); files=@($entries)} | ConvertTo-Json -Depth 5
$temporaryManifest = Join-Path $Destination "$snapshot-manifest.tmp"
[IO.File]::WriteAllText($temporaryManifest, $manifest, [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporaryManifest -Destination (Join-Path $Destination 'manifest.json') -Force
Write-Output "Published snapshot $snapshot with $($files.Count) verified files"
