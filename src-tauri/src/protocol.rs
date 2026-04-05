use anyhow::{anyhow, Result};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use std::io::{Cursor, Read, Write};

#[derive(Debug, Clone, PartialEq)]
pub enum Message {
    StrokeBegin(StrokeBegin),
    StrokePoint(StrokePoint),
    StrokeEnd(StrokeEnd),
    StrokeErase(StrokeErase),
    ViewportUpdate(ViewportUpdate),
    PageChange(PageChange),
    Undo,
    Redo,
    FullSync(Vec<u8>),    // Placeholder for msgpack payload
    PairRequest(Vec<u8>), // Placeholder for msgpack payload
    PairAccept(Vec<u8>),  // Placeholder for msgpack payload
    Ping(Ping),
    Pong(Pong),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StrokeBegin {
    pub stroke_id: u32,
    pub color: u32,
    pub size: f32,
    pub tool: u8,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StrokePoint {
    pub stroke_id: u32,
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
    pub tilt_x: f32,
    pub tilt_y: f32,
    pub timestamp: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StrokeEnd {
    pub stroke_id: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StrokeErase {
    pub stroke_id: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ViewportUpdate {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PageChange {
    pub page_index: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ping {
    pub timestamp: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pong {
    pub timestamp: u64,
}

pub const MSG_STROKE_BEGIN: u8 = 0x01;
pub const MSG_STROKE_POINT: u8 = 0x02;
pub const MSG_STROKE_END: u8 = 0x03;
pub const MSG_STROKE_ERASE: u8 = 0x04;
pub const MSG_VIEWPORT_UPDATE: u8 = 0x10;
pub const MSG_PAGE_CHANGE: u8 = 0x20;
pub const MSG_UNDO: u8 = 0x30;
pub const MSG_REDO: u8 = 0x31;
pub const MSG_FULL_SYNC: u8 = 0x40;
pub const MSG_PAIR_REQUEST: u8 = 0x50;
pub const MSG_PAIR_ACCEPT: u8 = 0x51;
pub const MSG_PING: u8 = 0xF0;
pub const MSG_PONG: u8 = 0xF1;

impl Message {
    pub fn encode(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        match self {
            Message::StrokeBegin(s) => {
                buf.write_u8(MSG_STROKE_BEGIN)?;
                buf.write_u32::<LittleEndian>(13)?; // length
                buf.write_u32::<LittleEndian>(s.stroke_id)?;
                buf.write_u32::<LittleEndian>(s.color)?;
                buf.write_f32::<LittleEndian>(s.size)?;
                buf.write_u8(s.tool)?;
            }
            Message::StrokePoint(s) => {
                buf.write_u8(MSG_STROKE_POINT)?;
                buf.write_u32::<LittleEndian>(28)?; // length
                buf.write_u32::<LittleEndian>(s.stroke_id)?;
                buf.write_f32::<LittleEndian>(s.x)?;
                buf.write_f32::<LittleEndian>(s.y)?;
                buf.write_f32::<LittleEndian>(s.pressure)?;
                buf.write_f32::<LittleEndian>(s.tilt_x)?;
                buf.write_f32::<LittleEndian>(s.tilt_y)?;
                buf.write_u32::<LittleEndian>(s.timestamp)?;
            }
            Message::StrokeEnd(s) => {
                buf.write_u8(MSG_STROKE_END)?;
                buf.write_u32::<LittleEndian>(4)?; // length
                buf.write_u32::<LittleEndian>(s.stroke_id)?;
            }
            Message::StrokeErase(s) => {
                buf.write_u8(MSG_STROKE_ERASE)?;
                buf.write_u32::<LittleEndian>(4)?; // length
                buf.write_u32::<LittleEndian>(s.stroke_id)?;
            }
            Message::ViewportUpdate(v) => {
                buf.write_u8(MSG_VIEWPORT_UPDATE)?;
                buf.write_u32::<LittleEndian>(16)?; // length
                buf.write_f32::<LittleEndian>(v.x)?;
                buf.write_f32::<LittleEndian>(v.y)?;
                buf.write_f32::<LittleEndian>(v.width)?;
                buf.write_f32::<LittleEndian>(v.height)?;
            }
            Message::PageChange(p) => {
                buf.write_u8(MSG_PAGE_CHANGE)?;
                buf.write_u32::<LittleEndian>(4)?; // length
                buf.write_u32::<LittleEndian>(p.page_index)?;
            }
            Message::Undo => {
                buf.write_u8(MSG_UNDO)?;
                buf.write_u32::<LittleEndian>(0)?; // length
            }
            Message::Redo => {
                buf.write_u8(MSG_REDO)?;
                buf.write_u32::<LittleEndian>(0)?; // length
            }
            Message::FullSync(payload) => {
                buf.write_u8(MSG_FULL_SYNC)?;
                buf.write_u32::<LittleEndian>(payload.len() as u32)?;
                buf.write_all(payload)?;
            }
            Message::PairRequest(payload) => {
                buf.write_u8(MSG_PAIR_REQUEST)?;
                buf.write_u32::<LittleEndian>(payload.len() as u32)?;
                buf.write_all(payload)?;
            }
            Message::PairAccept(payload) => {
                buf.write_u8(MSG_PAIR_ACCEPT)?;
                buf.write_u32::<LittleEndian>(payload.len() as u32)?;
                buf.write_all(payload)?;
            }
            Message::Ping(p) => {
                buf.write_u8(MSG_PING)?;
                buf.write_u32::<LittleEndian>(8)?; // length
                buf.write_u64::<LittleEndian>(p.timestamp)?;
            }
            Message::Pong(p) => {
                buf.write_u8(MSG_PONG)?;
                buf.write_u32::<LittleEndian>(8)?; // length
                buf.write_u64::<LittleEndian>(p.timestamp)?;
            }
        }
        Ok(buf)
    }

    pub fn decode(buf: &[u8]) -> Result<Self> {
        let mut cursor = Cursor::new(buf);
        let msg_type = cursor.read_u8()?;
        let length = cursor.read_u32::<LittleEndian>()? as usize;

        let payload_start = cursor.position() as usize;
        let payload_end = payload_start + length;

        if payload_end > buf.len() {
            return Err(anyhow!(
                "Malformed frame: payload extends beyond buffer limits"
            ));
        }

        match msg_type {
            MSG_STROKE_BEGIN => {
                if length != 13 {
                    return Err(anyhow!("Malformed StrokeBegin: invalid length"));
                }
                Ok(Message::StrokeBegin(StrokeBegin {
                    stroke_id: cursor.read_u32::<LittleEndian>()?,
                    color: cursor.read_u32::<LittleEndian>()?,
                    size: cursor.read_f32::<LittleEndian>()?,
                    tool: cursor.read_u8()?,
                }))
            }
            MSG_STROKE_POINT => {
                if length != 28 {
                    return Err(anyhow!("Malformed StrokePoint: invalid length"));
                }
                Ok(Message::StrokePoint(StrokePoint {
                    stroke_id: cursor.read_u32::<LittleEndian>()?,
                    x: cursor.read_f32::<LittleEndian>()?,
                    y: cursor.read_f32::<LittleEndian>()?,
                    pressure: cursor.read_f32::<LittleEndian>()?,
                    tilt_x: cursor.read_f32::<LittleEndian>()?,
                    tilt_y: cursor.read_f32::<LittleEndian>()?,
                    timestamp: cursor.read_u32::<LittleEndian>()?,
                }))
            }
            MSG_STROKE_END => {
                if length != 4 {
                    return Err(anyhow!("Malformed StrokeEnd: invalid length"));
                }
                Ok(Message::StrokeEnd(StrokeEnd {
                    stroke_id: cursor.read_u32::<LittleEndian>()?,
                }))
            }
            MSG_STROKE_ERASE => {
                if length != 4 {
                    return Err(anyhow!("Malformed StrokeErase: invalid length"));
                }
                Ok(Message::StrokeErase(StrokeErase {
                    stroke_id: cursor.read_u32::<LittleEndian>()?,
                }))
            }
            MSG_VIEWPORT_UPDATE => {
                if length != 16 {
                    return Err(anyhow!("Malformed ViewportUpdate: invalid length"));
                }
                Ok(Message::ViewportUpdate(ViewportUpdate {
                    x: cursor.read_f32::<LittleEndian>()?,
                    y: cursor.read_f32::<LittleEndian>()?,
                    width: cursor.read_f32::<LittleEndian>()?,
                    height: cursor.read_f32::<LittleEndian>()?,
                }))
            }
            MSG_PAGE_CHANGE => {
                if length != 4 {
                    return Err(anyhow!("Malformed PageChange: invalid length"));
                }
                Ok(Message::PageChange(PageChange {
                    page_index: cursor.read_u32::<LittleEndian>()?,
                }))
            }
            MSG_UNDO => {
                if length != 0 {
                    return Err(anyhow!("Malformed Undo: invalid length"));
                }
                Ok(Message::Undo)
            }
            MSG_REDO => {
                if length != 0 {
                    return Err(anyhow!("Malformed Redo: invalid length"));
                }
                Ok(Message::Redo)
            }
            MSG_FULL_SYNC => {
                let mut payload = vec![0; length];
                cursor.read_exact(&mut payload)?;
                Ok(Message::FullSync(payload))
            }
            MSG_PAIR_REQUEST => {
                let mut payload = vec![0; length];
                cursor.read_exact(&mut payload)?;
                Ok(Message::PairRequest(payload))
            }
            MSG_PAIR_ACCEPT => {
                let mut payload = vec![0; length];
                cursor.read_exact(&mut payload)?;
                Ok(Message::PairAccept(payload))
            }
            MSG_PING => {
                if length != 8 {
                    return Err(anyhow!("Malformed Ping: invalid length"));
                }
                Ok(Message::Ping(Ping {
                    timestamp: cursor.read_u64::<LittleEndian>()?,
                }))
            }
            MSG_PONG => {
                if length != 8 {
                    return Err(anyhow!("Malformed Pong: invalid length"));
                }
                Ok(Message::Pong(Pong {
                    timestamp: cursor.read_u64::<LittleEndian>()?,
                }))
            }
            _ => Err(anyhow!("Unknown message type: 0x{:02x}", msg_type)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stroke_begin_round_trip() -> Result<()> {
        let original_msg = Message::StrokeBegin(StrokeBegin {
            stroke_id: 123,
            color: 0xFF0000FF, // Red
            size: 5.0,
            tool: 0x01, // Pen
        });
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_stroke_point_round_trip() -> Result<()> {
        let original_msg = Message::StrokePoint(StrokePoint {
            stroke_id: 123,
            x: 10.5,
            y: 20.1,
            pressure: 0.75,
            tilt_x: 45.0,
            tilt_y: 30.0,
            timestamp: 100,
        });
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_stroke_end_round_trip() -> Result<()> {
        let original_msg = Message::StrokeEnd(StrokeEnd { stroke_id: 123 });
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_stroke_erase_round_trip() -> Result<()> {
        let original_msg = Message::StrokeErase(StrokeErase { stroke_id: 123 });
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_viewport_update_round_trip() -> Result<()> {
        let original_msg = Message::ViewportUpdate(ViewportUpdate {
            x: 0.0,
            y: 0.0,
            width: 210.0,
            height: 297.0,
        });
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_page_change_round_trip() -> Result<()> {
        let original_msg = Message::PageChange(PageChange { page_index: 5 });
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_undo_round_trip() -> Result<()> {
        let original_msg = Message::Undo;
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_redo_round_trip() -> Result<()> {
        let original_msg = Message::Redo;
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_ping_round_trip() -> Result<()> {
        let original_msg = Message::Ping(Ping {
            timestamp: 1678886400000,
        });
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_pong_round_trip() -> Result<()> {
        let original_msg = Message::Pong(Pong {
            timestamp: 1678886400001,
        });
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_full_sync_round_trip() -> Result<()> {
        let payload = vec![0x01, 0x02, 0x03, 0x04];
        let original_msg = Message::FullSync(payload.clone());
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_pair_request_round_trip() -> Result<()> {
        let payload = vec![0x05, 0x06, 0x07, 0x08];
        let original_msg = Message::PairRequest(payload.clone());
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_pair_accept_round_trip() -> Result<()> {
        let payload = vec![0x09, 0x0A, 0x0B, 0x0C];
        let original_msg = Message::PairAccept(payload.clone());
        let encoded = original_msg.encode()?;
        let decoded_msg = Message::decode(&encoded)?;
        assert_eq!(original_msg, decoded_msg);
        Ok(())
    }

    #[test]
    fn test_malformed_frame_invalid_length() -> Result<()> {
        let original_msg = Message::StrokeBegin(StrokeBegin {
            stroke_id: 123,
            color: 0xFF0000FF,
            size: 5.0,
            tool: 0x01,
        });
        let mut encoded = original_msg.encode()?;
        // Tamper with the length to make it incorrect
        encoded[1] = 0x01; // Change length byte
        let result = Message::decode(&encoded);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Malformed StrokeBegin: invalid length"));
        Ok(())
    }

    #[test]
    fn test_malformed_frame_unknown_type() -> Result<()> {
        let mut buf = Vec::new();
        buf.write_u8(0xFF)?; // Unknown type
        buf.write_u32::<LittleEndian>(0)?; // Length
        let result = Message::decode(&buf);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unknown message type: 0xff"));
        Ok(())
    }
}
