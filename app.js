
import express from 'express'
import https from 'httpolyglot'
import mediasoup from 'mediasoup'
import path from 'path'
import { Server } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.resolve()
const app = express()
const PORT = 4000

// Serve React build files
app.use(express.static(path.join(__dirname, 'UI', 'frontend', 'dist')))

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
    preferredPayloadType: 111,
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    preferredPayloadType: 110,
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
          //announcedIp:'192.168.166.42',
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
        socket.to(roomId).emit('producerClosed', { 
          producerId,
          appData: producer.appData 
        });

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

    // Notify other peers about disconnection
    socket.to(roomId).emit('peerDisconnected', { peerId: socket.id });

    /* 5. If the room is now empty, tear it down */
    if (room.peers.size === 0 && Object.keys(room.producers).length === 0) {
      console.log(`Room ${roomId} is empty – closing router.`);
      room.router.close();
      delete rooms[roomId];
    }
  }
});

// Handle cleanup of old peer tiles when host reconnects
socket.on('cleanupOldPeerTiles', ({ roomId, oldSocketId }) => {
  console.log(`Cleaning up old peer tiles for ${oldSocketId} in room ${roomId}`);
  socket.to(roomId).emit('peerDisconnected', { peerId: oldSocketId });
});

    // --- Room Management ---

    socket.on('createRoom', async (callback) => {
  const roomId = uuidv4();
  try {
    const router = await worker.createRouter({ mediaCodecs });

    // 1. create the observer
    const audioLevelObserver = await router.createAudioLevelObserver({
      maxEntries: 1,
      threshold: -45,   // dBov(decibels relative to open circuit voltage  typically used to describe the power or intensity of audio signals) - adjust if too sensitive
      interval: 200     // ms
    });

    // broadcast loudest speaker to every peer in the room
    // peer id bcz the producer ID received is for an audio stream, while you need to highlight a video element
    audioLevelObserver.on('volumes', ([{ producer }]) => {
        console.log('LOUDEST', producer.appData.socketId);
  const peerId = producer.appData.socketId; // Get participant ID

  peers.to(roomId).emit('activeSpeaker', { peerId }); // Send participant ID
});


    rooms[roomId] = {
      router,
      transports: {},
      producers: {},
      consumers: {},
      peers: new Set(),
      audioLevelObserver, // keep reference so we can add producers later
      host: socket.id // Track the room creator as host
    };
    
    // Auto-join the room after creation to maintain same socket connection
    rooms[roomId].peers.add(socket.id);
    socket.join(roomId);
    
    // Auto-join chat so no messages are missed
    socket.join(`chat-${roomId}`);
    console.log(`Socket ${socket.id} auto-joined chat for room ${roomId}`);
    
    console.log(`Room created and auto-joined: ${roomId} by ${socket.id} (host)`);
    callback({ roomId, error: null, isHost: true, hostId: socket.id, autoJoined: true });
  } catch (error) {
    console.error('Error creating room:', error);
    callback({ roomId: null, error: error.message });
  }
});

    // Get room information for a socket
    socket.on('getRoomInfo', ({ roomId }, callback) => {
        if (!rooms[roomId]) {
            callback({ error: 'Room does not exist' });
            return;
        }
        
        const room = rooms[roomId];
        const isInRoom = room.peers.has(socket.id);
        const isHost = room.host === socket.id;
        
        console.log(`Room info request for ${socket.id} in room ${roomId}: inRoom=${isInRoom}, isHost=${isHost}, hostId=${room.host}`);
        
        callback({ 
            error: null, 
            isInRoom, 
            isHost, 
            hostId: room.host,
            roomId 
        });
    });

    socket.on('joinRoom', async ({ roomId, isHostReconnecting }, callback) => {
        if (!rooms[roomId]) {
            callback({ error: 'Room does not exist' });
            return;
        }
        
        // Check if the peer is already in this room
        if (rooms[roomId].peers.has(socket.id)) {
            console.log(`${socket.id} already in room: ${roomId}`);
            const isHost = rooms[roomId].host === socket.id;
            callback({ error: null, isHost, hostId: rooms[roomId].host }); // Include hostId
            return;
        }
        try {
            rooms[roomId].peers.add(socket.id);
            socket.join(roomId); // Join the Socket.IO room
            
            // Auto-join chat so no messages are missed
            socket.join(`chat-${roomId}`);
            console.log(`Socket ${socket.id} auto-joined chat for room ${roomId}`);
            
            // Auto-join polls so no polls are missed
            socket.join(`poll-${roomId}`);
            console.log(`Socket ${socket.id} auto-joined polls for room ${roomId}`);
            
            const isHost = rooms[roomId].host === socket.id;
            console.log(`${socket.id} joined room: ${roomId}${isHost ? ' (host)' : ''} - Host ID: ${rooms[roomId].host}`);
            
            // Send existing polls to the newly joined user
            if (rooms[roomId].polls && rooms[roomId].polls.length > 0) {
                rooms[roomId].polls.forEach(poll => {
                    socket.emit('poll-created', poll);
                    
                    // Check if this user has already voted on this poll
                    if (poll.userVotes && poll.userVotes.has(socket.id)) {
                        const optionIndex = poll.userVotes.get(socket.id);
                        socket.emit('user-voted', { pollId: poll.id, optionIndex });
                        console.log(`Restored vote for user ${socket.id} on poll ${poll.id}, option ${optionIndex}`);
                    }
                });
                console.log(`Sent ${rooms[roomId].polls.length} existing polls to ${socket.id}`);
            }
            
            // Notify existing participants about the new participant
            socket.to(roomId).emit('participant-joined', {
                participantId: socket.id,
                hostId: rooms[roomId].host,
                roomId: roomId
            });
            
            callback({ error: null, isHost, hostId: rooms[roomId].host }); // Include hostId
        } catch (error) {
            console.error(`Error joining room ${roomId}:`, error);
            callback({ error: error.message });
        }
    });

  // GET RTP Capabilties
  socket.on('getRtpCapabilities', (data, callback) => {
        // Handle both old format (callback only) and new format (data, callback)
        if (typeof data === 'function') {
            callback = data;
            data = {};
        }
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

            if (producer.kind === 'audio') {
              await room.audioLevelObserver.addProducer({ producerId: producer.id });
            }


            producer.on('transportclose', () => {
                console.log(`Producer ${producer.id} transport closed for ${socket.id}`);
                // Don't close producer here as transport close might be due to page refresh,
                // rely on disconnect handler for full cleanup.
            });

            producer.on('trackended', () => {
                console.log(`Producer ${producer.id} track ended for ${socket.id}`);
                producer.close(); // Close producer if track ends
                delete room.producers[producer.id];
                peers.to(roomId).emit('producerClosed', { 
                    producerId: producer.id,
                    appData: producer.appData 
                });
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
                    peerId: producer.appData.socketId,
                    appData: producer.appData
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

//     // --- Recording management (START / PAUSE / RESUME / STOP) ---
//   socket.on('startRecording', ({ roomId }) => {
//     const room = rooms[roomId];
//     if (!room) return socket.emit('error', 'Room not found');
//     if (recorders.has(roomId)) return socket.emit('error', 'Already recording');

//     const recorder = new RoomRecorder(room, roomId);
//     recorders.set(roomId, recorder);
//     recorder.start()
//       .then(() => socket.emit('recordingStarted', roomId))
//       .catch(err => socket.emit('error', err.message));
//   });

//   socket.on('pauseRecording', ({ roomId }) => {
//     const recorder = recorders.get(roomId);
//     if (!recorder) return socket.emit('error', 'Not recording');
//     recorder.pause();
//     socket.emit('recordingPaused', roomId);
//   });

//   socket.on('resumeRecording', ({ roomId }) => {
//     const recorder = recorders.get(roomId);
//     if (!recorder) return socket.emit('error', 'Not recording');
//     recorder.resume();
//     socket.emit('recordingResumed', roomId);
//   });

//   socket.on('stopRecording', ({ roomId }) => {
//     const recorder = recorders.get(roomId);
//     if (!recorder) return socket.emit('error', 'Not recording');
//     recorder.stop();
//     recorders.delete(roomId);
//     socket.emit('recordingStopped', roomId);
//   });

    // Chat functionality
    socket.on('join-chat', ({ roomId }) => {
        socket.join(`chat-${roomId}`);
        console.log(`Socket ${socket.id} joined chat for room ${roomId}`);
        socket.to(`chat-${roomId}`).emit('user-joined-chat', { userId: socket.id });
    });

    socket.on('send-message', ({ roomId, userId, message, timestamp }) => {
        const messageData = {
            userId,
            message,
            timestamp,
            type: 'user'
        };
        // Broadcast to all users in the chat room including sender
        peers.in(`chat-${roomId}`).emit('chat-message', messageData);
        console.log(`Message sent in room ${roomId} by ${userId}: ${message}`);
    });

    socket.on('leave-chat', ({ roomId }) => {
        socket.leave(`chat-${roomId}`);
        socket.to(`chat-${roomId}`).emit('user-left-chat', { userId: socket.id });
    });

    // Status change functionality for mute/camera
    socket.on('status-changed', ({ roomId, peerId, isMuted, isCameraOff }) => {
        console.log(`Status changed for peer ${peerId} in room ${roomId}: muted=${isMuted}, camera=${isCameraOff}`);
        // Broadcast status change to all other participants in the room
        socket.to(roomId).emit('peer-status-changed', {
            peerId,
            isMuted,
            isCameraOff
        });
    });

    // Hand raise functionality
    socket.on('raise-hand', ({ roomId, userId, userName }) => {
        console.log(`Hand raised by ${userId} in room ${roomId}`);
        const timestamp = new Date().toISOString();
        // Broadcast to all participants in the room including sender
        peers.to(roomId).emit('hand-raised', {
            userId,
            userName,
            timestamp
        });
    });

    socket.on('lower-hand', ({ roomId, userId }) => {
        console.log(`Hand lowered by ${userId} in room ${roomId}`);
        // Broadcast to all participants in the room including sender
        peers.to(roomId).emit('hand-lowered', {
            userId
        });
    });

    socket.on('clear-all-hands', ({ roomId }) => {
        console.log(`All hands cleared in room ${roomId}`);
        // Broadcast to all participants in the room
        peers.to(roomId).emit('hands-cleared');
    });

    // Handle remove participant (host only)
    socket.on('remove-participant', ({ roomId, participantId }) => {
        console.log(`Host ${socket.id} removing participant ${participantId} from room ${roomId}`);
        
        // Find the participant's socket
        const participantSocket = peers.sockets.get(participantId);
        if (participantSocket) {
            // Notify the participant they are being removed
            participantSocket.emit('removed-from-room', { roomId, reason: 'Removed by host' });
            
            // Force disconnect the participant
            participantSocket.disconnect(true);
            
            // Notify other participants
            socket.to(roomId).emit('participant-removed', { participantId });
            
            console.log(`Participant ${participantId} removed from room ${roomId}`);
        } else {
            console.log(`Participant ${participantId} not found`);
        }
    });

    // Handle mute participant (host only)
    socket.on('mute-participant', ({ roomId, participantId, shouldMute }) => {
        console.log(`Host ${socket.id} ${shouldMute ? 'muting' : 'unmuting'} participant ${participantId} in room ${roomId}`);
        
        // Verify the requester is the host
        if (rooms[roomId] && rooms[roomId].host === socket.id) {
            // Find the participant's socket
            const participantSocket = peers.sockets.get(participantId);
            if (participantSocket) {
                // Send mute command to the participant
                participantSocket.emit('host-mute-request', { roomId, shouldMute });
                console.log(`Mute request sent to participant ${participantId}`);
            } else {
                console.log(`Participant ${participantId} not found`);
            }
        } else {
            console.log(`Unauthorized mute request from ${socket.id} - not the host`);
        }
    });

    // Handle manual producer closure from clients (e.g., stopping screen share)
    socket.on('producerClosed', ({ producerId, appData }) => {
        console.log(`Client ${socket.id} manually closed producer ${producerId}`);
        
        // Find the room containing this producer
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const producer = room.producers[producerId];
            
            if (producer && producer.appData.socketId === socket.id) {
                // Close the producer on server side
                producer.close();
                delete room.producers[producerId];
                
                // Notify all other clients in the room
                socket.to(roomId).emit('producerClosed', {
                    producerId,
                    appData
                });
                
                console.log(`Producer ${producerId} closed and other clients notified`);
                break;
            }
        }
    });

    // Poll functionality
    socket.on('create-poll', (pollData) => {
        console.log(`Poll created by ${socket.id} in room ${pollData.roomId}:`, pollData.question);
        
        // Verify the creator is in the room and is the host
        if (rooms[pollData.roomId] && rooms[pollData.roomId].host === socket.id) {
            // Initialize polls array for room if it doesn't exist
            if (!rooms[pollData.roomId].polls) {
                rooms[pollData.roomId].polls = [];
            }
            
            // Store poll in room data
            rooms[pollData.roomId].polls.push(pollData);
            
            // Broadcast poll to all participants in the room (both general room and poll-specific room)
            peers.in(pollData.roomId).emit('poll-created', pollData);
            peers.in(`poll-${pollData.roomId}`).emit('poll-created', pollData);
            console.log(`Poll ${pollData.id} created and broadcasted to room ${pollData.roomId}`);
        } else {
            console.log(`Unauthorized poll creation attempt by ${socket.id}`);
        }
    });

    socket.on('vote-poll', ({ pollId, optionIndex, roomId }) => {
        console.log(`Vote received from ${socket.id} for poll ${pollId}, option ${optionIndex}`);
        
        // Find the room and poll
        if (rooms[roomId] && rooms[roomId].polls) {
            const poll = rooms[roomId].polls.find(p => p.id === pollId);
            
            if (poll && poll.isActive) {
                // Initialize voters array if it doesn't exist
                if (!poll.voters) {
                    poll.voters = [];
                }
                
                // Initialize userVotes Map if it doesn't exist (for backward compatibility)
                if (!poll.userVotes) {
                    poll.userVotes = new Map();
                }
                
                // Check if user has already voted
                if (poll.userVotes.has(socket.id)) {
                    console.log(`User ${socket.id} has already voted on poll ${pollId}`);
                    return;
                }
                
                // Record the vote with user-option mapping
                if (!poll.userVotes) {
                    poll.userVotes = new Map();
                }
                poll.voters.push(socket.id);
                poll.userVotes.set(socket.id, optionIndex);
                poll.votes[optionIndex]++;
                poll.totalVotes++;
                
                // Notify the voter that their vote was recorded
                socket.emit('user-voted', { pollId, optionIndex });
                
                // Broadcast updated vote counts to all participants
                peers.in(roomId).emit('poll-vote-update', {
                    pollId,
                    votes: poll.votes,
                    totalVotes: poll.totalVotes
                });
                peers.in(`poll-${roomId}`).emit('poll-vote-update', {
                    pollId,
                    votes: poll.votes,
                    totalVotes: poll.totalVotes
                });
                
                console.log(`Vote recorded for poll ${pollId}. New totals:`, poll.votes);
            } else {
                console.log(`Poll ${pollId} not found or not active`);
            }
        }
    });

    socket.on('remove-vote-poll', ({ pollId, roomId }) => {
        console.log(`Vote removal request from ${socket.id} for poll ${pollId}`);
        
        // Find the room and poll
        if (rooms[roomId] && rooms[roomId].polls) {
            const poll = rooms[roomId].polls.find(p => p.id === pollId);
            
            if (poll && poll.isActive && poll.userVotes && poll.userVotes.has(socket.id)) {
                const previousOptionIndex = poll.userVotes.get(socket.id);
                
                // Remove the vote
                poll.userVotes.delete(socket.id);
                poll.voters = poll.voters.filter(voterId => voterId !== socket.id);
                poll.votes[previousOptionIndex]--;
                poll.totalVotes--;
                
                // Notify the user that their vote was removed
                socket.emit('user-vote-removed', { pollId });
                
                // Broadcast updated vote counts to all participants
                peers.in(roomId).emit('poll-vote-update', {
                    pollId,
                    votes: poll.votes,
                    totalVotes: poll.totalVotes
                });
                peers.in(`poll-${roomId}`).emit('poll-vote-update', {
                    pollId,
                    votes: poll.votes,
                    totalVotes: poll.totalVotes
                });
                
                console.log(`Vote removed for poll ${pollId}. New totals:`, poll.votes);
            } else {
                console.log(`Poll ${pollId} not found, not active, or user hasn't voted`);
            }
        }
    });

    socket.on('change-vote-poll', ({ pollId, optionIndex, roomId }) => {
        console.log(`Vote change request from ${socket.id} for poll ${pollId}, new option ${optionIndex}`);
        
        // Find the room and poll
        if (rooms[roomId] && rooms[roomId].polls) {
            const poll = rooms[roomId].polls.find(p => p.id === pollId);
            
            if (poll && poll.isActive && poll.userVotes && poll.userVotes.has(socket.id)) {
                const previousOptionIndex = poll.userVotes.get(socket.id);
                
                // Update the vote
                poll.votes[previousOptionIndex]--;
                poll.votes[optionIndex]++;
                poll.userVotes.set(socket.id, optionIndex);
                
                // Notify the user that their vote was changed
                socket.emit('user-voted', { pollId, optionIndex });
                
                // Broadcast updated vote counts to all participants
                peers.in(roomId).emit('poll-vote-update', {
                    pollId,
                    votes: poll.votes,
                    totalVotes: poll.totalVotes
                });
                peers.in(`poll-${roomId}`).emit('poll-vote-update', {
                    pollId,
                    votes: poll.votes,
                    totalVotes: poll.totalVotes
                });
                
                console.log(`Vote changed for poll ${pollId}. New totals:`, poll.votes);
            } else {
                console.log(`Poll ${pollId} not found, not active, or user hasn't voted`);
            }
        }
    });

    socket.on('close-poll', ({ pollId, roomId }) => {
        console.log(`Poll close request from ${socket.id} for poll ${pollId}`);
        
        // Verify the requester is the host
        if (rooms[roomId] && rooms[roomId].host === socket.id && rooms[roomId].polls) {
            const poll = rooms[roomId].polls.find(p => p.id === pollId);
            
            if (poll && poll.isActive) {
                poll.isActive = false;
                poll.closedAt = new Date().toISOString();
                
                // Broadcast poll closure to all participants
                peers.in(roomId).emit('poll-closed', {
                    pollId,
                    closedAt: poll.closedAt
                });
                peers.in(`poll-${roomId}`).emit('poll-closed', {
                    pollId,
                    closedAt: poll.closedAt
                });
                
                console.log(`Poll ${pollId} closed by host`);
            }
        } else {
            console.log(`Unauthorized poll close attempt by ${socket.id}`);
        }
    });

    // Handle get-existing-polls request for late joiners
    socket.on('get-existing-polls', ({ roomId }, callback) => {
        console.log(`Get existing polls request from ${socket.id} for room ${roomId}`);
        
        if (rooms[roomId] && rooms[roomId].polls) {
            const polls = rooms[roomId].polls;
            const userVotes = {};
            
            // Collect user votes for this socket
            polls.forEach(poll => {
                if (poll.userVotes && poll.userVotes.has(socket.id)) {
                    userVotes[poll.id] = poll.userVotes.get(socket.id);
                }
            });
            
            callback({
                polls: polls,
                userVotes: userVotes
            });
            
            console.log(`Sent ${polls.length} existing polls to ${socket.id}`);
        } else {
            callback({
                polls: [],
                userVotes: {}
            });
        }
    });
    
});

// API routes should go here before the catch-all

// Serve React app for all routes (SPA support) - must be last
// Catch-all handler for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'UI', 'frontend', 'dist', 'index.html'))
})

// Initialize mediasoup on server start
initializeMediasoup().catch((error) => {
  console.error('Failed to initialize mediasoup:', error)
  process.exit(1)
})