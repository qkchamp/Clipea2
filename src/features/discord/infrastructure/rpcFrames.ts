/** Opcodes of Discord's local RPC (IPC transport). */
export const RpcOp = { handshake: 0, frame: 1, close: 2, ping: 3, pong: 4 } as const

export interface RpcFrame {
  op: number
  data: unknown
}

/** 8-byte header (opcode, payload length: little-endian int32) followed by the JSON payload. */
export function encodeFrame(op: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeInt32LE(op, 0)
  header.writeInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

/** Frames can arrive split across socket chunks, or several in one: this reassembles them. */
export class FrameReader {
  private pending: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): RpcFrame[] {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk])
    const frames: RpcFrame[] = []
    while (this.pending.length >= 8) {
      const length = this.pending.readInt32LE(4)
      if (this.pending.length < 8 + length) break
      const op = this.pending.readInt32LE(0)
      const text = this.pending.toString('utf8', 8, 8 + length)
      this.pending = this.pending.subarray(8 + length)
      let data: unknown = null
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
      frames.push({ op, data })
    }
    return frames
  }
}
