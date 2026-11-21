# ==============================================================================
# Auto Sync & Push to GitHub: APLIKASI PMT -> oziepuskesmas/pmtbankot
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$SingleRun
)

$SourceDir = "G:\My Drive\APLIKASI PMT"
$TargetDir = "G:\My Drive\GitHub\pmtbankot"

# Excluded folders and file extensions
$ExcludedFolders = @('FOTO PMT', 'sampah', '.git', '.vscode', '.gemini', 'node_modules', '.idea', 'UPLOAD_KE_CLOUDFLARE')
$ExcludedExtensions = @('.tmp', '.log', '.bak', '.backup.js', '.backup.html', '.backup.png', '.zip', '.bat')

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  AUTO SYNC & PUSH TO GITHUB (PMT BANKOT)" -ForegroundColor Green
Write-Host "  Source: $SourceDir" -ForegroundColor White
Write-Host "  Target: $TargetDir" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

function Sync-Files-To-Git {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Sinkronisasi file ke folder GitHub..." -ForegroundColor Yellow
    
    $files = Get-ChildItem -Path $SourceDir -Recurse -File | Where-Object {
        $filePath = $_.FullName
        $relPath = $filePath.Substring($SourceDir.Length).TrimStart('\', '/')
        
        # Check folder exclusion
        $skip = $false
        foreach ($folder in $ExcludedFolders) {
            if ($relPath.StartsWith($folder + '\') -or $relPath.StartsWith($folder + '/') -or $relPath -eq $folder) {
                $skip = $true
                break
            }
        }
        if ($skip) { return $false }
        
        # Check extension exclusion
        foreach ($ext in $ExcludedExtensions) {
            if ($_.Name.EndsWith($ext, [System.StringComparison]::OrdinalIgnoreCase)) {
                return $false
            }
        }
        return $true
    }

    $copiedCount = 0
    foreach ($file in $files) {
        $relPath = $file.FullName.Substring($SourceDir.Length).TrimStart('\', '/')
        $destFile = Join-Path $TargetDir $relPath
        $destDir = Split-Path -Parent $destFile

        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }

        $needCopy = $false
        if (-not (Test-Path $destFile)) {
            $needCopy = $true
        } else {
            $targetItem = Get-Item $destFile
            if ($file.Length -ne $targetItem.Length -or $file.LastWriteTime -gt $targetItem.LastWriteTime) {
                $needCopy = $true
            }
        }

        if ($needCopy) {
            Copy-Item -Path $file.FullName -Destination $destFile -Force
            $copiedCount++
        }
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $copiedCount file disalin ke staging GitHub." -ForegroundColor Green

    # Cek git status di target
    $status = git -C $TargetDir status --porcelain
    if ($status) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Perubahan terdeteksi di Git:" -ForegroundColor Cyan
        $status | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }

        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Melakukan git add & commit..." -ForegroundColor Yellow
        git -C $TargetDir add -A
        $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        git -C $TargetDir commit -m "Auto-sync PMT Bankot & D1 update: $timestamp"

        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Mendorong (push) ke GitHub main branch..." -ForegroundColor Yellow
        $pushResult = git -C $TargetDir push origin main 2>&1
        Write-Host $pushResult -ForegroundColor White
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] BERHASIL: Perubahan telah di-push ke GitHub!" -ForegroundColor Green
    } else {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Repository Git sudah up-to-date (tidak ada perubahan baru)." -ForegroundColor DarkGray
    }
}

# Jalankan sinkronisasi awal saat script dijalankan
Sync-Files-To-Git

if ($SingleRun) {
    Write-Host "[Selesai] Mode SingleRun selesai." -ForegroundColor Cyan
    return
}

Write-Host "`n[Watcher Aktif] Memantau perubahan file secara real-time..." -ForegroundColor Cyan
Write-Host "Tekan Ctrl+C untuk berhenti kapan saja.`n" -ForegroundColor DarkYellow

# Setup FileSystemWatcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $SourceDir
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

$script:lastChangeTime = [DateTime]::MinValue
$script:syncScheduled = $false

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $rel = $path.Substring($SourceDir.Length).TrimStart('\', '/')
    foreach ($f in $ExcludedFolders) {
        if ($rel.StartsWith($f)) { return }
    }
    $script:lastChangeTime = [DateTime]::Now
    if (-not $script:syncScheduled) {
        $script:syncScheduled = $true
        Start-Sleep -Seconds 3
        Sync-Files-To-Git
        $script:syncScheduled = $false
    }
}

Register-ObjectEvent $watcher 'Changed' -Action $action | Out-Null
Register-ObjectEvent $watcher 'Created' -Action $action | Out-Null
Register-ObjectEvent $watcher 'Deleted' -Action $action | Out-Null

try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Unregister-Event -SourceIdentifier $watcher.ToString() -ErrorAction SilentlyContinue
    $watcher.Dispose()
}
