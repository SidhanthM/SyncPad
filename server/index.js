const http = require('http')
const fs = require('fs')
const path = require('path')
const { WebSocketServer } = require('ws')

const PORT = 3000
const VIEWER_PATH = path.join(__dirname, '../viewer/index.html')

const server = http.createServer((req, res) => {
  fs.readFile(VIEWER_PATH, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Viewer not found')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(data)
  })
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  console.log('Client connected')

  ws.on('message', (data) => {
    console.log('Received:', data.toString())
    // Echo to all other connected clients
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(data.toString())
      }
    })
  })

  ws.on('close', () => console.log('Client disconnected'))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SyncPad server running at http://localhost:${PORT}`)
})