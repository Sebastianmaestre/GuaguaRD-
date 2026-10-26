"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var Gt06Service_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gt06Service = void 0;
const common_1 = require("@nestjs/common");
const net = __importStar(require("net"));
const gt06_parser_1 = require("./gt06.parser");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
const positions_gateway_1 = require("../positions/positions.gateway");
let Gt06Service = Gt06Service_1 = class Gt06Service {
    constructor(prisma, redis, gateway) {
        this.prisma = prisma;
        this.redis = redis;
        this.gateway = gateway;
        this.logger = new common_1.Logger(Gt06Service_1.name);
        this.buffers = new WeakMap();
        this.sessions = new WeakMap();
        this.unitCache = new Map();
        this.UNIT_CACHE_TTL_MS = 60_000;
    }
    onModuleInit() {
        const port = Number(process.env.GT06_PORT) || 5023;
        this.server = net.createServer((socket) => {
            const remote = `${socket.remoteAddress}:${socket.remotePort}`;
            this.logger.log(`conexión nueva desde ${remote}`);
            this.buffers.set(socket, Buffer.alloc(0));
            socket.on('data', (chunk) => {
                let buffer = Buffer.concat([this.buffers.get(socket) ?? Buffer.alloc(0), chunk]);
                let extracted;
                while ((extracted = (0, gt06_parser_1.extractFrame)(buffer)) !== null) {
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
    handleFrame(socket, frame) {
        const packet = (0, gt06_parser_1.parseFrame)(frame);
        if (!packet.crcOk) {
            this.logger.warn(`CRC inválido, se descarta el paquete: ${packet.raw}`);
            return;
        }
        switch (packet.type) {
            case 'login': {
                this.sessions.set(socket, packet.imei);
                this.logger.log(`LOGIN de unidad ${packet.imei}`);
                socket.write((0, gt06_parser_1.buildAck)(packet.protocolNo, packet.serialNo));
                break;
            }
            case 'heartbeat': {
                const imei = this.sessions.get(socket) || 'desconocida';
                this.logger.log(`HEARTBEAT de unidad ${imei}`);
                socket.write((0, gt06_parser_1.buildAck)(packet.protocolNo, packet.serialNo));
                break;
            }
            case 'location': {
                const imei = this.sessions.get(socket) || 'desconocida';
                const position = {
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
                void this.saveToRedis(position);
                void this.saveToPostgres(position);
                this.broadcastViaWebSocket(position);
                socket.write((0, gt06_parser_1.buildAck)(packet.protocolNo, packet.serialNo));
                break;
            }
            default:
                this.logger.debug(`paquete no manejado: ${packet.protocolHex}`);
        }
    }
    async saveToRedis(position) {
        try {
            await this.redis.setLastPosition(position.imei, position);
        }
        catch (err) {
            this.logger.error(`error guardando en Redis: ${err.message}`);
        }
    }
    async saveToPostgres(position) {
        try {
            const unit = await this.resolveUnit(position.imei);
            if (!unit) {
                this.logger.warn(`IMEI ${position.imei} no está registrado como unidad — se guarda sin unitId/companyId`);
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
        }
        catch (err) {
            this.logger.error(`error guardando en Postgres: ${err.message}`);
        }
    }
    async resolveUnit(imei) {
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
    broadcastViaWebSocket(position) {
        try {
            this.gateway.broadcastPosition(position);
        }
        catch (err) {
            this.logger.error(`error publicando por WebSocket: ${err.message}`);
        }
    }
};
exports.Gt06Service = Gt06Service;
exports.Gt06Service = Gt06Service = Gt06Service_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        positions_gateway_1.PositionsGateway])
], Gt06Service);
//# sourceMappingURL=gt06.service.js.map