# Video Conferencing Platform - Interview Guide

## 🎯 Project Overview

**A full-stack WebRTC video conferencing application using SFU (Selective Forwarding Unit) architecture with MediaSoup.**

**Tech Stack:**
- **Frontend**: React, Socket.IO Client, MediaSoup Client
- **Backend**: Node.js, Express, Socket.IO, MediaSoup
- **Database**: PostgreSQL with Sequelize ORM
- **Authentication**: JWT, Passport.js (Local, Google OAuth, GitHub OAuth)
- **Real-time**: Socket.IO for signaling, WebRTC for media

---

## 🏗️ Architecture

### Why SFU over Mesh/MCU?

**SFU (Selective Forwarding Unit)**:
- Server forwards streams without decoding/encoding (low CPU)
- Clients handle encoding/decoding (distributes load)
- Scales to 10-50 participants
- **Better than Mesh**: No exponential bandwidth growth (N-1 connections per client)
- **Better than MCU**: Lower server CPU (no mixing/transcoding)

### High-Level Flow
```
Client A → WebRTC → MediaSoup Server (SFU) → WebRTC → Client B,C,D
              ↓                                   ↑
         Socket.IO (signaling)            Socket.IO (signaling)
```

---

## 🔐 Authentication System

### Flow
```
1. User → POST /api/auth/login → Server validates password (bcrypt)
2. Server generates JWT (userId + email)
3. JWT stored in localStorage
4. Protected routes verify JWT via middleware
```

### OAuth Integration
- **Google/GitHub**: Passport.js strategies
- **Session Management**: Express sessions with PostgreSQL store
- **Token Exchange**: OAuth tokens → User profile → JWT

**Code Location:** 
- Routes: `routes/auth.js`
- Middleware: `middleware/auth.js`
- Strategies: `config/passport.js`

---

## 📡 Real-Time Communication

### Socket.IO Events

**Room Management:**
```javascript
socket.on('joinRoom', { roomId })
  → Server adds socket to room
  → Emits 'participant-joined' to others
  → Returns { participants, hostId }
```

**MediaSoup Signaling:**
```javascript
socket.on('getRouterRtpCapabilities')
  → Returns server RTP capabilities
  
socket.on('createProducerTransport')
  → Creates WebRTC transport in MediaSoup
  → Returns { id, iceParameters, dtlsParameters }
  
socket.on('connectProducerTransport', { dtlsParameters })
  → Connects transport
  
socket.on('produce', { kind, rtpParameters })
  → Creates producer (audio/video)
  → Broadcasts 'newProducer' to room
  
socket.on('consume', { producerId, rtpCapabilities })
  → Creates consumer for remote stream
  → Returns consumer parameters
```

**Chat & Polls:**
```javascript
socket.on('send-message', { roomId, message })
  → Broadcast to room
  
socket.on('create-poll', { roomId, question, options })
  → Save to DB → Broadcast to room
```

**Code Location:** `app.js` (lines 400-1600)

---

## 🎥 MediaSoup Pipeline

### 1. Device Creation (Client)
```javascript
const device = new Device();
await device.load({ routerRtpCapabilities });
```

### 2. Create Transports
**Send Transport (for publishing):**
```javascript
const transport = await device.createSendTransport(params);
transport.on('connect', ({ dtlsParameters }, callback) => {
  socket.emit('connectProducerTransport', { dtlsParameters });
});
```

**Receive Transport (for consuming):**
```javascript
const recvTransport = await device.createRecvTransport(params);
```

### 3. Produce Media
```javascript
const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
const videoProducer = await transport.produce({
  track: stream.getVideoTracks()[0],
  kind: 'video'
});
```

### 4. Consume Remote Media
```javascript
const consumer = await recvTransport.consume({
  id, producerId, kind, rtpParameters
});
const stream = new MediaStream([consumer.track]);
videoElement.srcObject = stream;
```

**Code Location:**
- Client: `UI/frontend/src/pages/Room.jsx` (functions: `createDevice`, `createSendTransport`, `getLocalStream`)
- Server: `app.js` (MediaSoup router initialization)

---

## 🎬 Screen Sharing

### Implementation
```javascript
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: {
    echoCancellation: false,  // Critical for system audio
    noiseSuppression: false,
    autoGainControl: false    // Prevents volume pumping
  }
});

const screenProducer = await producerTransport.produce({
  track: stream.getVideoTracks()[0],
  appData: { mediaType: 'screenShare' } // Tag for identification
});
```

**Audio Processing Decision:**
- **Disabled AGC/echo cancellation for system audio** to preserve original quality
- Prevents "pumping" effect on music/videos

**Code Location:** `Room.jsx:1026-1122` (`toggleScreenShare`)

---

## 💾 Database Schema

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  avatar_url TEXT,
  oauth_provider VARCHAR(50),
  created_at TIMESTAMP
);
```

### Polls Table
```sql
CREATE TABLE polls (
  id SERIAL PRIMARY KEY,
  room_code VARCHAR(255),
  question TEXT,
  options JSONB,        -- [{text, votes: 0}]
  votes JSONB,          -- {userId: optionIndex}
  created_by INTEGER REFERENCES users(id),
  is_closed BOOLEAN
);
```

**ORM:** Sequelize (models in `models/` directory)

---

## 🎨 Key Features Implementation

### 1. Participant Profiles
**Challenge:** Display names instead of socket IDs

**Solution:**
```javascript
// Server stores mapping
const peerInfo = new Map(); // socketId → {name, email, userId}

// Client fetches on join
socket.emit('get-participant-profiles', { roomId }, (profiles) => {
  setParticipantProfiles(new Map(Object.entries(profiles)));
});
```

**Code:** `app.js:260-280`, `Room.jsx:1372-1382`

### 2. Hand Raise
**Implementation:**
```javascript
// Client emits
socket.emit('raise-hand', { roomId, userName });

// Server broadcasts to all
io.to(roomId).emit('hand-raised', { userId, userName, timestamp });

// Auto-lower after 10s
setTimeout(() => {
  socket.emit('lower-hand', { roomId });
}, 10000);
```

**UI:** Shows ✋ indicator on video tile

**Code:** `Room.jsx:1858-1876`, `app.js:1352-1380`

### 3. Active Speaker Detection
**MediaSoup Feature:**
```javascript
// Server creates AudioLevelObserver
const audioObserver = await router.createAudioLevelObserver({
  maxEntries: 1,
  threshold: -50,  // dBov
  interval: 300    // ms
});

audioObserver.on('volumes', (volumes) => {
  const loudestPeerId = volumes[0].producer.appData.peerId;
  io.to(roomId).emit('active-speaker', { peerId: loudestPeerId });
});
```

**Code:** `app.js:1120-1160`

---

## 🎙️ Recording System (Planned)

### Canvas-Based Recording
**Why Canvas?**
- Can record while presenting (no `getDisplayMedia` conflict)
- Captures exactly what user sees (grid layout)
- Full control over layout

**Implementation Logic:**
```javascript
// 1. Create canvas
const canvas = document.createElement('canvas');
canvas.width = 1920; canvas.height = 1080;

// 2. Draw all videos in animation loop
function drawFrame() {
  const videos = document.querySelectorAll('video');
  videos.forEach((video, i) => {
    ctx.drawImage(video, x, y, w, h); // Grid positions
  });
  requestAnimationFrame(drawFrame);
}

// 3. Capture stream
const stream = canvas.captureStream(30); // 30fps

// 4. Mix audio
const audioContext = new AudioContext();
const destination = audioContext.createMediaStreamDestination();
allAudioTracks.forEach(track => {
  const source = audioContext.createMediaStreamSource(new MediaStream([track]));
  source.connect(destination);
});

// 5. Record
const recorder = new MediaRecorder(combinedStream);
```

**Upload:** POST blob to `/api/recordings/upload` → Save as WebM

---

## 🚀 Scalability & Performance

### Current Limitations
- **Single Worker**: One MediaSoup worker per server
- **Max Participants**: ~20-30 per room (limited by client bandwidth)

### Scaling Strategies (Interview Answer)
1. **Horizontal Scaling**: Multiple servers with Redis for session sharing
2. **Worker Pool**: Multiple MediaSoup workers per server (utilize all CPU cores)
3. **Room Sharding**: Distribute rooms across servers
4. **Simulcast**: Multiple quality layers (not implemented yet)
5. **Recording Offload**: Separate recording service

### Performance Optimizations
- **Lazy Loading**: Remote videos only created when consumed
- **Pause/Resume**: Pause video producers when off-screen
- **Bitrate Adaptation**: MediaSoup handles automatically

---

## 🐛 Challenges & Solutions

### 1. Names Not Showing (Fixed)
**Problem:** Video tiles showed client IDs instead of names

**Solution:** 
- Implemented `participantProfiles` Map (socket → profile)
- Server broadcasts profile updates on join
- Client looks up names via `getParticipantName(peerId)`

### 2. Audio Volume Fluctuations (Fixed)
**Problem:** System audio (music/videos) had pumping effect

**Solution:** 
- Disabled `autoGainControl` for screen share audio
- Prevents browser from normalizing loudness

### 3. HTTPS Requirement (Fixed)
**Problem:** getUserMedia requires HTTPS

**Solution:**
- Generated self-signed certificates (`localhost.crt`, `localhost-key.pem`)
- Configured Vite and Express with HTTPS
- Used `httpolyglot` for dual HTTP/HTTPS

**Code:** `vite.config.js`, `app.js:1-30`

---

## 🔒 Security Considerations

1. **JWT Secrets**: Stored in `.env` (never commit!)
2. **Password Hashing**: bcrypt with 10 rounds
3. **Input Validation**: Sanitize chat messages, poll options
4. **CORS**: Configured for frontend origin only
5. **Rate Limiting**: (TODO - add express-rate-limit)

---

## 📁 Project Structure

```
VideoConfrencing_SFU/
├── app.js                 # Main server (Express + Socket.IO + MediaSoup)
├── models/                # Sequelize models (User, Poll)
├── routes/                # REST API routes (auth, users)
├── middleware/            # Auth middleware
├── config/                # Passport, database config
├── services/              # BotRecorder (unused)
├── uploads/               # User avatars, recordings
├── UI/frontend/
│   ├── src/
│   │   ├── pages/Room.jsx      # Main meeting room component
│   │   ├── components/         # Chat, Polls, HandRaise
│   │   └── index.css           # Global styles
│   └── vite.config.js          # HTTPS config
└── package.json
```

---

## 🎤 Interview Questions You Can Answer

### "Walk me through the WebRTC connection flow"
1. Client requests RTP capabilities from server
2. Client creates MediaSoup Device with capabilities
3. Client creates Send Transport (for publishing)
4. Client calls getUserMedia → produces media → sends to server
5. Server broadcasts "newProducer" event to room
6. Other clients create Receive Transport
7. Other clients consume the producer → display video

### "How does screen sharing work?"
Uses `getDisplayMedia` API → creates producer with `appData: {mediaType: 'screenShare'}` → server/clients identify it via appData → displayed differently (larger size, green border)

### "Why MediaSoup over simple WebRTC?"
Simple WebRTC (mesh) requires N*(N-1)/2 connections. With 10 users = 45 connections. MediaSoup (SFU) requires each client to send 1 stream to server, server forwards to N-1 clients. Server handles routing, scales better.

### "How do you handle user authentication?"
JWT-based auth. User logs in → server validates → generates JWT → client stores in localStorage → sends JWT in Socket.IO handshake headers → server verifies on each socket connection.

### "What's the biggest challenge you faced?"
HTTPS setup for getUserMedia on local network. Had to generate self-signed certificates, configure both Vite and Express, handle browser warnings. Also audio AGC causing quality issues took debugging.

---

## 🚀 Future Enhancements (Mention in Interview)

1. **Recording**: Canvas-based client-side recording (planned)
2. **Chat Persistence**: Save messages to database
3. **Breakout Rooms**: Multiple isolated rooms
4. **Virtual Backgrounds**: Canvas processing with TensorFlow.js
5. **Whiteboard**: Shared canvas with Socket.IO sync
6. **Analytics**: Track call quality, participants, duration
7. **Simulcast**: Multiple quality layers for adaptive streaming

---

## 💡 Key Talking Points

✅ "Used SFU architecture for better scalability than mesh topology"
✅ "Implemented real-time signaling with Socket.IO for WebRTC negotiation"  
✅ "Handled HTTPS requirements for getUserMedia with self-signed certs"  
✅ "Optimized audio quality by disabling AGC for system audio"  
✅ "Used JWT for stateless authentication across HTTP and WebSocket"  
✅ "Implemented OAuth for social login (Google/GitHub)"  
✅ "Real-time features: chat, polls, hand raise, active speaker detection"  
✅ "Planned canvas-based recording to avoid browser limitations"

---

**Pro Tip for Interview:**
When asked "What would you do differently?", mention:
- Add Redis for session sharing (horizontal scaling)
- Implement Simulcast for adaptive quality
- Add reconnection logic for network interruptions
- Use TypeScript for better type safety
- Add E2E encryption for privacy
