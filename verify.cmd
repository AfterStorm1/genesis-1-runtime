@echo off
rem Genesis-1 local verify script (run it in your normal terminal)
rem All results go to docs\evidence\verify.log
cd /d %~dp0
set "LOG=%~dp0docs\evidence\verify.log"
del "%LOG%" 2>nul

call :run "typecheck" "node node_modules/typescript/bin/tsc --noEmit"
call :run "unit-tests" "node node_modules/vitest/vitest.mjs run --config vitest.config.ts"
call :run "e2e-tests" "node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts"
call :run "scan-validate-at" "node node_modules/tsx/dist/cli.mjs scripts/scan-validate-at.ts"
call :run "payload-shape" "node node_modules/tsx/dist/cli.mjs scripts/payload-shape-report.ts"
call :run "bench-slots" "node node_modules/tsx/dist/cli.mjs scripts/bench-slots.ts"
call :run "bench-frame-channel" "node node_modules/tsx/dist/cli.mjs scripts/bench-frame-channel.ts"
call :run "gen-evidence" "node node_modules/tsx/dist/cli.mjs scripts/gen-evidence.ts"
call :run "demo-e2e" "node node_modules/tsx/dist/cli.mjs main.ts"

echo.
echo ============ VERIFY DONE ============
type "%LOG%"
goto :eof

:run
echo ================================================== >> "%LOG%"
echo [%1]  %~2 >> "%LOG%"
echo. >> "%LOG%"
%~2 >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo [%1] exit=%errorlevel% >> "%LOG%"
echo. >> "%LOG%"
goto :eof
