/**
 * Simulador mínimo de un dispositivo GT06.
 * Se conecta al servidor TCP (GT06_PORT), manda un LOGIN y después
 * posiciones falsas cada 5s, moviéndose de a poquito. Sirve para
 * probar todo el flujo (Redis, Postgres, WebSocket) sin el hardware.
 *
 * Uso:
 *   node simulator.js
 *   node simulator.js 868765432109123   (IMEI custom)
 */
const net = require('net');

const PORT = Number(process.env.GT06_PORT) || 5023;
const HOST = process.env.GT06_HOST || 'localhost';
const IMEI = process.argv[2] || '868765432109123';

function crc16(buf) {
  let crc = 0xffff;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc & 0xffff;
}

function buildPacket(protocolNo, content) {
  const serial = Buffer.from([0x00, 0x01]);
  const body = Buffer.concat([Buffer.from([protocolNo]), content, serial]);
  const crcBuf = Buffer.alloc(2);
  crcBuf.writeUInt16BE(crc16(Buffer.concat([Buffer.from([body.length + 2]), body])), 0);
  return Buffer.concat([
    Buffer.from([0x78, 0x78]),
    Buffer.from([body.length + 2]),
    body,
    crcBuf,
    Buffer.from([0x0d, 0x0a]),
  ]);
}

function loginPacket(imei) {
  // Simplificado: 8 bytes BCD del IMEI + tipo de dispositivo
  const imeiBuf = Buffer.from(imei.padStart(16, '0'), 'hex');
  const typeBuf = Buffer.from([0x00, 0x01]);
  return buildPacket(0x01, Buffer.concat([imeiBuf, typeBuf]));
}

function locationPacket(lat, lng, speed) {
  const now = new Date();
  const dateBuf = Buffer.from([
    now.getUTCFullYear() - 2000,
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
  ]);
  const satellitesBuf = Buffer.from([0x0c]); // 12 satélites
  const latBuf = Buffer.alloc(4);
  latBuf.writeUInt32BE(Math.round(Math.abs(lat) * 30000 * 60), 0);
  const lngBuf = Buffer.alloc(4);
  lngBuf.writeUInt32BE(Math.round(Math.abs(lng) * 30000 * 60), 0);
  const speedBuf = Buffer.from([speed & 0xff]);
  const courseStatusBuf = Buffer.from([0x00, 0x00]); // course + flags (gps positioned bit, etc.)

  return buildPacket(
    0x22,
    Buffer.concat([dateBuf, satellitesBuf, latBuf, lngBuf, speedBuf, courseStatusBuf]),
  );
}

const socket = net.connect(PORT, HOST, () => {
  console.log(`[simulador] conectado a ${HOST}:${PORT} como IMEI ${IMEI}`);
  socket.write(loginPacket(IMEI));
});

let lat = 18.4802;
let lng = -69.9422;

socket.on('data', (data) => {
  console.log(`[simulador] ACK recibido: ${data.toString('hex')}`);
});

socket.on('connect', () => {
  setInterval(() => {
    lat += (Math.random() - 0.5) * 0.001;
    lng += (Math.random() - 0.5) * 0.001;
    const speed = Math.round(15 + Math.random() * 20);
    socket.write(locationPacket(lat, lng, speed));
    console.log(`[simulador] posición enviada: ${lat.toFixed(5)}, ${lng.toFixed(5)} @ ${speed}km/h`);
  }, 5000);
});

socket.on('error', (err) => {
  console.error(`[simulador] error de conexión: ${err.message}`);
});
