import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as net from 'net';
import { extractFrame, parseFrame, buildAck, ParsedPacket } from './gt06.parser';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PositionsGateway } from '../positions/positions.gateway';

interface Position {
  imei: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  course: number;
  satellites: number;
  timestamp: string;
  gpsPositioned: boolean;
}

/**
 * Gt06Service
 * ------------------------------------------------------------------
 * Levanta el servidor TCP GT06 embebido en el ciclo de vida de Nest
 * (OnModuleInit), tal como sugería el README del módulo original.
 * Es el mismo server.js, pero con los 3 stubs (saveToRedis,
 * saveToPostgres, broadcastViaWebSocket) reemplazados por las
 * llamadas reales a PrismaService, RedisService y PositionsGateway.
 *
 * Si preferís correrlo como proceso aparte en vez de embebido (la
 * otra opción que quedó abierta en el checklist), sacá el
 * `server.listen` de acá y dejá esta clase solo con `handleFrame`
 * expuesto para que un proceso standalone la importe.
 * ------------------------------------------------------------------
 */
@Injectable()
export class Gt06Service implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Gt06Service.name);
  private server: net.Server;
  private readonly buffers = new WeakMap<net.Socket, Buffer>();
  private readonly sessions = new WeakMap<net.Socket, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: PositionsGateway,
  ) {}

  onModuleInit() {
    const port = Number(process.env.GT06_PORT) || 5023;

    this.server = net.createServer((socket) => {
      const remote = `${socket.remoteAddress}:${socket.remotePort}`;
      this.logger.log(`conexión nueva desde ${remote}`);
      this.buffers.set(socket, Buffer.alloc(0));

      socket.on('data', (chunk: Buffer) => {
        let buffer = Buffer.concat([this.buffers.get(socket) ?? Buffer.alloc(0), chunk]);

        let extracted;
        while ((extracted = extractFrame(buffer)) !== null) {
          this.handleFrame(socket, extracted.frame);
          buffer = extracted.rest;
        }

        this.buffers.set(socket, buffer);
      });

      socket.on('close', () => {
        const imei = this.sessions.get(socket);
        this.logger.log(`conexión cerrada (${remote})${imei ? ' - unidad ' + imei : ''}`);
        this.buffers.delete(socket);
        this.sessions.delete(socket);
      });

      socket.on('error', (err) => {
        this.logger.error(`error de socket (${remote}): ${err.message}`);
      });
    });

    this.server.listen(port, () => {
      this.logger.log(`servidor TCP GT06 escuchando en el puerto ${port}`);
    });
  }

  onModuleDestroy() {
    this.server?.close();
  }

  private handleFrame(socket: net.Socket, frame: Buffer) {
    const packet: ParsedPacket = parseFrame(frame);

    if (!packet.crcOk) {
      this.logger.warn(`CRC inválido, se descarta el paquete: ${packet.raw}`);
      return;
    }

    switch (packet.type) {
      case 'login': {
        this.sessions.set(socket, packet.imei);
        this.logger.log(`LOGIN de unidad ${packet.imei}`);
        socket.write(buildAck(packet.protocolNo, packet.serialNo));
        break;
      }

      case 'heartbeat': {
        const imei = this.sessions.get(socket) || 'desconocida';
        this.logger.log(`HEARTBEAT de unidad ${imei}`);
        socket.write(buildAck(packet.protocolNo, packet.serialNo));
        break;
      }

      case 'location': {
        const imei = this.sessions.get(socket) || 'desconocida';
        const position: Position = {
          imei,
          latitude: packet.latitude,
          longitude: packet.longitude,
          speedKmh: packet.speedKmh,
          course: packet.course,
          satellites: packet.satellites,
          timestamp: packet.timestamp,
          gpsPositioned: packet.gpsPositioned,
        };
        this.logger.log(`POSICIÓN ${JSON.stringify(position)}`);

        // Los 3 puntos de conexión reales (antes stubs con TODO):
        void this.saveToRedis(position);
        void this.saveToPostgres(position);
        this.broadcastViaWebSocket(position);

        socket.write(buildAck(packet.protocolNo, packet.serialNo));
        break;
      }

      default:
        this.logger.debug(`paquete no manejado: ${packet.protocolHex}`);
    }
  }

  /** Última posición conocida por unidad, en Redis. */
  private async saveToRedis(position: Position) {
    try {
      await this.redis.setLastPosition(position.imei, position);
    } catch (err) {
      this.logger.error(`error guardando en Redis: ${(err as Error).message}`);
    }
  }

  /**
   * Historial de posiciones en Postgres vía Prisma.
   * Requiere los modelos Unit/Company/PositionHistory
   * (ver prisma/schema.gt06.prisma).
   */
  private async saveToPostgres(position: Position) {
    try {
      const unit = await this.resolveUnit(position.imei);

      if (!unit) {
        this.logger.warn(
          `IMEI ${position.imei} no está registrado como unidad — se guarda sin unitId/companyId`,
        );
      }

      await this.prisma.positionHistory.create({
        data: {
          imei: position.imei,
          unitId: unit?.id ?? null,
          companyId: unit?.companyId ?? null,
          latitude: position.latitude,
          longitude: position.longitude,
          speedKmh: position.speedKmh,
          course: position.course,
          satellites: position.satellites,
          gpsPositioned: position.gpsPositioned,
          recordedAt: new Date(position.timestamp),
        },
      });
    } catch (err) {
      this.logger.error(`error guardando en Postgres: ${(err as Error).message}`);
    }
  }

  /**
   * Resuelve la unidad (y su empresa) a partir del IMEI.
   * Cachea en memoria por 60s para no pegarle a la DB en cada
   * frame de posición (llegan cada pocos segundos por unidad).
   */
  private readonly unitCache = new Map<string, { id: string; companyId: string; cachedAt: number }>();
  private readonly UNIT_CACHE_TTL_MS = 60_000;

  private async resolveUnit(imei: string): Promise<{ id: string; companyId: string } | null> {
    const cached = this.unitCache.get(imei);
    if (cached && Date.now() - cached.cachedAt < this.UNIT_CACHE_TTL_MS) {
      return cached;
    }

    const unit = await this.prisma.unit.findUnique({
      where: { imei },
      select: { id: true, companyId: true },
    });

    if (unit) {
      this.unitCache.set(imei, { ...unit, cachedAt: Date.now() });
    }

    return unit;
  }

  /** Publica la posición para que la app del pasajero se actualice en vivo. */
  private broadcastViaWebSocket(position: Position) {
    try {
      this.gateway.broadcastPosition(position);
    } catch (err) {
      this.logger.error(`error publicando por WebSocket: ${(err as Error).message}`);
    }
  }
}
