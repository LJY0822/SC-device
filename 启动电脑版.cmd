@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 (
  node tools\serve.cjs
) else (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" tools\serve.cjs
  ) else (
    echo Please install Node.js, then run this file again.
    pause
  )
)
