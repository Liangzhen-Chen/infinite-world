$ErrorActionPreference = 'Stop'
$taskSecret = Read-Host '请粘贴 DeepSeek API 密钥（输入隐藏，不会发送到聊天）' -AsSecureString
$taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
try {
    $taskValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    if ([string]::IsNullOrWhiteSpace($taskValue)) { throw '未输入密钥，设置未改变。' }
    [Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY', $taskValue, 'User')
    [Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY', $taskValue, 'Process')
    Write-Host '已设置当前 Windows 用户的 DEEPSEEK_API_KEY 环境变量。无需将密钥发给 Codex。'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)
    $taskValue = $null
    $taskSecret.Dispose()
}
Read-Host '按回车关闭'
