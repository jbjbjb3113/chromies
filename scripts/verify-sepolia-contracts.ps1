# Verify live Sepolia Chromies contracts on Etherscan.
# Constructor args are taken from Foundry broadcast logs (not hand-derived).
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Forge = Join-Path $Root ".foundry-bin\forge.exe"
$Cast = Join-Path $Root ".foundry-bin\cast.exe"

function Load-DotEnv([string]$Path) {
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") { $value = $matches[1] }
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

function Get-BroadcastCreate([string]$ScriptName, [string]$ContractName) {
    $path = Join-Path $Root "broadcast\$ScriptName\11155111\run-latest.json"
    if (-not (Test-Path $path)) { throw "Missing broadcast log: $path" }
    $json = Get-Content $path -Raw | ConvertFrom-Json
    foreach ($tx in $json.transactions) {
        if ($tx.transactionType -eq "CREATE" -and $tx.contractName -eq $ContractName) {
            return $tx
        }
    }
    throw "CREATE $ContractName not found in $path"
}

function Encode-ConstructorArgs([string]$Signature, [string[]]$Values) {
    $cmdArgs = @("abi-encode", $Signature) + $Values
    $encoded = & $Cast @cmdArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "cast abi-encode failed for $Signature`: $encoded" }
    return ($encoded | Out-String).Trim()
}

Load-DotEnv (Join-Path $Root ".env")

if (-not $env:ETHERSCAN_API_KEY) { throw "ETHERSCAN_API_KEY is not set in .env" }
if (-not $env:SEPOLIA_RPC_URL) { throw "SEPOLIA_RPC_URL is not set in .env" }

Push-Location $Root
try {
    & $Forge build | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "forge build failed" }

    $deploys = @(
        @{
            Name = "ChromaStorage"
            Fqcn = "contracts/ChromaStorage.sol:ChromaStorage"
            Broadcast = Get-BroadcastCreate "RedeployChroma.s.sol" "ChromaStorage"
            Sig = "constructor(address,address)"
        },
        @{
            Name = "Chroma"
            Fqcn = "contracts/Chroma.sol:Chroma"
            Broadcast = Get-BroadcastCreate "RedeployChroma.s.sol" "Chroma"
            Sig = "constructor(address,address,address,uint96)"
        },
        @{
            Name = "ChromaCanvasV2"
            Fqcn = "contracts/ChromaCanvasV2.sol:ChromaCanvasV2"
            Broadcast = Get-BroadcastCreate "RedeployCanvas.s.sol" "ChromaCanvasV2"
            Sig = "constructor(address,address,address)"
        },
        @{
            Name = "PixelMarketplace"
            Fqcn = "contracts/PixelMarketplace.sol:PixelMarketplace"
            Broadcast = Get-BroadcastCreate "RedeployChroma.s.sol" "PixelMarketplace"
            Sig = $null
        },
        @{
            Name = "ChromaRenderer"
            Fqcn = "contracts/ChromaRenderer.sol:ChromaRenderer"
            Broadcast = Get-BroadcastCreate "RedeployRenderer.s.sol" "ChromaRenderer"
            Sig = "constructor(address,address)"
        }
    )

    foreach ($d in $deploys) {
        $addr = $d.Broadcast.contractAddress
        Write-Host "`n=== Verifying $($d.Name) at $addr ===" -ForegroundColor Cyan

        $args = @(
            "verify-contract",
            $addr,
            $d.Fqcn,
            "--chain", "sepolia",
            "--rpc-url", $env:SEPOLIA_RPC_URL,
            "--etherscan-api-key", $env:ETHERSCAN_API_KEY,
            "--watch"
        )

        if ($d.Sig) {
            $encoded = Encode-ConstructorArgs $d.Sig @($d.Broadcast.arguments)
            $args += @("--constructor-args", $encoded)
        }

        & $Forge @args
        if ($LASTEXITCODE -ne 0) { throw "Verification failed for $($d.Name)" }
    }

    Write-Host "`nAll Sepolia contracts verified." -ForegroundColor Green
}
finally {
    Pop-Location
}
