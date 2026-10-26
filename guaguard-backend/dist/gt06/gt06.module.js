"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gt06Module = void 0;
const common_1 = require("@nestjs/common");
const gt06_service_1 = require("./gt06.service");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
const positions_gateway_1 = require("../positions/positions.gateway");
let Gt06Module = class Gt06Module {
};
exports.Gt06Module = Gt06Module;
exports.Gt06Module = Gt06Module = __decorate([
    (0, common_1.Module)({
        providers: [gt06_service_1.Gt06Service, prisma_service_1.PrismaService, redis_service_1.RedisService, positions_gateway_1.PositionsGateway],
    })
], Gt06Module);
//# sourceMappingURL=gt06.module.js.map