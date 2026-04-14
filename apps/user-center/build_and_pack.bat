@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ======================================
echo 自动构建并打包项目
echo ======================================
echo.

REM 步骤1: 清理旧的构建文件
echo [步骤 1/3] 清理旧的构建文件...
if exist ".output\" (
    rmdir /s /q ".output"
    echo ✓ 已删除旧的 .output 目录
) else (
    echo ✓ .output 目录不存在，跳过清理
)
echo.

REM 步骤2: 构建项目
echo [步骤 2/3] 开始构建项目...
echo 这可能需要几分钟时间，请耐心等待...
echo.
call npm run build
echo.

if %errorlevel% neq 0 (
    echo ======================================
    echo ✗ 构建失败！
    echo ======================================
    echo.
    echo 请检查：
    echo 1. 是否安装了 node_modules ^(运行 npm install^)
    echo 2. 是否有语法错误
    echo 3. 查看上面的错误信息
    echo.
    pause
    exit /b 1
)

echo ✓ 构建成功！
echo.

REM 步骤3: 打包
echo [步骤 3/3] 开始打包...
echo.

REM 获取当前日期时间（格式：年月日_时分）
REM 使用 PowerShell 获取日期时间，更可靠
for /f "tokens=*" %%I in ('powershell -Command "Get-Date -Format \"yyyyMMdd_HHmm\""') do set timestamp=%%I

REM 设置输出文件名
set output_file=admin_%timestamp%.zip
set temp_file=temp_%output_file%

echo 打包文件名: %output_file%
echo.

REM 检查 .output 目录是否存在
if not exist ".output\" (
    echo [错误] .output 目录不存在！构建可能失败了。
    pause
    exit /b 1
)

REM 检查或创建 zips 目录
if not exist "zips\" (
    echo 创建 zips 目录...
    mkdir zips
    echo.
)

REM 使用 PowerShell 打包
powershell -Command "Compress-Archive -Path '.output\*' -DestinationPath '%temp_file%' -Force"

if %errorlevel% equ 0 (
    REM 移动文件到 zips 目录
    move /Y "%temp_file%" "zips\%output_file%" >nul
    
    echo.
    echo ======================================
    echo ✓✓✓ 构建并打包成功！✓✓✓
    echo ======================================
    echo.
    echo 文件位置: %cd%\zips\%output_file%
    echo.
    
    REM 多次复制文件路径到剪贴板（确保成功）
    echo 正在复制路径到剪贴板...
    
    REM 方法1: 使用 echo 和 clip
    echo|set /p="%cd%\zips\%output_file%" | clip
    timeout /t 1 /nobreak >nul
    
    REM 方法2: 使用 PowerShell
    powershell -Command "Set-Clipboard -Value '%cd%\zips\%output_file%'"
    timeout /t 1 /nobreak >nul
    
    REM 方法3: 再次使用 echo 和 clip
    echo %cd%\zips\%output_file% | clip
    timeout /t 1 /nobreak >nul
    
    REM 方法4: 使用 PowerShell 再次确认
    powershell -Command "Set-Clipboard -Value '%cd%\zips\%output_file%'"
    
    echo.
    echo ✓✓✓ 文件路径已复制到剪贴板！✓✓✓
    echo.
    echo 【复制的路径】
    echo %cd%\zips\%output_file%
    echo.
    echo 你现在可以直接 Ctrl+V 粘贴使用
    echo.
    
    REM 显示文件大小
    for %%A in ("zips\%output_file%") do (
        echo 文件大小: %%~zA 字节
    )
    echo.
) else (
    echo.
    echo ======================================
    echo ✗ 打包失败！
    echo ======================================
    echo.
)

echo.
echo 全部完成！按任意键退出...
pause >nul

