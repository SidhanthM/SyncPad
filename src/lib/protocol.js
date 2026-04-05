export const MSG_STROKE_BEGIN = 0x01;
export const MSG_STROKE_POINT = 0x02;
export const MSG_STROKE_END = 0x03;
export const MSG_STROKE_ERASE = 0x04;
export const MSG_VIEWPORT_UPDATE = 0x10;
export const MSG_PAGE_CHANGE = 0x20;
export const MSG_UNDO = 0x30;
export const MSG_REDO = 0x31;
export const MSG_FULL_SYNC = 0x40;
export const MSG_PAIR_REQUEST = 0x50;
export const MSG_PAIR_ACCEPT = 0x51;
export const MSG_PING = 0xF0;
export const MSG_PONG = 0xF1;

export function encodeStrokeBegin(strokeId, color, size, tool) {
  const buf = new ArrayBuffer(5 + 13);
  const view = new DataView(buf);
  view.setUint8(0, MSG_STROKE_BEGIN);
  view.setUint32(1, 13, true);
  view.setUint32(5, strokeId, true);
  view.setUint32(9, color, true);
  view.setFloat32(13, size, true);
  view.setUint8(17, tool);
  return buf;
}

export function encodeStrokePoint(strokeId, x, y, pressure, tiltX, tiltY, timestamp) {
  const buf = new ArrayBuffer(5 + 28);
  const view = new DataView(buf);
  view.setUint8(0, MSG_STROKE_POINT);
  view.setUint32(1, 28, true);
  view.setUint32(5, strokeId, true);
  view.setFloat32(9, x, true);
  view.setFloat32(13, y, true);
  view.setFloat32(17, pressure, true);
  view.setFloat32(21, tiltX, true);
  view.setFloat32(25, tiltY, true);
  view.setUint32(29, timestamp, true);
  return buf;
}

export function encodeStrokeEnd(strokeId) {
  const buf = new ArrayBuffer(5 + 4);
  const view = new DataView(buf);
  view.setUint8(0, MSG_STROKE_END);
  view.setUint32(1, 4, true);
  view.setUint32(5, strokeId, true);
  return buf;
}

export function encodeStrokeErase(strokeId) {
  const buf = new ArrayBuffer(5 + 4);
  const view = new DataView(buf);
  view.setUint8(0, MSG_STROKE_ERASE);
  view.setUint32(1, 4, true);
  view.setUint32(5, strokeId, true);
  return buf;
}

export function encodeViewportUpdate(x, y, width, height) {
  const buf = new ArrayBuffer(5 + 16);
  const view = new DataView(buf);
  view.setUint8(0, MSG_VIEWPORT_UPDATE);
  view.setUint32(1, 16, true);
  view.setFloat32(5, x, true);
  view.setFloat32(9, y, true);
  view.setFloat32(13, width, true);
  view.setFloat32(17, height, true);
  return buf;
}

export function encodePageChange(pageIndex) {
  const buf = new ArrayBuffer(5 + 4);
  const view = new DataView(buf);
  view.setUint8(0, MSG_PAGE_CHANGE);
  view.setUint32(1, 4, true);
  view.setUint32(5, pageIndex, true);
  return buf;
}

export function encodeUndo() {
  const buf = new ArrayBuffer(5);
  const view = new DataView(buf);
  view.setUint8(0, MSG_UNDO);
  view.setUint32(1, 0, true);
  return buf;
}

export function encodeRedo() {
  const buf = new ArrayBuffer(5);
  const view = new DataView(buf);
  view.setUint8(0, MSG_REDO);
  view.setUint32(1, 0, true);
  return buf;
}

export function encodePing(timestamp) {
  const buf = new ArrayBuffer(5 + 8);
  const view = new DataView(buf);
  view.setUint8(0, MSG_PING);
  view.setUint32(1, 8, true);
  view.setBigUint64(5, BigInt(timestamp), true);
  return buf;
}

export function encodePong(timestamp) {
  const buf = new ArrayBuffer(5 + 8);
  const view = new DataView(buf);
  view.setUint8(0, MSG_PONG);
  view.setUint32(1, 8, true);
  view.setBigUint64(5, BigInt(timestamp), true);
  return buf;
}

export function decodeMessage(buf) {
  const view = new DataView(buf);
  const type = view.getUint8(0);
  const length = view.getUint32(1, true);

  switch (type) {
    case MSG_STROKE_BEGIN:
      return {
        type: "StrokeBegin",
        strokeId: view.getUint32(5, true),
        color: view.getUint32(9, true),
        size: view.getFloat32(13, true),
        tool: view.getUint8(17),
      };
    case MSG_STROKE_POINT:
      return {
        type: "StrokePoint",
        strokeId: view.getUint32(5, true),
        x: view.getFloat32(9, true),
        y: view.getFloat32(13, true),
        pressure: view.getFloat32(17, true),
        tiltX: view.getFloat32(21, true),
        tiltY: view.getFloat32(25, true),
        timestamp: view.getUint32(29, true),
      };
    case MSG_STROKE_END:
      return {
        type: "StrokeEnd",
        strokeId: view.getUint32(5, true),
      };
    case MSG_STROKE_ERASE:
      return {
        type: "StrokeErase",
        strokeId: view.getUint32(5, true),
      };
    case MSG_VIEWPORT_UPDATE:
      return {
        type: "ViewportUpdate",
        x: view.getFloat32(5, true),
        y: view.getFloat32(9, true),
        width: view.getFloat32(13, true),
        height: view.getFloat32(17, true),
      };
    case MSG_PAGE_CHANGE:
      return {
        type: "PageChange",
        pageIndex: view.getUint32(5, true),
      };
    case MSG_UNDO:
      return { type: "Undo" };
    case MSG_REDO:
      return { type: "Redo" };
    case MSG_PING:
      return {
        type: "Ping",
        timestamp: Number(view.getBigUint64(5, true)),
      };
    case MSG_PONG:
      return {
        type: "Pong",
        timestamp: Number(view.getBigUint64(5, true)),
      };
    case MSG_FULL_SYNC:
      return {
        type: "FullSync",
        payload: buf.slice(5, 5 + length),
      };
    case MSG_PAIR_REQUEST:
      return {
        type: "PairRequest",
        payload: buf.slice(5, 5 + length),
      };
    case MSG_PAIR_ACCEPT:
      return {
        type: "PairAccept",
        payload: buf.slice(5, 5 + length),
      };
    default:
      return { type: "Unknown", rawType: type, length };
  }
}

