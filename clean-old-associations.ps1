$ErrorActionPreference = 'Stop'
$backupDir = Join-Path $PSScriptRoot ('test-results\association-cleanup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDir | Out-Null
$backupKeys = @(
 'HKCU\Software\Classes\Applications\PRD-Workspace-1.2.0-Portable.exe',
 'HKCU\Software\Classes\Applications\PRD-Workspace-1.2.1-Portable.exe',
 'HKCU\Software\Classes\PRDWorkspace.Document',
 'HKCU\Software\Classes\.prdproj',
 'HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.prdproj',
 'HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache'
)
$i = 0
foreach ($key in $backupKeys) {
 if (Test-Path -LiteralPath ('Registry::' + $key.Replace('HKCU\','HKEY_CURRENT_USER\'))) {
  & reg.exe export $key (Join-Path $backupDir ("backup-$i.reg")) /y | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "无法备份：$key" }
 }
 $i++
}
$oldApps = @('PRD-Workspace.exe','PRD-Workspace-1.2.0-Portable.exe','PRD-Workspace-1.2.1-Portable.exe')
foreach ($name in $oldApps) {
 $key = 'HKCU:\Software\Classes\Applications\' + $name
 $command = Get-Item -LiteralPath ($key + '\shell\open\command') -ErrorAction SilentlyContinue
 if ($command -and $command.GetValue('') -like '*E:\PRD与评审记录工具\pack\*') {
  Remove-Item -LiteralPath $key -Recurse -Force
 }
}
$legacy = 'HKCU:\Software\Classes\PRDWorkspace.Document'
$legacyCommand = Get-Item -LiteralPath ($legacy + '\shell\open\command') -ErrorAction SilentlyContinue
if ($legacyCommand -and $legacyCommand.GetValue('') -like '*E:\PRD与评审记录工具\pack\*') {
 Remove-Item -LiteralPath $legacy -Recurse -Force
 foreach ($key in @('HKCU:\Software\Classes\.prdproj\OpenWithProgids','HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.prdproj\OpenWithProgids')) {
  Remove-ItemProperty -LiteralPath $key -Name 'PRDWorkspace.Document' -ErrorAction SilentlyContinue
 }
}
$mruPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.prdproj\OpenWithList'
$mru = Get-Item -LiteralPath $mruPath -ErrorAction SilentlyContinue
if ($mru) {
 $removed = @()
 foreach ($name in $mru.GetValueNames()) {
  if ($name -ne 'MRUList' -and $mru.GetValue($name) -in $oldApps) {
   Remove-ItemProperty -LiteralPath $mruPath -Name $name
   $removed += $name
  }
 }
 $order = -join ([string]$mru.GetValue('MRUList')).ToCharArray().Where({[string]$_ -notin $removed})
 Set-ItemProperty -LiteralPath $mruPath -Name MRUList -Value $order
}
$muiPath = 'HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache'
$mui = Get-Item -LiteralPath $muiPath -ErrorAction SilentlyContinue
if ($mui) {
 foreach ($name in $mui.GetValueNames()) {
  if ($name -like 'E:\PRD与评审记录工具\pack\*' -and $name -match 'PRD.*\.exe\.(FriendlyAppName|ApplicationCompany)$') {
   Remove-ItemProperty -LiteralPath $muiPath -Name $name
  }
 }
}
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class PrdAssociationRefresh { [DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b); }'
[PrdAssociationRefresh]::SHChangeNotify(0x08000000,0,[IntPtr]::Zero,[IntPtr]::Zero)
Write-Output "旧版打开方式记录已清理。备份：$backupDir"
Get-ItemProperty -LiteralPath 'HKCU:\Software\Classes\.prdproj','HKCU:\Software\Classes\PRD与评审管理工具文档\shell\open\command' | Format-List
