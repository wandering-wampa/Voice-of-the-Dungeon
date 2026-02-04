$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $root 'dist'
$buildDir = Join-Path $root 'build'
$venvDir = Join-Path $root '.venv'
$exeName = 'vod-stt-server.exe'

Set-Location $root

Write-Host 'Creating venv...'
& py -3.11 -m venv $venvDir

Write-Host 'Activating venv...'
. (Join-Path $venvDir 'Scripts\\Activate.ps1')
$venvPython = Join-Path $venvDir 'Scripts\\python.exe'

Write-Host 'Installing dependencies...'
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $root 'requirements.txt')
& $venvPython -m pip install pyinstaller

Write-Host 'Building executable...'
& $venvPython -m PyInstaller --noconfirm --onefile --name 'vod-stt-server' `
  --collect-all faster_whisper `
  --collect-all ctranslate2 `
  --distpath $distDir `
  --workpath $buildDir `
  --specpath $root `
  (Join-Path $root 'server.py')

Write-Host 'Packaging runtime zip...'
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
Compress-Archive -Path (Join-Path $distDir $exeName) -DestinationPath (Join-Path $distDir 'vod-stt-win-x64.zip') -Force

Write-Host 'Done. Output:' (Join-Path $distDir 'vod-stt-win-x64.zip')
