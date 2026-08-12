import { Module } from '@nestjs/common';
import { Gt06Service } from './gt06.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PositionsGateway } from '../positions/positions.gateway';

/**
 * Gt06Module
 * ------------------------------------------------------------------
 * Importar este módulo en el AppModule del backend real. Si
 * PrismaService/RedisService/PositionsGateway ya existen como
 * módulos globales en tu proyecto, sacalos de acá y solo dejá
 * Gt06Service — Nest los va a inyectar igual mientras estén
 * exportados desde donde vivan.
 * ------------------------------------------------------------------
 */
@Module({
  providers: [Gt06Service, PrismaService, RedisService, PositionsGateway],
})
export class Gt06Module {}
