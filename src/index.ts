import { createServer } from 'node:http'
import crypto from 'node:crypto'

const PORT = 3000
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const SEVEN_BITS_INTEGER_MARKER = 125
const SIXTEEN_BITS_INTEGER_MARKER = 126
const SIXTYFOUR_BITS_INTEGER_MARKER = 127

// parseInt('10000000', 2)
const FIRST_BIT = 128

const server = createServer((request, response) => {
  response.writeHead(200)
  response.end('Hello, World!\n')
}).listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}/`),
)

server.on('upgrade', (req, socket, buffers) => {
  const { 'sec-websocket-key': key } = req.headers
  console.log(`${key} - connected!`)

  const headers = prepareHandShakeHeaders(key)
  console.log({ headers })

  socket.write(headers)
  socket.on('readable', () => onSocketReadable(socket))
})

function prepareHandShakeHeaders(id?: string) {
  if (!id) return 'no_id'
  const acceptKey = createSocketAccept(id)

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '',
  ]
    .map((line) => line.concat('\r\n'))
    .join('')

  return headers
}

function createSocketAccept(id: string) {
  const sha1 = crypto.createHash('sha1')
  sha1.update(id + WEBSOCKET_MAGIC_STRING_KEY)
  return sha1.digest('base64')
}

function onSocketReadable(socket: any) {
  // consume optcode - [first byte]
  // 1º | 1 byte - 8bits
  socket.read(1)

  // 2° |
  const [markerAndPayloadLengh] = socket.read(1)
  // remove first bit because is always 1 or client-to-server messages
  const lenghIndicatorInBits = markerAndPayloadLengh - FIRST_BIT

  let messageLength = 0

  if (lenghIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
    messageLength = lenghIndicatorInBits
  } else {
    throw new Error(
      `Your message is too big :( We don't handle 64-bits messages`,
    )
  }
}

process.on('uncaughtException', (error) => console.error(error))
process.on('unhandledRejection', (error) => console.error(error))
