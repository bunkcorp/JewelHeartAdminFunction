param(
    [string]$Source = "c:\Data\dev\RetreatVolunteer\Redesign\Retreat_Volunteer_Schedule v7.xlsx",
    [string]$OutPath = "c:\Data\dev\JHapp\JewelHeartAdminFunction\clients\shared\retreat_v7.json"
)

function Get-SharedStrings($unz) {
    $raw = Get-Content (Join-Path $unz "xl\sharedStrings.xml") -Raw -Encoding UTF8
    $strings = @()
    foreach ($m in [regex]::Matches($raw, '<si>(.*?)</si>', 'Singleline')) {
        $block = $m.Groups[1].Value
        $parts = [regex]::Matches($block, '<(?:w:)?t[^>]*>([^<]*)</(?:w:)?t>') | ForEach-Object { $_.Groups[1].Value }
        $strings += [System.Net.WebUtility]::HtmlDecode($parts -join "")
    }
    return $strings
}

function Get-CellValue($c, $strings) {
    if (-not $c) { return $null }
    if ($c.t -eq 's') { return $strings[[int]$c.v] }
    return $c.v
}

function Parse-Sheet($unz, $sheetFile) {
    $raw = Get-Content (Join-Path $unz "xl\worksheets\$sheetFile") -Raw -Encoding UTF8
    $rows = @{}
    foreach ($rm in [regex]::Matches($raw, '<row r="(\d+)"[^>]*>(.*?)</row>', 'Singleline')) {
        $rnum = [int]$rm.Groups[1].Value
        $rowXml = $rm.Groups[2].Value
        $cells = @{}
        foreach ($cm in [regex]::Matches($rowXml, '<c r="([A-Z]+)(\d+)"([^>]*)>(?:<v>([^<]*)</v>)?', 'Singleline')) {
            $col = $cm.Groups[1].Value
            $attrs = $cm.Groups[3].Value
            $v = $cm.Groups[4].Value
            $t = if ($attrs -match 't="s"') { 's' } else { $null }
            $cells[$col] = [pscustomobject]@{ t = $t; v = $v }
        }
        $rows[$rnum] = $cells
    }
    return $rows
}

function Slugify([string]$text) {
  return ($text.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
}

$tmp = Join-Path $env:TEMP "xlsx_export_v7"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $tmp "unz") -Force | Out-Null
Copy-Item $Source (Join-Path $tmp "f.zip")
Expand-Archive (Join-Path $tmp "f.zip") (Join-Path $tmp "unz") -Force

$unz = Join-Path $tmp "unz"
$strings = Get-SharedStrings $unz
$dataRows = Parse-Sheet $unz "sheet1.xml"
$instRows = Parse-Sheet $unz "sheet5.xml"

$shifts = @()
for ($r = 5; $r -le 86; $r++) {
    $cells = $dataRows[$r]
    if (-not $cells) { continue }
    $dayNum = Get-CellValue $cells['A'] $strings
    $weekday = Get-CellValue $cells['B'] $strings
    $slot = Get-CellValue $cells['C'] $strings
    $site = Get-CellValue $cells['D'] $strings
    $activity = Get-CellValue $cells['E'] $strings
    $vols = Get-CellValue $cells['F'] $strings
    $mins = Get-CellValue $cells['G'] $strings
    if ($null -eq $dayNum -or $null -eq $site) { continue }
    $em = [char]0x2014
    $jobTitle = "$site $em $activity"
    $shifts += [ordered]@{
        id           = "d$dayNum-$(Slugify $slot)-$(Slugify $jobTitle)"
        dayNumber    = [int]$dayNum
        weekday      = $weekday
        slot         = $slot
        site         = $site
        activity     = $activity
        jobTitle     = $jobTitle
        jobId        = Slugify $jobTitle
        volunteersNeeded = [int]$vols
        estimatedMinutes = [int]$mins
    }
}

$instructionsByJobId = @{}
$currentJobId = $null
for ($r = 1; $r -le 200; $r++) {
    $cells = $instRows[$r]
    if (-not $cells) { continue }
    $a = Get-CellValue $cells['A'] $strings
    $b = Get-CellValue $cells['B'] $strings
    if ($a -and ($a -match '—|–|-' -and $a -notmatch '^(Job|Instructions|Job Instructions)$')) {
        $baseTitle = ($a -replace '\s+\(.*$', '').Trim()
        $currentJobId = Slugify $baseTitle
        if (-not $instructionsByJobId.ContainsKey($currentJobId)) { $instructionsByJobId[$currentJobId] = @() }
        continue
    }
    if ($b -and $currentJobId) { $instructionsByJobId[$currentJobId] += $b }
}

function Get-InstructionLines([string]$jobId) {
    if (-not $instructionsByJobId.ContainsKey($jobId)) { return @() }
    return @($instructionsByJobId[$jobId] | Where-Object { $_ })
}

$jobs = [System.Collections.Generic.List[object]]::new()
foreach ($s in $shifts) {
    $jt = $s.jobTitle
    if ($jobs | Where-Object { $_.title -eq $jt }) { continue }
    $lines = Get-InstructionLines $s.jobId
    $jobs.Add([PSCustomObject]@{
            id           = $s.jobId
            site         = $s.site
            activity     = $s.activity
            title        = $jt
            instructions = [string[]]$lines
        })
}

$outObj = [PSCustomObject]@{
    retreatName   = "JH Summer 2026 Retreat"
    startDate     = "2026-07-20"
    endDate       = "2026-07-26"
    scheduledDays = 6
    testToday     = "2026-07-21"
    shifts        = @($shifts)
    jobs          = $jobs.ToArray()
}

New-Item -ItemType Directory -Path (Split-Path $OutPath) -Force | Out-Null
$json = $outObj | ConvertTo-Json -Depth 10
# PowerShell 5.1 emits {} or null for empty nested arrays; Gson requires [].
$json = [regex]::Replace($json, '"instructions"\s*:\s*\{\s*\}', '"instructions": []')
$json = [regex]::Replace($json, '"instructions"\s*:\s*null', '"instructions": []')
# UTF-8 without BOM — BOM breaks Gson on Android.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($OutPath, $json, $utf8NoBom)
Write-Host "Wrote $($shifts.Count) shifts, $($jobs.Count) jobs to $OutPath"
