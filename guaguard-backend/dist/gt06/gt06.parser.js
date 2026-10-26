"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROTOCOL = void 0;
exports.crc16itu = crc16itu;
exports.extractFrame = extractFrame;
exports.parseFrame = parseFrame;
exports.buildAck = buildAck;
const START_BIT = Buffer.from([0x78, 0x78]);
const STOP_BIT = Buffer.from([0x0d, 0x0a]);
exports.PROTOCOL = {
    LOGIN: 0x01,
    LOCATION: 0x12,
    LOCATION_LBS: 0x22,
    HEARTBEAT: 0x13,
};
function crc16itu(buf) {
    let crc = 0xffff;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0x8408;
            }
            else {
                crc = crc >> 1;
            }
        }
    }
    return ~crc & 0xffff;
}
function extractFrame(buffer) {
    const start = buffer.indexOf(START_BIT);
    if (start === -1)
        return null;
    if (buffer.length < start + 3)
        return null;
    const length = buffer[start + 2];
    const frameEnd = start + 3 + length + 2;
    if (buffer.length < frameEnd)
        return null;
    const frame = buffer.slice(start, frameEnd);
    const rest = buffer.slice(frameEnd);
    return { frame, rest };
}
function parseFrame(frame) {
    const length = frame[2];
    const protocolNo = frame[3];
    const dataEnd = 3 + length - 2 - 2;
    const data = frame.slice(4, dataEnd);
    const serialNo = frame.readUInt16BE(dataEnd);
    const crcReceived = frame.readUInt16BE(dataEnd + 2);
    const crcCalculated = crc16itu(frame.slice(2, dataEnd + 2));
    const crcOk = crcReceived === crcCalculated;
    const base = {
        protocolNo,
        protocolHex: '0x' + protocolNo.toString(16).padStart(2, '0'),
        serialNo,
        crcOk,
        raw: frame.toString('hex'),
    };
    switch (protocolNo) {
        case exports.PROTOCOL.LOGIN:
            return { ...base, type: 'login', imei: parseImei(data) };
        case exports.PROTOCOL.LOCATION:
        case exports.PROTOCOL.LOCATION_LBS:
            return { ...base, type: 'location', ...parseLocation(data) };
        case exports.PROTOCOL.HEARTBEAT:
            return { ...base, type: 'heartbeat', status: data.toString('hex') };
        default:
            return { ...base, type: 'unknown' };
    }
}
function parseImei(data) {
    let imei = '';
    for (let i = 0; i < data.length; i++) {
        imei += data[i].toString(16).padStart(2, '0');
    }
    return imei.replace(/^0/, '').slice(0, 15);
}
function parseLocation(data) {
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
    if (!isNorth)
        latitude = -latitude;
    if (!isEast)
        longitude = -longitude;
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
function buildAck(protocolNo, serialNo) {
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
//# sourceMappingURL=gt06.parser.js.map