$ErrorActionPreference = "Stop"

$repo = "https://github.com/crt-dot-soluble/img2dmg.wiki.git"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$temp = Join-Path $root ".tmp\wiki"
$docs = Join-Path $root "docs"

if (-not (Test-Path $docs)) {
    throw "docs folder not found."
}

if (Test-Path $temp) {
    Remove-Item -Recurse -Force $temp
}

New-Item -ItemType Directory -Force -Path $temp | Out-Null

git clone $repo $temp

Get-ChildItem -Path $temp -Force | Where-Object { $_.Name -ne ".git" } | ForEach-Object {
    Remove-Item -Recurse -Force $_.FullName
}

Copy-Item -Path (Join-Path $docs "*") -Destination $temp -Recurse -Force

Push-Location $temp
try {
    git add .
    $status = git status --porcelain
    if ($status) {
        git commit -m "Update wiki"
        git push
    } else {
        Write-Host "Wiki is already up to date."
    }
} finally {
    Pop-Location
}
