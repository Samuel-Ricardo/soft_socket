import { createServer } from 'node:http'
const PORT = 3000

createServer((request, response) => {
  response.writeHead(200)
  response.end('Hello, World!\n')
}).listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}/`),
)