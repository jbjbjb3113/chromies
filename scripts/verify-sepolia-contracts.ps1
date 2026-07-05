# Verify live Sepolia Chromies contracts on Etherscan.
# Each contract is built from the git commit that matches its on-chain deployment.
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

function Ensure-VerifyWorktree([string]$Commit) {
    $dir = Join-Path $Root ".verify-worktrees\$Commit"
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path (Split-Path $dir -Parent) -Force | Out-Null
        git -C $Root worktree add $dir $Commit | Out-Null
        robocopy (Join-Path $Root "lib") (Join-Path $dir "lib") /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        Push-Location $dir
        try {
            & $Forge build --force --skip test --skip script | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "forge build failed at commit $Commit" }
        }
        finally {
            Pop-Location
        }
    }
    return $dir
}

Load-DotEnv (Join-Path $Root ".env")

if (-not $env:ETHERSCAN_API_KEY) { throw "ETHERSCAN_API_KEY is not set in .env" }
if (-not $env:SEPOLIA_RPC_URL) { throw "SEPOLIA_RPC_URL is not set in .env" }

# Git commits that match each live Sepolia deployment (see Redeploy*.s.sol broadcast logs).
$deploys = @(
    @{
        Name = "ChromaStorage"
        Commit = "31162d1"
        Fqcn = "contracts/ChromaStorage.sol:ChromaStorage"
        Broadcast = { Get-BroadcastCreate "RedeployChroma.s.sol" "ChromaStorage" }
        Sig = "constructor(address,address)"
    },
    @{
        Name = "Chroma"
        Commit = "31162d1"
        Fqcn = "contracts/Chroma.sol:Chroma"
        Broadcast = { Get-BroadcastCreate "RedeployChroma.s.sol" "Chroma" }
        Sig = "constructor(address,address,address,uint96)"
    },
    @{
        Name = "ChromaCanvasV2"
        Commit = "2f040cc"
        Fqcn = "contracts/ChromaCanvasV2.sol:ChromaCanvasV2"
        Broadcast = { Get-BroadcastCreate "RedeployCanvas.s.sol" "ChromaCanvasV2" }
        Sig = "constructor(address,address,address)"
    },
    @{
        Name = "PixelMarketplace"
        Commit = "31162d1"
        Fqcn = "contracts/PixelMarketplace.sol:PixelMarketplace"
        Broadcast = { Get-BroadcastCreate "RedeployChroma.s.sol" "PixelMarketplace" }
        Sig = $null
    },
    @{
        Name = "ChromaRenderer"
        Commit = "43500af"
        Fqcn = "contracts/ChromaRenderer.sol:ChromaRenderer"
        Broadcast = { Get-BroadcastCreate "RedeployRenderer.s.sol" "ChromaRenderer" }
        Sig = "constructor(address,address)"
    }
)

$failed = @()
foreach ($d in $deploys) {
    $broadcast = & $d.Broadcast
    $addr = $broadcast.contractAddress
    $worktree = Ensure-VerifyWorktree $d.Commit

    Write-Host "`n=== Verifying $($d.Name) at $addr (commit $($d.Commit)) ===" -ForegroundColor Cyan

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
        $encoded = Encode-ConstructorArgs $d.Sig @($broadcast.arguments)
        $args += @("--constructor-args", $encoded)
    }

    Push-Location $worktree
    try {
        & $Forge @args
        if ($LASTEXITCODE -ne 0) { $failed += $d.Name }
    }
    finally {
        Pop-Location
    }
}

if ($failed.Count -gt 0) {
    throw "Verification failed for: $($failed -join ', ')"
}

Write-Host "`nAll Sepolia contracts verified." -ForegroundColor Green
