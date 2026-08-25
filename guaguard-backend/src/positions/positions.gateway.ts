import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * PositionsGateway
 * ------------------------------------------------------------------
 * Emite cada posición nueva al room `unit:<imei>` (o `route:<routeId>`
 * si preferís agrupar por ruta — cambiá el nombre del room según cómo
 * esté armada la app del pasajero). Si ya tenés un Gateway propio,
 * borrá este archivo y usá el tuyo — Gt06Service solo necesita
 * `gateway.broadcastPosition(position)`.
 *
 * El cliente (browser) se suscribe emitiendo 'subscribe' con el IMEI
 * que quiere seguir. Sin esto, el cliente nunca entra al room y no
 * recibe nada aunque el servidor esté emitiendo.
 * ------------------------------------------------------------------
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class PositionsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() imei: string) {
    client.join(`unit:${imei}`);
    client.emit('subscribed', { imei });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() imei: string) {
    client.leave(`unit:${imei}`);
  }

  broadcastPosition(position: { imei: string } & object) {
    this.server.to(`unit:${position.imei}`).emit('position', position);
  }
}
