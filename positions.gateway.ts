import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * PositionsGateway
 * ------------------------------------------------------------------
 * Emite cada posición nueva al room `unit:<imei>` (o `route:<routeId>`
 * si preferís agrupar por ruta — cambiá el nombre del room según cómo
 * esté armada la app del pasajero). Si ya tenés un Gateway propio,
 * borrá este archivo y usá el tuyo — Gt06Service solo necesita
 * `gateway.broadcastPosition(position)`.
 * ------------------------------------------------------------------
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class PositionsGateway {
  @WebSocketServer()
  server: Server;

  broadcastPosition(position: { imei: string } & object) {
    this.server.to(`unit:${position.imei}`).emit('position', position);
  }
}
