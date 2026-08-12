# Integración GT06 → NestJS (Redis + Postgres + WebSockets)

Esto conecta los 3 puntos que quedaron marcados con `TODO` en tu
`server.js` original con implementaciones reales, dentro del ciclo de
vida de NestJS. El parser (`gt06.js`) se portó a TypeScript sin tocar
la lógica — mismo cálculo de CRC, mismo parseo de IMEI/ubicación.

## Estructura

```
src/
  gt06/
    gt06.parser.ts     # el parser puro, portado de gt06.js (sin cambios de lógica)
    gt06.service.ts     # levanta el servidor TCP (OnModuleInit) y llama a Prisma/Redis/Gateway
    gt06.module.ts       # junta todo para importar en el AppModule
  prisma/
    prisma.service.ts    # estándar — borrar si ya tenés uno
  redis/
    redis.service.ts     # última posición conocida (ioredis) — borrar si ya tenés uno
  positions/
    positions.gateway.ts # WebSocket gateway (Socket.io) — borrar si ya tenés uno
prisma/
  schema.gt06.prisma     # modelo PositionHistory para pegar en tu schema.prisma
.env.example
```

## Cómo integrarlo a tu backend real

1. Copiá la carpeta `src/gt06`, y `src/prisma`/`src/redis`/`src/positions`
   **solo si no tenés ya tus propios services/gateway** — si ya existen,
   usá los tuyos y en `gt06.module.ts` sacá los providers duplicados
   (Nest los resuelve igual mientras estén exportados desde su módulo).
2. Agregá el modelo `PositionHistory` de `prisma/schema.gt06.prisma` a
   tu `schema.prisma` y corré la migración.
3. Importá `Gt06Module` en tu `AppModule`.
4. Copiá `.env.example` → `.env` y completá `GT06_PORT`, `REDIS_URL`,
   `DATABASE_URL`.
5. `npm run start:dev` — el servidor TCP arranca solo al iniciar Nest
   (vía `OnModuleInit`), sin proceso aparte.

## Qué falta resolver (según el checklist del documento)

- **Resolver `companyId`/`unitId` real a partir del IMEI** en
  `saveToPostgres` — quedó un TODO puntual ahí mismo, porque depende
  de cómo tengas modeladas las unidades en tu esquema.
- **Room del WebSocket**: `PositionsGateway` emite a `unit:<imei>`.
  Si la app del pasajero se suscribe por ruta (`route:<routeId>`) en
  vez de por unidad, cambiá esa línea.
- **Dispositivo real vs. simulador**: `simulator.js` no se tocó —
  sigue sirviendo igual para probar contra este mismo servidor
  (apuntando a `GT06_PORT`).
- Todo lo demás del punto 2 del documento (confirmar IP/puerto con
  Michael, ficha técnica del modelo, IMEI real) sigue siendo un paso
  manual, no de código.

## Testear sin hardware

```bash
npm run start:dev          # levanta Nest (y con él, el server TCP)
node simulator.js          # en otra terminal, con GT06_PORT=5023 si cambiaste el puerto
```

Vas a ver en los logs de Nest cada LOGIN/HEARTBEAT/POSICIÓN, y ahora
además queda guardado en Redis, en Postgres, y publicado por
WebSocket — los 3 puntos que antes eran stubs.
