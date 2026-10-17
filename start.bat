@echo off
if "%MCP_AUTH_TOKEN%"=="" (
  echo MCP_AUTH_TOKEN is required to start the MCP server.
  echo Set it in this terminal first, then run start.bat again.
  echo Example: set MCP_AUTH_TOKEN=your-random-token-at-least-16-chars
  pause
  exit /b 1
)
echo Starting MY-PI-WEB (Web + authenticated MCP)...
start "MY-PI-WEB Web" cmd /k npm run dev
start "MY-PI-WEB MCP" cmd /k npm run dev:mcp
echo.
echo ? Web: http://localhost:30141
echo ? MCP: http://localhost:30142/sse
pause
