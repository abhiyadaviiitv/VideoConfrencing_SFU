import { useState, useEffect, useRef } from 'react'

export default function ChatBox({ isOpen, onClose, roomId, currentUserId, socket }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const messagesEndRef = useRef(null)

  // Always listen for chat events, regardless of whether chat box is open
  useEffect(() => {
    if (roomId && socket) {
      setIsConnected(socket.connected)
      
      // Note: User is already auto-joined to chat when entering room
      // No need to emit join-chat again

      const handleConnect = () => {
        setIsConnected(true)
      }

      const handleDisconnect = () => {
        setIsConnected(false)
      }

      const handleChatMessage = (messageData) => {
        console.log('Chat message received:', messageData)
        setMessages(prev => [...prev, {
          id: Date.now() + Math.random(),
          ...messageData,
          timestamp: new Date(messageData.timestamp)
        }])
      }

      const handleUserJoinedChat = (data) => {
        setMessages(prev => [...prev, {
          id: Date.now() + Math.random(),
          type: 'system',
          message: `${data.userId} joined the chat`,
          timestamp: new Date()
        }])
      }

      const handleUserLeftChat = (data) => {
        setMessages(prev => [...prev, {
          id: Date.now() + Math.random(),
          type: 'system',
          message: `${data.userId} left the chat`,
          timestamp: new Date()
        }])
      }

      socket.on('connect', handleConnect)
      socket.on('disconnect', handleDisconnect)
      socket.on('chat-message', handleChatMessage)
      socket.on('user-joined-chat', handleUserJoinedChat)
      socket.on('user-left-chat', handleUserLeftChat)

      return () => {
        socket.off('connect', handleConnect)
        socket.off('disconnect', handleDisconnect)
        socket.off('chat-message', handleChatMessage)
        socket.off('user-joined-chat', handleUserJoinedChat)
        socket.off('user-left-chat', handleUserLeftChat)
      }
    }
  }, [roomId, socket]) // Removed isOpen dependency

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!newMessage.trim() || !isConnected || !socket) return

    const messageData = {
      roomId,
      userId: currentUserId || 'Anonymous',
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
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const formatUserId = (userId) => {
    if (userId === currentUserId) return 'You'
    if (userId === 'Anonymous') return 'Anonymous'
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