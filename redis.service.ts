import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * RedisService
 * ------------------------------------------------------------------
 * Guarda la "última posición conocida" por unidad (imei). Si ya tenés
 * un RedisService propio en el backend, borrá este archivo y usá el
 * tuyo — Gt06Service solo necesita el método `setLastPosition`.
 * ------------------------------------------------------------------
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.client.on('error', (err) => this.logger.error(`Error de conexión a Redis: ${err.message}`));
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }

  /** Última posición conocida por unidad, con TTL para no acumular basura si la unidad deja de reportar. */
  async setLastPosition(imei: string, position: object, ttlSeconds = 3600): Promise<void> {
    await this.client.set(`unit:${imei}:last`, JSON.stringify(position), 'EX', ttlSeconds);
  }

  async getLastPosition(imei: string): Promise<Record<string, unknown> | null> {
    const raw = await this.client.get(`unit:${imei}:last`);
    return raw ? JSON.parse(raw) : null;
  }
}
