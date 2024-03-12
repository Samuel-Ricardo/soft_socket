"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const PORT = 3000;
(0, node_http_1.createServer)((request, response) => {
    response.writeHead(200);
    response.end('Hello, World!\n');
}).listen(PORT, () => console.log(`Server running at http://localhost:${PORT}/`));
