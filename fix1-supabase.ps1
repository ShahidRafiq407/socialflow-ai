$ErrorActionPreference = 'Stop'
$p = 'd:\Marketing companay\marketing-ai-saas\src\lib\supabase.ts'
$raw = [System.IO.File]::ReadAllText($p)
$eol = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
$lines = [System.Collections.Generic.List[string]]([System.IO.File]::ReadAllLines($p))

$newBlock = @'
  // which is relative to the Storage API root -- it MUST be prefixed with
  // `${SUPABASE_URL}/storage/v1` (the official storage-js SDK does exactly
  // `new URL(this.url + data.url)` where this.url ends with /storage/v1).
  // Prefixing the bare SUPABASE_URL without /storage/v1 produces a 404 and
  // every large (>3MB) direct upload fails.
  if (cleanPath.startsWith('/storage/v1/')) {
    return `${SUPABASE_URL}${cleanPath}`;
  }
  return `${SUPABASE_URL}/storage/v1${cleanPath}`;
}

// Memoized per serverless process so we only pay for one extra API call.
let bucketPublicEnsured = false;

/**
 * Best-effort: guarantee the `uploads` bucket is PUBLIC.
 * If the bucket exists but is private, uploads succeed (service key bypasses
 * RLS) yet the public object URL 404s -- Meta/LinkedIn/TikTok crawlers then
 * fail to fetch the media and publishing dies with a generic server error.
 */
async function ensureBucketPublic(bucketName: string = 'uploads'): Promise<void> {
  if (bucketPublicEnsured || !isSupabaseConfigured()) return;
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucketName}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ public: true }),
    });
    bucketPublicEnsured = true;
  } catch {
    // Non-fatal -- the publishing pipeline surfaces a clear error if unreachable.
  }
}
'@
$newLines = @($newBlock -split "`r?`n")

# 1) Locate the wrong comment line, then the closing brace of formatSignedUploadUrl
$start = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i].Contains('bare SUPABASE_URL (NOT')) { $start = $i; break }
}
if ($start -lt 0) { Write-Output 'START_NOT_FOUND'; exit 1 }

$end = -1
for ($i = $start; $i -lt $lines.Count; $i++) {
  if ($lines[$i].Trim() -eq '}') { $end = $i; break }
}
if ($end -lt 0) { Write-Output 'END_NOT_FOUND'; exit 1 }

$before = @()
if ($start -gt 0) { $before = $lines.GetRange(0, $start) }
$after = @()
if ($end + 1 -lt $lines.Count) { $after = $lines.GetRange($end + 1, $lines.Count - $end - 1) }
$merged = New-Object System.Collections.Generic.List[string]
if ($before.Count -gt 0) { $merged.AddRange($before) }
$merged.AddRange([string[]]$newLines)
if ($after.Count -gt 0) { $merged.AddRange($after) }
$lines = $merged
Write-Output ("BLOCK_REPLACED lines {0}-{1}" -f ($start + 1), ($end + 1))

# 2) Hook ensureBucketPublic() into saveMediaBuffer after uploadFile(rawBuffer,...)
$done2 = $false
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i].Contains('const storagePath = await uploadFile(rawBuffer')) {
    $lines.Insert($i + 1, '      await ensureBucketPublic();')
    $done2 = $true
    Write-Output ("SAVE_HOOKED at line {0}" -f ($i + 2))
    break
  }
}
if (-not $done2) { Write-Output 'SAVE_NOT_FOUND'; exit 1 }

# 3) Hook ensureBucketPublic(bucketName) into createSignedUploadUrl after bucketName const
$fnIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i].Contains('export async function createSignedUploadUrl')) { $fnIdx = $i; break }
}
if ($fnIdx -lt 0) { Write-Output 'SIGNFN_NOT_FOUND'; exit 1 }
$done3 = $false
for ($i = $fnIdx; $i -lt $lines.Count; $i++) {
  if ($lines[$i].Contains("const bucketName = 'uploads';")) {
    $lines.Insert($i + 1, '  await ensureBucketPublic(bucketName);')
    $done3 = $true
    Write-Output ("SIGN_HOOKED at line {0}" -f ($i + 2))
    break
  }
}
if (-not $done3) { Write-Output 'SIGN_NOT_FOUND'; exit 1 }

$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($p, (($lines -join $eol) + $eol), $enc)
Write-Output 'DONE'
