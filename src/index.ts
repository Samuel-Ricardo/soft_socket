import { createServer } from 'node:http'
import crypto from 'node:crypto'

const PORT = 3000
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const SEVEN_BITS_INTEGER_MARKER = 125
const SIXTEEN_BITS_INTEGER_MARKER = 126
const SIXTYFOUR_BITS_INTEGER_MARKER = 127

const MAXIMUM_SIXTEEN_BITS_INTEGER = 2 ** 16 // 0 to 65536

const OPCODE_TEXT = 0x01 // 1 bit in binary 1

const MASK_KEY_BYTES_LENGTH = 4

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

function prepareMessage(message: string) {
  const msg = Buffer.from(message)
  const size = msg.length

  let dataFrameBuffer

  // 0x80 === 128 in binary
  // '0x' + Math.abs(128).toString(16)
  const firstByte = 0x80 | OPCODE_TEXT // single frame + utf8 text

  if (size <= SEVEN_BITS_INTEGER_MARKER) {
    const bytes = [firstByte]
    dataFrameBuffer = Buffer.from(bytes.concat(size))
  } else if (size <= MAXIMUM_SIXTEEN_BITS_INTEGER) {
    const offsetFourBytes = 4
    const target = Buffer.allocUnsafe(offsetFourBytes)
    target[0] = firstByte
    target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0 //you can setup a mask here if you want;

    target.writeUint16BE(size, 2)
    dataFrameBuffer = target

    // alloc 4 bytes
    // [0] - 128 + 1 - 10000001 - 0x81 - fin + opcode
    // [1] - 126 + 0 | payload length mark + mask indicator [no mask]
    // [2] - 0 | content length
    // [3] - 113 - content length
    // [ 4 - ... ] - the message it self
  } else {
    throw new Error('Message to long :(')
  }

  const totalLength = dataFrameBuffer.byteLength + size
  const dataFrameResponse = concat([dataFrameBuffer, msg], totalLength)
  return dataFrameResponse
}

function concat(bufferList: Buffer[], totalLength: number) {
  const target = Buffer.allocUnsafe(totalLength)
  let offSet = 0

  for (const buffer of bufferList) {
    target.set(buffer, offSet)
    offSet += buffer.length
  }

  return target
}

function sendMessage(message: string, socket: any) {
  const dataFrame = prepareMessage(message)
  socket.write(dataFrame)
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
  } else if (lenghIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
    // unsigned, big-endian 16-bit integer [0-65k] 2 ** 16
    messageLength = socket.read(2).readUInt16BE(0)
  } else {
    throw new Error(
      `Your message is too big :( We don't handle 64-bits messages`,
    )
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH)
  const encoded = socket.read(messageLength)
  const decoded = unmask(encoded, maskKey)

  const data = JSON.parse(decoded.toString('utf8'))
  console.log('Message Received!', { data })

  const msg = JSON.stringify(data)
  sendMessage(msg, socket)
}

function unmask(encodedBuffer: any[], maskKey: any[]) {
  const finalBuffer = Buffer.from(encodedBuffer)

  const fillWithEightZeros = (t: any) => t.padStart(8, '0')
  const toBinary = (t: any) => fillWithEightZeros(t.toString(2))
  const fromBinaryToDecimal = (t: any) => parseInt(toBinary(t), 2)
  const getCharFromBinary = (t: any) =>
    String.fromCharCode(fromBinaryToDecimal(t))

  // because the maskKey has only 4 bytes
  // index % 4 === 0, 1, 2, 3 = index bits needed to decode the message

  // XOR  ^
  // returns 1 if both are different
  // returns 0 if both are equal

  // (71).toString(2).padStart(8, "0") = 0 1 0 0 0 1 1 1
  // (53).toString(2).padStart(8, "0") = 0 0 1 1 0 1 0 1
  //                                     0 1 1 1 0 0 1 0

  // (71 ^ 53).toString(2).padStart(8, "0") = '01110010'
  // String.fromCharCode(parseInt('01110010', 2))

  for (let index = 0; index < encodedBuffer.length; index++) {
    finalBuffer[index] =
      encodedBuffer[index] ^ maskKey[index % MASK_KEY_BYTES_LENGTH]

    const logger = {
      unmaskingCalc: `${toBinary(encodedBuffer[index])} ^ ${toBinary(maskKey[index % MASK_KEY_BYTES_LENGTH])} = ${toBinary(finalBuffer[index])}`,
      decoded: getCharFromBinary(finalBuffer[index]),
    }
    console.log(logger)
  }

  return finalBuffer
}

process.on('uncaughtException', (error) => console.error(error))
process.on('unhandledRejection', (error) => console.error(error))
