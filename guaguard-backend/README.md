# GuaguaRD Backend — GT06 → NestJS (Redis + Postgres + WebSockets)

Proyecto completo y ejecutable. Pensado para correr en **GitHub
Codespaces** desde el Chromebook, sin instalar nada local.

## 0. Subir esto a GitHub

Si ya tenés el repo `GuaguaRD-` con los archivos sueltos, borrá todo
y subí esta carpeta completa en su lugar (o creá un repo nuevo,
como prefieras). Estructura esperada en la raíz del repo:

```
guaguard-backend/
  package.json
  docker-compose.yml
  prisma/schema.prisma
  src/...
  simulator.js
```

## 1. Abrir Codespaces

1. Entrá al repo en GitHub (desde Chrome, sirve en el Chromebook).
2. Botón verde **`<> Code`** → pestaña **Codespaces** → **Create
   codespace on main**.
3. Esperá ~1 minuto a que arranque un VS Code completo en el navegador.

## 2. Levantar Redis y Postgres

En la terminal del Codespace (`Terminal` → `New Terminal`):

```bash
docker compose up -d
```

Esto levanta Postgres y Redis en segundo plano. Confirmá con:

```bash
docker compose ps
```

## 3. Instalar dependencias y preparar el entorno

```bash
npm install
cp .env.example .env
npx prisma migrate dev --name init
```

Ese último comando crea las tablas (`Company`, `Unit`,
`PositionHistory`) en el Postgres que acabás de levantar.

## 4. Levantar el backend

```bash
npm run start:dev
```

Deberías ver: `GuaguaRD backend arriba en http://localhost:3000` y
`servidor TCP GT06 escuchando en el puerto 5023`.

## 5. Probar sin hardware (simulador)

En **otra terminal** del mismo Codespace (ícono `+` al lado de la
terminal):

```bash
npm run simulator
```

Vas a ver en los logs de Nest: `LOGIN de unidad ...` y después
`POSICIÓN {...}` cada 5 segundos.

## 6. Exponer el puerto para la demo del navegador

Codespaces expone puertos automático. Andá a la pestaña **`PORTS`**
(al lado de la Terminal), buscá el puerto `3000`, click derecho →
**Port Visibility → Public**. Copiá la URL que te da (algo como
`https://tu-codespace-3000.app.github.dev`).

Esa URL es la que ponés en el campo "URL del servidor" de
`guaguard-demo-live.html`, con el IMEI `868765432109123` (el que usa
el simulador por defecto). Deberías ver la unidad moviéndose en el
mapa.

## 7. Conectar el GPS real

Cuando tengas el dispositivo físico:
- Anotá el **IMEI real** grabado en el equipo.
- Configurá el dispositivo (según su manual/proveedor) para que
  apunte al **IP público del Codespace + puerto 5023** — el puerto
  TCP también hay que exponerlo igual que el 3000, o usar un túnel
  si el dispositivo no permite hostnames largos.
- En la demo, poné ese IMEI real en vez del de prueba.

## Qué falta resolver

- `unitId`/`companyId` en `saveToPostgres()` ya resuelven por IMEI
  contra las tablas `Unit`/`Company` — pero esos modelos son un
  placeholder mínimo (ver nota en `prisma/schema.prisma`). Ajustalos
  cuando definas con Michael cómo se modelan de verdad.
- Sala del WebSocket: `PositionsGateway` emite/suscribe por
  `unit:<imei>`. Si la app del pasajero se agrupa por ruta en vez de
  por unidad, cambiar esa convención.
