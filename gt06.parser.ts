/**
 * gt06.parser.ts
 * ------------------------------------------------------------------
 * Puerto a TypeScript del gt06.js original — misma lógica, mismos
 * nombres de función, cero cambios de comportamiento. Se mantiene
 * puro (sin dependencias de NestJS/red/DB) para poder testearlo igual
 * que antes.
 * ------------------------------------------------------------------
 */

const START_BIT = Buffer.from([0x78, 0x78]);
const STOP_BIT = Buffer.from([0x0d, 0x0a]);

export const PROTOCOL = {
  LOGIN: 0x01,
  LOCATION: 0x12,
  LOCATION_LBS: 0x22,
  HEARTBEAT: 0x13,
} as const;

export interface ParsedBase {
  protocolNo: number;
  protocolHex: string;
  serialNo: number;
  crcOk: boolean;
  raw: string;
}

export interface ParsedLogin extends ParsedBase {
  type: 'login';
  imei: string;
}

export interface ParsedLocation extends ParsedBase {
  type: 'location';
  timestamp: string;
  satellites: number;
  latitude: number;
  longitude: number;
  speedKmh: number;
  course: number;
  gpsPositioned: boolean;
}

export interface ParsedHeartbeat extends ParsedBase {
  type: 'heartbeat';
  status: string;
}

export interface ParsedUnknown extends ParsedBase {
  type: 'unknown';
}

export type ParsedPacket = ParsedLogin | ParsedLocation | ParsedHeartbeat | ParsedUnknown;

/** CRC-ITU (CRC-16/X-25), igual que en el original. */
export function crc16itu(buf: Buffer): number {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0x8408;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return ~crc & 0xffff;
}

export function extractFrame(buffer: Buffer): { frame: Buffer; rest: Buffer } | null {
  const start = buffer.indexOf(START_BIT);
  if (start === -1) return null;
  if (buffer.length < start + 3) return null;

  const length = buffer[start + 2];
  const frameEnd = start + 3 + length + 2;
  if (buffer.length < frameEnd) return null;

  const frame = buffer.slice(start, frameEnd);
  const rest = buffer.slice(frameEnd);
  return { frame, rest };
}

export function parseFrame(frame: Buffer): ParsedPacket {
  const length = frame[2];
  const protocolNo = frame[3];
  const dataEnd = 3 + length - 2 - 2;
  const data = frame.slice(4, dataEnd);
  const serialNo = frame.readUInt16BE(dataEnd);
  const crcReceived = frame.readUInt16BE(dataEnd + 2);

  const crcCalculated = crc16itu(frame.slice(2, dataEnd + 2));
  const crcOk = crcReceived === crcCalculated;

  const base: ParsedBase = {
    protocolNo,
    protocolHex: '0x' + protocolNo.toString(16).padStart(2, '0'),
    serialNo,
    crcOk,
    raw: frame.toString('hex'),
  };

  switch (protocolNo) {
    case PROTOCOL.LOGIN:
      return { ...base, type: 'login', imei: parseImei(data) };

    case PROTOCOL.LOCATION:
    case PROTOCOL.LOCATION_LBS:
      return { ...base, type: 'location', ...parseLocation(data) };

    case PROTOCOL.HEARTBEAT:
      return { ...base, type: 'heartbeat', status: data.toString('hex') };

    default:
      return { ...base, type: 'unknown' };
  }
}

function parseImei(data: Buffer): string {
  let imei = '';
  for (let i = 0; i < data.length; i++) {
    imei += data[i].toString(16).padStart(2, '0');
  }
  return imei.replace(/^0/, '').slice(0, 15);
}

function parseLocation(data: Buffer) {
  let offset = 0;

  const year = 2000 + data[offset++];
  const month = data[offset++];
  const day = data[offset++];
  const hour = data[offset++];
  const minute = data[offset++];
  const second = data[offset++];
  const timestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  const gpsInfo = data[offset++];
  const satellites = gpsInfo & 0x0f;

  const rawLat = data.readUInt32BE(offset);
  offset += 4;
  const rawLon = data.readUInt32BE(offset);
  offset += 4;
  const speed = data[offset++];

  const courseStatus = data.readUInt16BE(offset);
  offset += 2;
  const course = courseStatus & 0x03ff;
  const isNorth = !!(courseStatus & 0x0400);
  const isEast = !!(courseStatus & 0x0800);
  const gpsPositioned = !!(courseStatus & 0x1000);

  let latitude = rawLat / 30000 / 60;
  let longitude = rawLon / 30000 / 60;
  if (!isNorth) latitude = -latitude;
  if (!isEast) longitude = -longitude;

  return {
    timestamp: timestamp.toISOString(),
    satellites,
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    speedKmh: speed,
    course,
    gpsPositioned,
  };
}

/** Arma el ACK que hay que devolverle al dispositivo (login/heartbeat/ubicación). */
export function buildAck(protocolNo: number, serialNo: number): Buffer {
  const length = 5;
  const body = Buffer.alloc(1 + 2);
  body[0] = protocolNo;
  body.writeUInt16BE(serialNo, 1);

  const lengthByte = Buffer.from([length]);
  const forCrc = Buffer.concat([lengthByte, body]);
  const crc = crc16itu(forCrc);

  const crcBuf = Buffer.alloc(2);
  crcBuf.writeUInt16BE(crc, 0);

  return Buffer.concat([START_BIT, lengthByte, body, crcBuf, STOP_BIT]);
}
