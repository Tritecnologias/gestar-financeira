param([string]$Tag = '10s-phase1a:verified')
$ErrorActionPreference = 'Stop'
$repo = (git rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0) { throw 'Not a Git checkout' }
if (git status --porcelain) { throw 'Clean checkout required; commit and review before attesting an image' }
$revision = (git rev-parse HEAD)
$branch = (git branch --show-current)
if ($revision -notmatch '^[0-9a-f]{40}$' -or !$branch) { throw 'Invalid source provenance' }
$destination = Join-Path ([System.IO.Path]::GetTempPath()) ('10s-build-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $destination | Out-Null
$archive = Join-Path $destination 'source.tar'
# Archive only the reviewed commit: no working-tree extras, env or Git metadata.
git archive --format=tar --output=$archive $revision app
if ($LASTEXITCODE -ne 0) { throw 'Git archive failed' }
tar -xf $archive -C $destination
if ($LASTEXITCODE -ne 0) { throw 'Archive extraction failed' }
docker build --build-arg "SOURCE_COMMIT=$revision" --build-arg "SOURCE_BRANCH=$branch" -t $Tag (Join-Path $destination 'app')
if ($LASTEXITCODE -ne 0) { throw 'Docker build failed; diagnostic context preserved' }
Write-Output "BUILD_VERIFIED_SOURCE=$revision"
Write-Output "PRIVATE_CONTEXT=$destination"
# Context is deliberately preserved for review; no automatic recursive deletion.
