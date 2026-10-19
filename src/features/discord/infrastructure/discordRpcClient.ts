import { randomUUID } from 'node:crypto'
import { connect, type Socket } from 'node:net'
import type { RpcConnection } from '../application/discordSession'
import { encodeFrame, FrameReader, RpcOp } from './rpcFrames'

/** Discord listens on the first free of these pipes (several installs: stable, PTB, Canary). */
const PIPES = Array.from({ length: 10 }, (_, index) => `\\\\?\\pipe\\discord-ipc-${index}`)
const HANDSHAKE_TIMEOUT_MS = 5000
const REQUEST_TIMEOUT_MS = 10_000

export class DiscordRpcError extends Error {
  constructor(
    message: string,
    readonly code?: number
  ) {
    super(message)
    this.name = 'DiscordRpcError'
  }
}

interface Payload {
  cmd?: string
  evt?: string | null
  nonce?: string | null
  data?: { code?: number; message?: string } & Record<string, unknown>
  code?: number
  message?: string
}

function connectPipe(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(path)
    socket.once('connect', () => {
      socket.removeAllListeners('error')
      resolve(socket)
    })
    socket.once('error', reject)
  })
}

/** Spanish messages for the RPC failures a user can do something about. */
function friendly(code: number | undefined, message: string): string {
  if (code === 4000) return 'Discord rechazó el Client ID: revisá que sea el de tu aplicación.'
  if (code === 5000 || /access_denied|cancel/i.test(message)) return 'Se canceló la autorización en Discord.'
  return message || 'Discord respondió con un error.'
}

/** Local RPC with the Discord desktop app over its named pipe. */
export class DiscordRpcClient implements RpcConnection {
  private readonly reader = new FrameReader()
  private readonly pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
  private ready: { resolve: () => void; reject: (error: Error) => void } | null = null
  private isClosed = false

  private constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => this.reader.push(chunk).forEach((frame) => this.handle(frame.op, frame.data as Payload)))
    socket.on('close', () => this.fail(new DiscordRpcError('Se cerró la conexión con Discord.')))
    socket.on('error', () => this.fail(new DiscordRpcError('Se cortó la conexión con Discord.')))
  }

  /** Connects to the running Discord app and completes the handshake for `clientId`. */
  static async open(clientId: string): Promise<DiscordRpcClient> {
    let socket: Socket | null = null
    for (const path of PIPES) {
      socket = await connectPipe(path).catch(() => null)
      if (socket) break
    }
    if (!socket) throw new DiscordRpcError('No encontré Discord abierto en esta PC: abrilo e intentá de nuevo.')
    const client = new DiscordRpcClient(socket)
    await client.handshake(clientId)
    return client
  }

  get closed(): boolean {
    return this.isClosed
  }

  request<T>(cmd: string, args: Record<string, unknown>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    if (this.isClosed) return Promise.reject(new DiscordRpcError('No hay conexión con Discord.'))
    const nonce = randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(nonce)
        reject(new DiscordRpcError('Discord tardó demasiado en responder.'))
      }, timeoutMs)
      this.pending.set(nonce, { resolve: (data) => resolve(data as T), reject, timer })
      this.socket.write(encodeFrame(RpcOp.frame, { cmd, args, nonce }))
    })
  }

  close(): void {
    if (this.isClosed) return
    this.isClosed = true
    try {
      this.socket.write(encodeFrame(RpcOp.close, {}))
    } catch {
      // Already gone.
    }
    this.socket.destroy()
    this.fail(new DiscordRpcError('Conexión con Discord cerrada.'))
  }

  private handshake(clientId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close()
        reject(new DiscordRpcError('Discord no respondió al conectarse.'))
      }, HANDSHAKE_TIMEOUT_MS)
      this.ready = {
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        }
      }
      this.socket.write(encodeFrame(RpcOp.handshake, { v: 1, client_id: clientId }))
    })
  }

  private handle(op: number, payload: Payload | null): void {
    if (op === RpcOp.ping) {
      this.socket.write(encodeFrame(RpcOp.pong, payload ?? {}))
      return
    }
    if (op === RpcOp.close) {
      const error = new DiscordRpcError(friendly(payload?.code, payload?.message ?? ''), payload?.code)
      this.isClosed = true
      this.socket.destroy()
      this.fail(error)
      return
    }
    if (op !== RpcOp.frame || !payload) return
    if (payload.cmd === 'DISPATCH' && payload.evt === 'READY') {
      this.ready?.resolve()
      this.ready = null
      return
    }
    const waiting = payload.nonce ? this.pending.get(payload.nonce) : undefined
    if (!waiting || !payload.nonce) return
    this.pending.delete(payload.nonce)
    clearTimeout(waiting.timer)
    if (payload.evt === 'ERROR') waiting.reject(new DiscordRpcError(friendly(payload.data?.code, payload.data?.message ?? ''), payload.data?.code))
    else waiting.resolve(payload.data)
  }

  private fail(error: Error): void {
    this.isClosed = true
    this.ready?.reject(error)
    this.ready = null
    for (const [nonce, waiting] of this.pending) {
      clearTimeout(waiting.timer)
      waiting.reject(error)
      this.pending.delete(nonce)
    }
  }
}
