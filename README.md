# Yule Love Lights — Design Tool

Internal tool for designing Christmas and permanent light installations on customer home photos.

## Stack

- **client/** Vite + TypeScript + Konva.js
- **server/** Fastify + better-sqlite3 + filesystem photo storage
- Single shared password (env var `APP_PASSWORD`).

## Dev

```powershell
$env:Path = "$env:ProgramFiles\nodejs;$env:Path"
npm install
$env:APP_PASSWORD = "changeme"
npm run dev
```

Client runs on http://localhost:5173, server on http://localhost:3000. Vite proxies `/api` and `/photos` to the server.

## Production

```powershell
npm run build
$env:APP_PASSWORD = "your-real-password"
$env:SESSION_SECRET = "a-long-random-string-at-least-32-chars"
npm start
```

Server serves the built client and the API on port 3000.
