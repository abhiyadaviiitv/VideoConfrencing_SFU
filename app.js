
import express from 'express'
import https from 'httpolyglot'
import mediasoup from 'mediasoup'
import path from 'path'
import { Server } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'
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

// Mediasoup variables (per room)
const rooms = {};
// Store room data: { roomId: { router, transports: { socketId: { producerTransport, consumerTransport } }, producers: { producerId: producer }, consumers: { consumerId: consumer } } }

// Mediasoup variables
let worker
let router



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
    // router = await worker.createRouter({ mediaCodecs })
    // we should create the router in the createroom
    console.log('Mediasoup worker created')
  } catch (error) {
    console.error('Failed to initialize mediasoup:', error)
    process.exit(1)
  }
}

// Create WebRTC transport
const createWebRtcTransport = async (router, socketId, sender, callback) => {
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
  console.log(`Client disconnected: ${socket.id}`);

  // Iterate over every room this socket might be in
  for (const roomId in rooms) {
    const room = rooms[roomId];

    /* 1. Close and clean transports owned by this socket */
    if (room.transports[socket.id]) {
      room.transports[socket.id].producerTransport?.close();
      room.transports[socket.id].consumerTransport?.close();
      delete room.transports[socket.id];
    }

    /* 2. Close every producer this socket published */
    for (const producerId of Object.keys(room.producers)) {
      const producer = room.producers[producerId];

      if (producer.appData.socketId === socket.id) {
        // 2a. Notify all other peers BEFORE closing
        socket.to(roomId).emit('producerClosed', { producerId });

        // 2b. Actually close the producer
        producer.close();
        delete room.producers[producerId];
      }
    }

    /* 3. Close every consumer this socket was using */
    for (const consumerId of Object.keys(room.consumers)) {
      const consumer = room.consumers[consumerId];

      if (consumer.appData.socketId === socket.id) {
        consumer.close();
        delete room.consumers[consumerId];
      }
    }

    /* 4. Remove this socket from the room peer list */
    room.peers.delete(socket.id);

    /* 5. If the room is now empty, tear it down */
    if (room.peers.size === 0 && Object.keys(room.producers).length === 0) {
      console.log(`Room ${roomId} is empty – closing router.`);
      room.router.close();
      delete rooms[roomId];
    }
  }
});

    // --- Room Management ---

    socket.on('createRoom', async (callback) => {
        const roomId = uuidv4(); // Generate a unique ID for the room
        try {
            const router = await worker.createRouter({ mediaCodecs });
            rooms[roomId] = {
                router: router,
                transports: {}, // Stores { socketId: { producerTransport, consumerTransport } }
                producers: {}, // Stores { producerId: producer }
                consumers: {}, // Stores { consumerId: consumer }
                peers: new Set(), // Keep track of socket IDs in this room
            };
            rooms[roomId].peers.add(socket.id);
            socket.join(roomId); // Join the Socket.IO room
            console.log(`Room created: ${roomId} by ${socket.id}`);
            callback({ roomId: roomId, error: null });
        } catch (error) {
            console.error('Error creating room:', error);
            callback({ roomId: null, error: error.message });
        }
    });

    socket.on('joinRoom', async ({ roomId }, callback) => {
        if (!rooms[roomId]) {
            callback({ error: 'Room does not exist' });
            return;
        }
        // Check if the peer is already in this room
        if (rooms[roomId].peers.has(socket.id)) {
            console.log(`${socket.id} already in room: ${roomId}`);
            callback({ error: null }); // Still success, just already there
            return;
        }
        try {
            rooms[roomId].peers.add(socket.id);
            socket.join(roomId); // Join the Socket.IO room
            console.log(`${socket.id} joined room: ${roomId}`);
            callback({ error: null });
        } catch (error) {
            console.error(`Error joining room ${roomId}:`, error);
            callback({ error: error.message });
        }
    });

  // GET RTP Capabilties
  socket.on('getRtpCapabilities', (callback) => {
        // Find the room this socket belongs to
        let currentRoomId = null;
        for (const rId in rooms) {
            if (rooms[rId].peers.has(socket.id)) {
                currentRoomId = rId;
                break;
            }
        }

        if (!currentRoomId || !rooms[currentRoomId]) {
            callback({ rtpCapabilities: null, error: 'Not in a room' });
            return;
        }
        const room = rooms[currentRoomId];
        try {
            callback({
                rtpCapabilities: room.router.rtpCapabilities,
                error: null
            });
        } catch (error) {
            callback({
                rtpCapabilities: null,
                error: error.message
            });
        }
    }); 

  // Create WebRTC transport
  socket.on('createWebRtcTransport', async ({ sender, roomId }, callback) => {
        console.log("roomId IS :" , roomId)
        const room = rooms[roomId];
        console.log(room)
        if (!room) {
            callback({ params: null, error: 'Room not found' });
            return;
        }
        console.log(`Creating transport for sender: ${sender} in room: ${roomId} for socket: ${socket.id}`);
        try {
            const transport = await createWebRtcTransport(room.router, socket.id, sender, callback);
            if (!room.transports[socket.id]) {
                room.transports[socket.id] = {};
            }
            if (sender) {
                room.transports[socket.id].producerTransport = transport;
            } else {
                room.transports[socket.id].consumerTransport = transport;
            }
        } catch (error) {
            console.error('Transport creation error:', error);
            callback({
                params: null,
                error: error.message
            });
        }
    });

    socket.on('transport-connect', async ({ dtlsParameters, transportId, roomId }, callback) => {
        const room = rooms[roomId];
        if (!room) {
            callback('Room not found');
            return;
        }
        const transport = room.transports[socket.id]?.producerTransport; // Assuming this is for producer transport
        if (!transport || transport.id !== transportId) {
            console.error('Producer transport not found or ID mismatch for socket:', socket.id, 'transportId:', transportId);
            callback('Producer transport not found');
            return;
        }
        console.log('Connecting producer transport for', socket.id);
        try {
            await transport.connect({ dtlsParameters });
            console.log('Producer transport connected successfully for', socket.id);
            callback();
        } catch (error) {
            console.error('Producer transport connect error for', socket.id, ':', error);
            callback(error.message);
        }
    });

    socket.on('transport-produce', async ({ kind, rtpParameters, appData, transportId, roomId }, callback) => {
        const room = rooms[roomId];
        if (!room) {
            callback({ id: null, error: 'Room not found' });
            return;
        }
        const transport = room.transports[socket.id]?.producerTransport;
        if (!transport || transport.id !== transportId) {
            console.error('Producer transport not found or ID mismatch for socket:', socket.id, 'transportId:', transportId);
            callback({ id: null, error: 'Producer transport not found' });
            return;
        }

        console.log(`Producing ${kind} media from ${socket.id} in room ${roomId}`);
        try {
            const producer = await transport.produce({
                kind,
                rtpParameters,
                appData: { ...appData, socketId: socket.id }, // Store socketId with producer
            });

            producer.on('transportclose', () => {
                console.log(`Producer ${producer.id} transport closed for ${socket.id}`);
                // Don't close producer here as transport close might be due to page refresh,
                // rely on disconnect handler for full cleanup.
            });

            producer.on('trackended', () => {
                console.log(`Producer ${producer.id} track ended for ${socket.id}`);
                producer.close(); // Close producer if track ends
                delete room.producers[producer.id];
                peers.to(roomId).emit('producerClosed', { producerId: producer.id });
            });

            room.producers[producer.id] = producer;
            console.log(`Producer created successfully: ${producer.id} for ${socket.id}`);
            socket.to(roomId).emit('newProducer', {
            producerId: producer.id,
            peerId: socket.id
});

            callback({
                id: producer.id,
                error: null
            });
        } catch (error) {
            console.error('Produce error for', socket.id, ':', error);
            callback({
                id: null,
                error: error.message
            });
        }
    });

    socket.on('transport-recv-connect', async ({ dtlsParameters, transportId, roomId }, callback) => {
        const room = rooms[roomId];
        if (!room) {
            callback('Room not found');
            return;
        }
        const transport = room.transports[socket.id]?.consumerTransport; // Assuming this is for consumer transport
        if (!transport || transport.id !== transportId) {
            console.error('Consumer transport not found or ID mismatch for socket:', socket.id, 'transportId:', transportId);
            callback('Consumer transport not found');
            return;
        }
        console.log('Connecting consumer transport for', socket.id);
        try {
            await transport.connect({ dtlsParameters });
            console.log('Consumer transport connected successfully for', socket.id);
            callback();
        } catch (error) {
            console.error('Consumer transport connect error for', socket.id, ':', error);
            callback(error.message);
        }
    });

    // New event to get existing producers in a room
    socket.on('getProducersInRoom', ({ roomId }, callback) => {
        const room = rooms[roomId];
        if (!room) {
            callback({ producerIds: null, error: 'Room not found' });
            return;
        }
        // Filter out the current socket's own producer if it exists
        const producers = Object.values(room.producers)
            .filter(producer => producer.appData.socketId !== socket.id)
            .map(producer => producer.id);
        callback({ producerIds: producers, error: null });
    });


    // New event to create a consumer for a specific producer
    socket.on('consume', async ({ producerId, rtpCapabilities, roomId }, callback) => {
        console.log("trying to consume ")
        const room = rooms[roomId];
        if (!room) {
            callback({ params: null, error: 'Room not found' });
            return;
        }
        const consumerTransport = room.transports[socket.id]?.consumerTransport;
        const producer = room.producers[producerId];

        if (!consumerTransport || !producer) {
            callback({ params: null, error: 'Consumer transport or producer not found' });
            return;
        }

        try {
            if (!room.router.canConsume({
                producerId: producer.id,
                rtpCapabilities,
            })) {
                console.error('Cannot consume this producer with given RTP capabilities');
                callback({ params: null, error: 'Cannot consume producer' });
                return;
            }

            const consumer = await consumerTransport.consume({
                producerId: producer.id,
                rtpCapabilities,
                paused: true,
                appData: { socketId: socket.id, producerSocketId: producer.appData.socketId }, // Store context
            });

            consumer.on('transportclose', () => {
                console.log(`Consumer ${consumer.id} transport closed for ${socket.id}`);
                // Don't close consumer here, rely on disconnect handler for full cleanup.
            });

            consumer.on('producerclose', () => {
                console.log(`Consumer ${consumer.id} producer closed for ${socket.id}`);
                consumer.close();
                delete room.consumers[consumer.id];
                // Client side will get 'producerClosed' from main disconnect handler or trackended on producer
            });

            room.consumers[consumer.id] = consumer;
            console.log(`Consumer created successfully: ${consumer.id} for socket: ${socket.id}, consuming producer: ${producer.id}`);

            callback({
                params: {
                    id: consumer.id,
                    producerId: producer.id,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                },
                error: null
            });
        } catch (error) {
            console.error('Create consumer error:', error);
            callback({ params: null, error: error.message });
        }
    });

    socket.on('consumer-resume', async ({ consumerId, roomId }, callback) => {
        console.log("roomId is " , roomId)
        const room = rooms[roomId];
        if (!room) {
            callback('Room not found');
            return;
        }
        const consumer = room.consumers[consumerId];
        if (!consumer) {
            console.log('No consumer to resume for socket:', socket.id, 'consumerId:', consumerId);
            if (callback) callback('No consumer available');
            return;
        }
        console.log('Resuming consumer:', consumer.id, 'for socket:', socket.id);
        try {
            await consumer.resume();
            console.log('Consumer resumed successfully:', consumer.id);
            if (callback) callback(null);
        } catch (error) {
            console.error('Consumer resume error:', error);
            if (callback) callback(error.message);
        }
    });

    
});

// Initialize mediasoup on server start
initializeMediasoup().catch((error) => {
  console.error('Failed to initialize mediasoup:', error)
  process.exit(1)
})