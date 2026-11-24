param([Parameter(Mandatory)][string]$Executable)

$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class PairingWindow {
    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr window, int item);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, StringBuilder text);
}
'@

$process = Start-Process -FilePath (Resolve-Path $Executable) -PassThru
try {
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        $process.Refresh()
        if ($process.HasExited) { throw 'Pairing executable exited before opening its window' }
        if ($process.MainWindowHandle -ne [IntPtr]::Zero) { break }
        Start-Sleep -Milliseconds 250
    }
    $window = $process.MainWindowHandle
    if ($window -eq [IntPtr]::Zero) { throw 'Pairing window did not open' }

    $edit = [PairingWindow]::GetDlgItem($window, 101)
    $button = [PairingWindow]::GetDlgItem($window, 1)
    $status = [PairingWindow]::GetDlgItem($window, 102)
    if (@($edit, $button, $status) -contains [IntPtr]::Zero) { throw 'Pairing controls are missing' }

    if (![PairingWindow]::PostMessage($window, 0x0111, [IntPtr]1, $button)) { throw 'Could not submit the empty code' }
    $statusText = [Text.StringBuilder]::new(256)
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $null = [PairingWindow]::SendMessage($status, 0x000D, [IntPtr]$statusText.Capacity, $statusText)
        if ($statusText.ToString().Contains('32-')) { break }
        Start-Sleep -Milliseconds 100
    }
    if (!$statusText.ToString().Contains('32-')) { throw 'The dialog did not reject the empty code' }
    if (![PairingWindow]::PostMessage($window, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) -or !$process.WaitForExit(10000)) {
        throw 'The pairing dialog did not close normally'
    }
    if ($process.ExitCode -ne 0) { throw 'The pairing executable did not exit successfully' }
    Write-Host 'Windows pairing dialog opened, validated the code and closed successfully.'
}
finally {
    if (!$process.HasExited) { Stop-Process -Id $process.Id -Force }
}
