import { useState, useEffect, useRef } from 'react'

export default function ChatBox({ isOpen, onClose, roomId, currentUserId, socket, participantProfiles }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [isConnected, setIsConnected] = useState(socket?.connected || false)
  const messagesEndRef = useRef(null)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Monitor socket connection status
  useEffect(() => {
    if (!socket) return

    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    // Set initial state
    setIsConnected(socket.connected)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
    }
  }, [socket])

  // Listen for incoming messages (always listen, even when closed)
  useEffect(() => {
    if (!socket) return

    const handleMessage = (message) => {
      setMessages(prev => [...prev, { ...message, id: Date.now() + Math.random() }])
    }

    socket.on('chat-message', handleMessage)

    return () => {
      socket.off('chat-message', handleMessage)
    }
  }, [socket]) // Removed isOpen - always listen!

  const sendMessage = () => {
    if (!newMessage.trim() || !socket || !roomId) return

    const messageData = {
      roomId,
      userId: currentUserId,
      message: newMessage.trim(),
      timestamp: new Date().toISOString()
    }

    socket.emit('send-message', messageData)
    setNewMessage('')
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const formatUserId = (userId) => {
    if (userId === currentUserId) return 'You'
    if (userId === 'Anonymous') return 'Anonymous'

    // Look up name in profiles
    if (participantProfiles) {
      if (participantProfiles instanceof Map) {
        const profile = participantProfiles.get(userId);
        if (profile && profile.name) return profile.name;
      } else {
        const profile = participantProfiles[userId];
        if (profile && profile.name) return profile.name;
      }
    }

    return `User ${userId.slice(-6)}`
  }

  if (!isOpen) return null

  return (
    <div className="chat-overlay">
      <div className="chat-container">
        <div className="chat-header">
          <h3>💬 Chat</h3>
          <div className="chat-status">
            <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
            <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
          </div>
          <button onClick={onClose} className="chat-close-btn">✕</button>
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="no-messages">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.type === 'system' ? 'system-message' : ''} ${msg.userId === currentUserId ? 'own-message' : ''}`}
              >
                {msg.type === 'system' ? (
                  <div className="system-content">
                    <span className="system-text">{msg.message}</span>
                    <span className="message-time">{formatTime(msg.timestamp)}</span>
                  </div>
                ) : (
                  <>
                    <div className="message-header">
                      <span className="message-sender">{formatUserId(msg.userId)}</span>
                      <span className="message-time">{formatTime(msg.timestamp)}</span>
                    </div>
                    <div className="message-content">{msg.message}</div>
                  </>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              disabled={!isConnected}
              rows={1}
              className="chat-input"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim() || !isConnected}
              className="send-btn"
              title="Send message"
            >
              📤
            </button>
          </div>
          <div className="chat-hint">
            Press Enter to send • Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  )
}