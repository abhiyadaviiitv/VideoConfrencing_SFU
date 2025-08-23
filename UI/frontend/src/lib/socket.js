import { io } from 'socket.io-client'
const socket = io('/mediasoup')
export default socket