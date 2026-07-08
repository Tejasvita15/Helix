param(
    [switch]$SkipInstall,
    [switch]$SkipModelWarmup,
    [switch]$Phone,
    [int]$ApiPort = 8000,
    [int]$WebPort = 8081
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$MobileDir = Join-Path $RepoRoot "apps\mobile"
$ApiDir = Join-Path $RepoRoot "services\api"
$VenvPython = Join-Path $ApiDir ".venv\Scripts\python.exe"
$ExportDir = Join-Path $MobileDir ".expo-web-demo"
$ApiHost = if ($Phone) { "0.0.0.0" } else { "127.0.0.1" }

function Require-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Stop-Port($Port) {
    $lines = netstat -ano | Select-String ":$Port"
    $procIds = @()
    foreach ($line in $lines) {
        $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
        if ($parts.Length -ge 5 -and $parts[1] -match ":$Port$") {
            $procIds += [int]$parts[-1]
        }
    }

    $procIds = $procIds | Sort-Object -Unique | Where-Object { $_ -ne 0 }
    foreach ($procId in $procIds) {
        Write-Host "Stopping process $procId on port $Port"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

function Wait-ForUrl($Url, $Name) {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
            Invoke-WebRequest -UseBasicParsing $Url | Out-Null
            Write-Host "$Name is ready: $Url"
            return
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    throw "$Name did not become ready at $Url"
}

Require-Command "python"
Require-Command "npm"
Require-Command "npx"

if (-not $SkipInstall) {
    Write-Host "Installing mobile dependencies..."
    Push-Location $MobileDir
    npm install
    Pop-Location

    if (-not (Test-Path $VenvPython)) {
        Write-Host "Creating backend virtual environment..."
        Push-Location $ApiDir
        python -m venv .venv
        Pop-Location
    }

    Write-Host "Installing backend dependencies..."
    Push-Location $ApiDir
    & $VenvPython -m pip install -r requirements.txt
    Pop-Location
}

if (-not $SkipModelWarmup) {
    Write-Host "Warming Auralis model cache..."
    Push-Location $ApiDir
    & $VenvPython -c "from app.auralis_model import get_auralis_model; get_auralis_model(); print('Auralis ready')"

    Write-Host "Warming Whisper model cache..."
    & $VenvPython -c "from app.whisper_service import get_whisper_transcriber; get_whisper_transcriber(); print('Whisper ready')"
    Pop-Location
}

Write-Host "Building static web app..."
Push-Location $MobileDir
npx expo export --platform web --output-dir .expo-web-demo
Pop-Location

Stop-Port $ApiPort
Stop-Port $WebPort

Write-Host "Starting backend on $ApiHost`:$ApiPort..."
$BackendCommand = "cd /d `"$ApiDir`" && .\.venv\Scripts\python.exe -m uvicorn app.main:app --host $ApiHost --port $ApiPort"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $BackendCommand -WindowStyle Minimized

Write-Host "Starting web app on 127.0.0.1:$WebPort..."
$WebCommand = "cd /d `"$ExportDir`" && python -m http.server $WebPort --bind 127.0.0.1"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $WebCommand -WindowStyle Minimized

Wait-ForUrl "http://127.0.0.1:$ApiPort/health" "Backend"
Wait-ForUrl "http://127.0.0.1:$WebPort/" "Web app"

Write-Host ""
Write-Host "MindTrail SG demo is running."
Write-Host "App:     http://127.0.0.1:$WebPort/"
Write-Host "Backend: http://127.0.0.1:$ApiPort/"
Write-Host ""
Write-Host "For phone testing, rerun with -Phone and set API_BASE_URL in apps/mobile/App.tsx to this PC's Wi-Fi IP."
