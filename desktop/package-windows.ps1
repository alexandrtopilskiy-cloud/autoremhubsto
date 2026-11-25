$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location (Join-Path $PSScriptRoot '..')

$stage = Join-Path (Get-Location) 'desktop-stage'
$cache = Join-Path (Get-Location) 'desktop-build-cache'
New-Item -ItemType Directory -Force $stage, $cache, "$stage/app", "$stage/desktop", "$stage/postgres" | Out-Null

npm install --prefix $cache --no-package-lock electron@42.11.18
node "$cache/node_modules/electron/install.js"
Copy-Item "$cache/node_modules/electron/dist" "$stage/runtime" -Recurse
Rename-Item "$stage/runtime/electron.exe" 'AutoRemHub.exe'

$pg = (npm pack --pack-destination $cache --silent '@embedded-postgres/windows-x64@16.15.0-beta.19' | Select-Object -Last 1)
tar -xzf (Join-Path $cache $pg) -C "$stage/postgres" --strip-components=2 package/native
tar -xOf (Join-Path $cache $pg) package/package.json | Set-Content "$stage/postgres/distribution.json" -Encoding utf8

npm ci
npx prisma generate
npm run build
if (Test-Path .next/cache) { Remove-Item .next/cache -Recurse -Force }
Copy-Item .next, node_modules, prisma, public, package.json, next.config.ts "$stage/app" -Recurse
# next.config.ts references the version helper at startup through Next's configuration loader.
New-Item -ItemType Directory -Force "$stage/app/src/lib" | Out-Null
Copy-Item src/lib/version.ts "$stage/app/src/lib"
Copy-Item desktop/main.cjs, desktop/runtime.cjs, desktop/package.json "$stage/desktop"

$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
if (!(Test-Path $iscc)) {
    choco install innosetup --yes --no-progress
}
& $iscc /Qp desktop/setup.iss
