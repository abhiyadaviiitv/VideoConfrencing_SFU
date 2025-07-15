
import express from 'express'
import https from 'httpolyglot'
import mediasoup from 'mediasoup'
import path from 'path'
import { Server } from 'socket.io'

const __dirname = path.resolve()
const app = express()
const PORT = 4000

// Express setup
app.get('/', (req, res) => {
  res.send('Mediasoup WebRTC Server')
})

app.use('/sfu', express.static(path.join(__dirname, 'public')))

// HTTPS server
const httpsServer = https.createServer({}, app)
httpsServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})

// Socket.io setup
const io = new Server(httpsServer)
const peers = io.of('/mediasoup')

// Mediasoup variables
let worker
let router
let producerTransport
let consumerTransport
let producer
let consumer

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
]

// Create mediasoup Worker
const createWorker = async () => {
  try {
    const worker = await mediasoup.createWorker({
      rtcMinPort: 2000,
      rtcMaxPort: 2020,
    })
    
    worker.on('died', () => {
      console.error('Mediasoup worker died, exiting...')
      process.exit(1)
    })
    
    return worker
  } catch (error) {
    console.error('Failed to create worker:', error)
    throw error
  }
}

// Initialize mediasoup
const initializeMediasoup = async () => {
  try {
    worker = await createWorker()
    router = await worker.createRouter({ mediaCodecs })
    console.log('Mediasoup router created')
  } catch (error) {
    console.error('Failed to initialize mediasoup:', error)
    process.exit(1)
  }
}

// Create WebRTC transport
const createWebRtcTransport = async (callback) => {
  try {
    const transportOptions = {
      listenIps: [
        {
          ip: '0.0.0.0',
          // Use localhost for local development, or your actual public IP for production
          announcedIp: '127.0.0.1',
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      // Remove appData: iceServers - this is wrong
    }

    const transport = await router.createWebRtcTransport(transportOptions)
    console.log(`Transport created: ${transport.id}`)

    transport.on('dtlsstatechange', (dtlsState) => {
      console.log(`Transport ${transport.id} DTLS state: ${dtlsState}`)
      if (dtlsState === 'closed') {
        transport.close()
      }
    })

    transport.on('close', () => {
      console.log(`Transport ${transport.id} closed`)
    })

    // Add ICE connection state logging
    transport.on('icestatechange', (iceState) => {
      console.log(`Transport ${transport.id} ICE state: ${iceState}`)
    })

    callback({
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
      error: null
    })

    return transport
  } catch (error) {
    console.error('Failed to create transport:', error)
    callback({
      params: null,
      error: error.message
    })
    throw error
  }
}

// Socket.io connection handlers
peers.on('connection', async (socket) => {
  console.log(`New connection: ${socket.id}`)

  // Initialize mediasoup if not ready
  if (!router) {
    try {
      await initializeMediasoup()
    } catch (error) {
      socket.emit('error', { message: 'Failed to initialize media server' })
      return
    }
  }

  socket.emit('connection-success', { socketId: socket.id })

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
    if (producer) {
      producer.close()
      producer = null
    }
    if (consumer) {
      consumer.close()
      consumer = null
    }
  })

  // Get RTP capabilities
  socket.on('getRtpCapabilities', (callback) => {
    try {
      callback({ 
        rtpCapabilities: router.rtpCapabilities,
        error: null
      })
    } catch (error) {
      callback({ 
        rtpCapabilities: null,
        error: error.message
      })
    }
  })

  // Create WebRTC transport
  socket.on('createWebRtcTransport', async ({ sender }, callback) => {
    console.log(`Creating transport for sender: ${sender}`)
    try {
      const transport = await createWebRtcTransport(callback)
      if (sender) {
        producerTransport = transport
      } else {
        consumerTransport = transport
      }
    } catch (error) {
      console.error('Transport creation error:', error)
      callback({
        params: null,
        error: error.message
      })
    }
  })

  // Connect producer transport
  socket.on('transport-connect', async ({ dtlsParameters }, callback) => {
    console.log('Connecting producer transport')
    try {
      await producerTransport.connect({ dtlsParameters })
      console.log('Producer transport connected successfully')
      callback();
    } catch (error) {
      console.error('Producer transport connect error:', error)
    }
  })

  console.log("before producing");
  // Produce media
  socket.on('transport-produce', async ({ kind, rtpParameters }, callback) => {
    console.log("in transport produce");
    console.log(`Producing ${kind} media`)
    try {
      producer = await producerTransport.produce({
        kind,
        rtpParameters,
      })

      producer.on('transportclose', () => {
        console.log('Producer transport closed')
        producer.close()
        producer = null
      })

      producer.on('trackended', () => {
        console.log('Producer track ended')
        producer.close()
        producer = null
      })

      console.log(`Producer created successfully: ${producer.id}`)
      callback({ 
        id: producer.id,
        error: null
      })
    } catch (error) {
      console.error('Produce error:', error)
      callback({ 
        id: null,
        error: error.message
      })
    }1
  })

  // Connect consumer transport
  socket.on('transport-recv-connect', async ({ dtlsParameters } , callback) => {
    console.log('Connecting consumer transport')
    try {
      await consumerTransport.connect({ dtlsParameters })
      console.log('Consumer transport connected successfully');
      callback();
    } catch (error) {
      console.error('Consumer transport connect error:', error)
    }
  })

  // Consume media
  socket.on('consume', async ({ rtpCapabilities }, callback) => {
    console.log('Creating consumer')
    try {
      if (!producer) {
        callback({ 
          params: null,
          error: 'No producer available' 
        })
        return
      }

      if (!router.canConsume({
        producerId: producer.id,
        rtpCapabilities,
      })) {
        callback({ 
          params: null,
          error: 'Cannot consume' 
        })
        return
      }

      consumer = await consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: true,
      })

      consumer.on('transportclose', () => {
        console.log('Consumer transport closed')
        consumer.close()
        consumer = null
      })

      consumer.on('producerclose', () => {
        console.log('Producer closed')
        consumer.close()
        consumer = null
      })

      console.log(`Consumer created successfully: ${consumer.id}`)
      callback({
        params: {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        },
        error: null
      })
    } catch (error) {
      console.error('Consume error:', error)
      callback({ 
        params: null,
        error: error.message 
      })
    }
  })

  // Resume consumer
  socket.on('consumer-resume', async (callback) => {
    console.log('Resuming consumer')
    try {
      if (consumer) {
        await consumer.resume()
        console.log('Consumer resumed successfully')
        if (callback) callback(null)
      } else {
        console.log('No consumer to resume')
        if (callback) callback('No consumer available')
      }
    } catch (error) {
      console.error('Consumer resume error:', error)
      if (callback) callback(error.message)
    }
  })
})

// Initialize mediasoup on server start
initializeMediasoup().catch((error) => {
  console.error('Failed to initialize mediasoup:', error)
  process.exit(1)
})