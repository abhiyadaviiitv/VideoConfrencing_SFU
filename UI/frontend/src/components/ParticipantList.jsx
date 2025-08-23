/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react'

export default function ParticipantList({ isOpen, onClose, roomId, currentUserId, isHost, hostId, participants = [], onRemoveParticipant, onMuteParticipant }) {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (isOpen && roomId) {
      setIsConnected(true)
    } else {
      setIsConnected(false)
    }
  }, [isOpen, roomId])

  const formatJoinTime = (timestamp) => {
    const now = new Date()
    const diff = Math.floor((now - timestamp) / (1000 * 60)) // minutes
    console.log(diff);
    if (diff < 1) return 'Just joined'
    if (diff === 1) return '1 minute ago'
    if (diff < 60) return `${diff} minutes ago`
    
    const hours = Math.floor(diff / 60)
    if (hours === 1) return '1 hour ago'
    return `${hours} hours ago`
  }

  const getParticipantStatus = (participant) => {
    const statuses = []
    if (participant.isHost) statuses.push('Host')
    if (participant.isMuted) statuses.push('Muted')
    if (participant.isCameraOff) statuses.push('Camera off')
    return statuses.join(' • ')
  }

  if (!isOpen) return null

  return (
    <div className="participant-overlay">
      <div className="participant-container">
        <div className="participant-header">
          <h3>👥 Participants ({participants.length})</h3>
          <div className="participant-status">
            <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
            <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
          </div>
          <button onClick={onClose} className="participant-close-btn">✕</button>
        </div>

        <div className="participant-list">
          {participants.length === 0 ? (
            <div className="no-participants">
              <p>No participants found</p>
            </div>
          ) : (
            participants.map((participant) => (
              <div 
                key={participant.id} 
                className={`participant-item ${participant.id === currentUserId ? 'current-user' : ''} ${participant.isHost ? 'host-participant' : ''}`}
              >
                <div className="participant-avatar">
                  <div className="avatar-circle">
                    {participant.id === hostId ? '👑' : '👤'}
                  </div>
                  <div className="participant-indicators">
                    {participant.isMuted && <span className="indicator muted">🔇</span>}
                    {participant.isCameraOff && <span className="indicator camera-off">📷</span>}
                  </div>
                </div>
                
                <div className="participant-info">
                  <div className="participant-name">
                    {participant.name}
                    {participant.id === currentUserId && <span className="you-badge"> (You)</span>}
                  </div>
                  <div className="participant-details">
                    <span className="join-time">{formatJoinTime(participant.joinedAt)}</span>
                    {getParticipantStatus(participant) && (
                      <span className="participant-status-text"> • {getParticipantStatus(participant)}</span>
                    )}
                  </div>
                  <div className="participant-id">ID: {participant.id.slice(-8)}</div>
                </div>
                
                <div className="participant-actions">
                  {isHost && participant.id !== currentUserId && (
                    <>

                      <button 
                        className="action-btn remove-btn"
                        title="Remove participant"
                        onClick={() => onRemoveParticipant && onRemoveParticipant(participant.id)}
                      >
                        🚫
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="participant-footer">
          <div className="room-info">
            <span className="room-label">Room ID:</span>
            <span className="room-id">{roomId}</span>
          </div>
          {isHost && (
            <div className="host-controls">
              <button className="host-action-btn">
                📋 Copy Invite Link
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}