import { io } from 'socket.io-client'

const API_BASE = 'http://localhost:4000'

// Dynamic token retrieval function
const getToken = () => localStorage.getItem('token')

// Create socket connection with authentication and absolute URL (fix SSL/cross-origin)
const socket = io(`${API_BASE}/mediasoup`, {
  withCredentials: true,
  transports: ['websocket', 'polling'], // Add polling as fallback
  auth: { 
    get token() { return getToken() } // Dynamic token retrieval
  },
  extraHeaders: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  autoConnect: false // Don't connect automatically
})

// Enhanced connection error handling
socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error.message)
  
  // Handle specific authentication errors
  const authErrors = [
    'Authentication token required',
    'Authentication failed',
    'Token expired',
    'Invalid token',
    'Invalid token structure'
  ]
  
  if (authErrors.includes(error.message)) {
    console.log('Authentication failed, clearing token and redirecting to login')
    localStorage.removeItem('token')
    
    // Show user-friendly message
    if (error.message === 'Token expired') {
      alert('Your session has expired. Please log in again.')
    } else if (error.message === 'Invalid token') {
      alert('Invalid authentication. Please log in again.')
    }
    
    window.location.href = '/auth'
  } else if (error.message === 'Server configuration error') {
    console.error('Server configuration issue detected')
    alert('Server configuration error. Please contact support.')
  } else {
    console.error('Connection failed:', error.message)
    // Don't redirect for network errors, allow reconnection
  }
})

socket.on('connect', () => {
  console.log('Socket connected successfully')
})

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason)
})

// Function to connect socket with token
export const connectSocket = (token) => {
  if (token) {
    socket.auth = { token }
    socket.connect()
  }
}

// Function to reconnect socket with new token
export const reconnectSocket = (newToken) => {
  if (socket.connected) {
    socket.disconnect()
  }
  
  // Update socket connection with new token
  socket.auth = { token: newToken }
  socket.io.uri = `${API_BASE}/mediasoup`
  socket.connect()
}

// Make reconnection function available globally
window.socketReconnect = reconnectSocket
window.connectSocket = connectSocket

export default socket