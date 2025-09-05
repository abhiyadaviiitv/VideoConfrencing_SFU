
import dotenv from 'dotenv'
// Load environment variables first
dotenv.config()

import pgSession from 'connect-pg-simple'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import session from 'express-session'
import fs from 'fs'
import http from 'http'
import jwt from 'jsonwebtoken'
import mediasoup from 'mediasoup'
import path from 'path'
import { Server } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'
import passport from './config/passport.js'
import { Poll } from './models/Poll.js'
import { User } from './models/User.js'
import authRoutes from './routes/auth.js'

const __dirname = path.resolve()
const app = express()
const PORT = process.env.PORT || 4000

// Validate required environment variables
const validateEnvironment = () => {
  const requiredVars = ['JWT_SECRET', 'PG_SESSION_CONSTRING']
  const missing = requiredVars.filter(varName => !process.env[varName])
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:')
    missing.forEach(varName => {
      console.error(`   - ${varName}`)
    })
    console.error('\nPlease check your .env file and ensure all required variables are set.')
    process.exit(1)
  }
  
  console.log('✅ All required environment variables are set')
}

// Validate environment on startup
validateEnvironment()

// Middleware - Enhanced CORS configuration
const allowedOrigins = [
  'http://localhost:5173', // Vite dev server
  process.env.FRONTEND_URL
].filter(Boolean) // Remove undefined values

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true)
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    
    // Allow localhost with any port in development
    if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) {
      return callback(null, true)
    }
    
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// Trust proxy for correct secure cookies/redirects behind SSL proxies
app.set('trust proxy', 1)

// Session configuration
const PostgresStore = pgSession(session)
app.use(session({
          store: new PostgresStore({
          conString: process.env.PG_SESSION_CONSTRING,
          tableName: 'sessions',
          ssl: {
            rejectUnauthorized: false
          }
        }),
  secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}))

// Initialize Passport
app.use(passport.initialize())
app.use(passport.session())

// Initialize database tables
const initializeDatabase = async () => {
  try {
    await User.createTable()
    await Poll.createTables()
    console.log('Database tables initialized')
  } catch (error) {
    console.error('Database initialization error:', error)
  }
}

// Create uploads directory if it doesn't exist
const createUploadsDirectory = () => {
  const uploadsDir = path.join(__dirname, 'uploads', 'avatars')
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
    console.log('Uploads directory created')
  }
}

// Initialize directories and database
createUploadsDirectory()
initializeDatabase()

// Auth routes
app.use('/auth', authRoutes)

// Serve uploads directory for avatars
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Serve React build files
app.use(express.static(path.join(__dirname, 'UI', 'frontend', 'dist')))

// HTTP server (for development)
const httpServer = http.createServer(app)
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})

// Socket.io setup with authentication middleware
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true)
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      
      // Allow localhost with any port in development
      if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) {
        return callback(null, true)
      }
      
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
    methods: ["GET", "POST"]
  }
})

// Enhanced authentication middleware for Socket.io
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token
    
    // Check if token exists
    if (!token || token === 'null' || token === 'undefined') {
      console.log('Socket connection rejected: No valid token provided')
      return next(new Error('Authentication token required'))
    }
    
    // Validate JWT_SECRET exists
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET environment variable not set')
      return next(new Error('Server configuration error'))
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    // Validate decoded token structure
    if (!decoded.id) {
      console.error('Invalid token structure: missing user ID')
      return next(new Error('Invalid token structure'))
    }
    
    socket.userId = decoded.id
    console.log(`Socket authenticated for user: ${decoded.id}`)
    next()
  } catch (error) {
    console.error('Socket authentication failed:', {
      error: error.message,
      tokenProvided: !!socket.handshake.auth.token,
      jwtSecretExists: !!process.env.JWT_SECRET
    })
    
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Token expired'))
    } else if (error.name === 'JsonWebTokenError') {
      return next(new Error('Invalid token'))
    }
    
    next(new Error('Authentication failed'))
  }
}

const peers = io.of('/mediasoup')
peers.use(authenticateSocket)

// Mediasoup variables (per room)
const rooms = {};
// Store room data: { roomId: { router, transports: { socketId: { producerTransport, consumerTransport } }, producers: { producerId: producer }, consumers: { consumerId: consumer } } }

// Socket ID to user profile mapping
const socketProfiles = new Map();
// Store socket.id -> { name, avatar_url, userId } mapping

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

  // Handle user profile registration
  socket.on('register-profile', async ({ token, roomId }) => {
    try {
      const jwt = await import('jsonwebtoken')
      const decoded = jwt.default.verify(token, process.env.JWT_SECRET)
      const userId = decoded.id
      
      // Get user profile from database
      try {
        const user = await User.findById(userId)
        if (user) {
          socketProfiles.set(socket.id, {
            name: user.name,
            avatar_url: user.avatar_url,
            userId: user.id
          })
          console.log(`Profile registered for socket ${socket.id}: ${user.name}`)
          socket.emit('profile-registered', { success: true })
          
          // Emit profile update to all participants in the room
          if (roomId && rooms[roomId]) {
            const profile = {
              name: user.name,
              avatar_url: user.avatar_url,
              userId: user.id
            }
            socket.to(roomId).emit('profile-updated', { socketId: socket.id, profile })
            
            // Also send updated profiles map to all participants
            const profiles = {}
            const socketsInRoom = peers.adapter.rooms.get(roomId)
            if (socketsInRoom) {
              socketsInRoom.forEach(socketId => {
                const socketProfile = socketProfiles.get(socketId)
                if (socketProfile) {
                  profiles[socketId] = socketProfile
                }
              })
            }
            peers.to(roomId).emit('participant-profiles-updated', profiles)
          }
        } else {
          socket.emit('profile-registered', { success: false, error: 'User not found' })
        }
      } catch (error) {
        console.error('Error fetching user profile:', error)
        socket.emit('profile-registered', { success: false, error: 'Database error' })
      }
    } catch (error) {
      console.error('Invalid token:', error)
      socket.emit('profile-registered', { success: false, error: 'Invalid token' })
    }
  })

  // Handle getting participant profiles for a room
  socket.on('get-participant-profiles', ({ roomId }, callback) => {
    console.log("trying to get the user profile");
    const profiles = {}
    if (rooms[roomId]) {
      // Get all socket IDs in the room
      const socketsInRoom = io.of('/mediasoup').adapter.rooms.get(roomId)
      if (socketsInRoom) {
        socketsInRoom.forEach(socketId => {
          const profile = socketProfiles.get(socketId)
          console.log(profile);
          if (profile) {
            profiles[socketId] = profile
          }
        })
      }
    }
    callback(profiles)
  })
socket.on('disconnect', () => {
  console.log(`Client disconnected: ${socket.id}`);
  
  // Clean up profile mapping
  socketProfiles.delete(socket.id);

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
    
    // Remove user information
    room.peerInfo.delete(socket.id);

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
      peerInfo: new Map(), // Store participant info (socketId -> userInfo)
      audioLevelObserver, // keep reference so we can add producers later
      host: socket.id // Track the room creator as host
    };
    
    // Auto-join the room after creation to maintain same socket connection
    rooms[roomId].peers.add(socket.id);
    socket.join(roomId);
    
    // Store user information for the host (creator)
    // Note: We'll get userInfo from the frontend when they actually join the room
    // For now, we'll store a placeholder that will be updated when they join
    
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

    // Get all participants in a room
    socket.on('getParticipants', ({ roomId }, callback) => {
        if (!rooms[roomId]) {
            callback({ error: 'Room does not exist' });
            return;
        }
        
        const room = rooms[roomId];
        const participants = [];
        
        room.peers.forEach(peerId => {
            const userInfo = room.peerInfo.get(peerId) || { name: 'Anonymous', email: '' };
            participants.push({
                id: peerId,
                name: userInfo.name,
                email: userInfo.email,
                isHost: peerId === room.host
            });
        });
        
        callback({ 
            error: null, 
            participants 
        });
    });

    socket.on('joinRoom', async ({ roomId, isHostReconnecting, userInfo }, callback) => {
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
            
            // Store user information
            if (userInfo) {
                rooms[roomId].peerInfo.set(socket.id, userInfo);
                console.log(`Stored user info for ${socket.id}:`, userInfo);
            }
            
            // Auto-join chat so no messages are missed
            socket.join(`chat-${roomId}`);
            console.log(`Socket ${socket.id} auto-joined chat for room ${roomId}`);
            
            // Auto-join polls so no polls are missed
            console.log(`Socket ${socket.id} auto-joined polls for room ${roomId}`);
            
            const isHost = rooms[roomId].host === socket.id;
            console.log(`${socket.id} joined room: ${roomId}${isHost ? ' (host)' : ''} - Host ID: ${rooms[roomId].host}`);
            
            // Send existing polls to the newly joined user
            try {
                const polls = await Poll.findByRoomId(roomId);
                if (polls && polls.length > 0) {
                    for (const poll of polls) {
                        socket.emit('poll-created', poll);
                        
                        // Check if this user has already voted on this poll
                        const vote = poll.userVotes.get(socket.id);
                        if (vote) {
                            socket.emit('user-voted', { pollId: poll.id, optionIndex: vote.option_index });
                            console.log(`Restored vote for user ${socket.id} on poll ${poll.id}, option ${vote.option_index}`);
                        }
                    }
                    console.log(`Sent ${polls.length} existing polls to ${socket.id}`);
                }
            } catch (error) {
                console.error('Error loading polls for new user:', error);
            }
            
            // Notify existing participants about the new participant
            socket.to(roomId).emit('participant-joined', {
                participantId: socket.id,
                userInfo: userInfo || { name: 'Anonymous', email: '' },
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
    socket.on('create-poll', async (pollData) => {
        console.log(`Poll created by ${socket.id} in room ${pollData.roomId}:`, pollData.question);
        
        // Verify the creator is in the room and is the host
        if (rooms[pollData.roomId] && rooms[pollData.roomId].host === socket.id) {
            try {
                // Get user ID from socket profile
                const userProfile = socketProfiles.get(socket.id);
                const userId = userProfile ? userProfile.userId : null;
                
                // Store poll in database using the create method
                const poll = await Poll.create({
                  id: pollData.id,
                  roomId: pollData.roomId,
                  question: pollData.question,
                  options: pollData.options,
                  createdBy: userId || socket.id,
                  isActive: true,
                  duration: pollData.duration || 0,
                  isAnonymous: pollData.isAnonymous || false,
                  allowMultiple: pollData.allowMultiple || false
                });
                
                // Create the poll object to broadcast (matching client expectations)
                const broadcastPoll = {
                  id: pollData.id,
                  roomId: pollData.roomId,
                  question: pollData.question,
                  options: pollData.options,
                  createdBy: userProfile ? userProfile.name : `User ${socket.id.slice(-6)}`,
                  createdBySocketId: socket.id, // Keep socket ID for internal use
                  createdAt: new Date().toISOString(),
                  isActive: true,
                  totalVotes: 0,
                  votes: new Array(pollData.options.length).fill(0),
                  userVotes: {},
                  duration: pollData.duration || 0,
                  isAnonymous: pollData.isAnonymous || false,
                  allowMultiple: pollData.allowMultiple || false
                };
                
                // Broadcast poll to all participants in the room
                peers.in(pollData.roomId).emit('poll-created', broadcastPoll);
                console.log(`Poll ${pollData.id} created and broadcasted to room ${pollData.roomId}`);
            } catch (error) {
                console.error('Error creating poll:', error);
            }
        } else {
            console.log(`Unauthorized poll creation attempt by ${socket.id}`);
        }
    });

    socket.on('vote-poll', async ({ pollId, optionIndex, roomId }) => {
        console.log(`Vote received from ${socket.id} for poll ${pollId}, option ${optionIndex}`);
        
        try {
            // Get the poll to check if user has already voted
            const poll = await Poll.findById(pollId);
            if (!poll) {
                console.log(`Poll ${pollId} not found`);
                return;
            }
            
            // Check if user has already voted by looking at userVotes
            const existingVote = poll.userVotes[socket.id];
            if (existingVote !== undefined) {
                console.log(`User ${socket.id} has already voted on poll ${pollId}`);
                return;
            }
            
            // Record the vote in database
            const updatedPoll = await Poll.vote(pollId, null, socket.id, optionIndex);
            
            // Immediately notify the voter that their vote was recorded
            socket.emit('user-voted', { pollId, optionIndex });
            
            // Broadcast updated vote counts to all participants immediately
            peers.in(roomId).emit('poll-vote-update', {
                pollId,
                votes: updatedPoll.votes,
                totalVotes: updatedPoll.totalVotes,
                userVotes: updatedPoll.userVotes
            });
            
            console.log(`Vote recorded for poll ${pollId}. New totals:`, updatedPoll.votes);
        } catch (error) {
            console.error('Error voting on poll:', error);
            // Send error back to client
            socket.emit('poll-vote-error', { error: error.message });
        }
    });

    socket.on('remove-vote-poll', async ({ pollId, roomId }) => {
        console.log(`Vote removal request from ${socket.id} for poll ${pollId}`);
        
        try {
            // Get the poll to check if user has voted
            const poll = await Poll.findById(pollId);
            if (!poll) {
                console.log(`Poll ${pollId} not found`);
                return;
            }
            
            // Check if user has voted
            const existingVote = poll.userVotes[socket.id];
            if (existingVote === undefined) {
                console.log(`User ${socket.id} hasn't voted on poll ${pollId}`);
                return;
            }
            
            // Remove the vote from database
            const updatedPoll = await Poll.removeVote(pollId, null, socket.id);
            
            // Notify the user that their vote was removed
            socket.emit('user-vote-removed', { pollId });
            
            // Broadcast updated vote counts to all participants
            peers.in(roomId).emit('poll-vote-update', {
                pollId,
                votes: updatedPoll.votes,
                totalVotes: updatedPoll.totalVotes
            });
            
            console.log(`Vote removed for poll ${pollId}. New totals:`, updatedPoll.votes);
        } catch (error) {
            console.error('Error removing vote:', error);
        }
    });

    socket.on('change-vote-poll', async ({ pollId, optionIndex, roomId }) => {
        console.log(`Vote change request from ${socket.id} for poll ${pollId}, new option ${optionIndex}`);
        
        try {
            // Get the poll to check if user has voted
            const poll = await Poll.findById(pollId);
            if (!poll) {
                console.log(`Poll ${pollId} not found`);
                return;
            }
            
            // Check if user has voted
            const existingVote = poll.userVotes[socket.id];
            if (existingVote === undefined) {
                console.log(`User ${socket.id} hasn't voted on poll ${pollId}`);
                return;
            }
            
            // Change vote (the vote method handles updating existing votes)
            const updatedPoll = await Poll.vote(pollId, null, socket.id, optionIndex);
            
            // Notify the user that their vote was changed
            socket.emit('user-voted', { pollId, optionIndex });
            
            // Broadcast updated vote counts to all participants
            peers.in(roomId).emit('poll-vote-update', {
                pollId,
                votes: updatedPoll.votes,
                totalVotes: updatedPoll.totalVotes
            });
            
            console.log(`Vote changed for poll ${pollId}. New totals:`, updatedPoll.votes);
        } catch (error) {
            console.error('Error changing vote:', error);
        }
    });

    socket.on('close-poll', async ({ pollId, roomId }) => {
        console.log(`Poll close request from ${socket.id} for poll ${pollId}`);
        
        // Verify the requester is the host
        if (rooms[roomId] && rooms[roomId].host === socket.id) {
            try {
                // Close poll in database
                await Poll.close(pollId);
                
                // Broadcast poll closure to all participants
                peers.in(roomId).emit('poll-closed', {
                    pollId,
                    closedAt: new Date().toISOString()
                });
                
                console.log(`Poll ${pollId} closed by host`);
            } catch (error) {
                console.error('Error closing poll:', error);
            }
        } else {
            console.log(`Unauthorized poll close attempt by ${socket.id}`);
        }
    });

    // Auto-close polls when timer expires
    socket.on('poll-timer-expired', async ({ pollId, roomId }) => {
        console.log(`Poll timer expired for ${pollId} in room ${roomId}`);
        
        try {
            // Close poll in database
            await Poll.close(pollId);
            
            // Broadcast poll closure to all participants
            peers.in(roomId).emit('poll-closed', {
                pollId,
                closedAt: new Date().toISOString()
            });
            
            console.log(`Poll ${pollId} auto-closed due to timer expiration`);
        } catch (error) {
            console.error('Error auto-closing poll:', error);
        }
    });

    // Handle get-existing-polls request for late joiners
    socket.on('get-existing-polls', async ({ roomId }, callback) => {
        console.log(`Get existing polls request from ${socket.id} for room ${roomId}`);
        
        try {
            // Get polls from database
            const polls = await Poll.findByRoomId(roomId);
            const userVotes = {};
            
            // Get user votes for each poll
            for (const poll of polls) {
                const vote = poll.userVotes.get(socket.id);
                if (vote !== undefined) {
                    userVotes[poll.id] = vote;
                }
            }
            
            callback({
                polls: polls,
                userVotes: userVotes
            });
            
            console.log(`Sent ${polls.length} existing polls to ${socket.id}`);
        } catch (error) {
            console.error('Error getting existing polls:', error);
            callback({
                polls: [],
                userVotes: {}
            });
        }
    });
    
});

// Serve React app for all routes (SPA support) - must be last
// Catch-all handler for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'UI', 'frontend', 'dist', 'index.html'))
})

// Initialize everything on server start
const initializeServer = async () => {
  try {
    await initializeMediasoup()
    console.log('Server initialized successfully')
  } catch (error) {
    console.error('Server initialization failed:', error)
    process.exit(1)
  }
}

initializeServer()