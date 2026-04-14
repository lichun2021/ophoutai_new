@echo off
chcp 65001 >nul
setlocal

echo ======================================
echo   三套应用一键部署工具
echo ======================================
echo.
echo 请选择要部署的应用:
echo   [1] 全部部署 (user-center + agent-admin + op-admin)
echo   [2] 只部署 user-center  (用户中心)
echo   [3] 只部署 agent-admin  (代理后台)
echo   [4] 只部署 op-admin     (运营后台)
echo   [5] 部署 user-center + agent-admin
echo   [6] 部署 agent-admin + op-admin
echo   [0] 退出
echo.
set /p choice=请输入选项 (0-6): 

if "%choice%"=="0" goto :EOF
if "%choice%"=="1" set ARGS=
if "%choice%"=="2" set ARGS=user
if "%choice%"=="3" set ARGS=agent
if "%choice%"=="4" set ARGS=op
if "%choice%"=="5" set ARGS=user agent
if "%choice%"=="6" set ARGS=agent op

if not defined ARGS (
    if "%choice%"=="1" (
        set ARGS=
    ) else (
        echo 无效选项，退出
        pause
        goto :EOF
    )
)

echo.
echo 正在查找 Git Bash...

REM 查找 Git Bash
set BASH=
if exist "C:\Program Files\Git\bin\bash.exe" set BASH=C:\Program Files\Git\bin\bash.exe
if exist "C:\Program Files (x86)\Git\bin\bash.exe" set BASH=C:\Program Files (x86)\Git\bin\bash.exe

if not defined BASH (
    echo [错误] 未找到 Git Bash，请安装 Git for Windows
    echo 下载地址: https://git-scm.com/download/win
    pause
    goto :EOF
)

echo 找到 Git Bash: %BASH%
echo.

REM 获取脚本所在目录
set SCRIPT_DIR=%~dp0
set DEPLOY_SCRIPT=%SCRIPT_DIR%deploy.sh
set DEPLOY_SCRIPT_UNIX=%SCRIPT_DIR:\=/%
REM 转换盘符 D:/ -> /d/
set DRIVE=%DEPLOY_SCRIPT_UNIX:~0,1%
set DEPLOY_SCRIPT_UNIX=/d/%DEPLOY_SCRIPT_UNIX:~3%
REM 去掉结尾的 /
set DEPLOY_SCRIPT_UNIX=%DEPLOY_SCRIPT_UNIX%deploy.sh

echo 开始部署...
echo.

if "%choice%"=="1" (
    "%BASH%" "%SCRIPT_DIR%deploy.sh"
) else (
    "%BASH%" "%SCRIPT_DIR%deploy.sh" %ARGS%
)

echo.
if %errorlevel% equ 0 (
    echo [成功] 部署完成！
) else (
    echo [失败] 部署过程中出现错误，请检查上面的日志
)

echo.
pause
