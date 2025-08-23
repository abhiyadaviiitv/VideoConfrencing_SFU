import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../lib/socket'
import ScheduleMeetingModal from '../components/ScheduleMeetingModal'

export default function Lobby() {
  const [roomId, setRoomId] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [localStream, setLocalStream] = useState(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isMicEnabled, setIsMicEnabled] = useState(true)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const videoRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    // Check socket connection status
    const checkConnection = () => {
      setIsConnected(socket.connected)
    }

    socket.on('connect', () => {
      console.log('Socket connected to server')
      setIsConnected(true)
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected from server')
      setIsConnected(false)
    })

    socket.on('connection-success', ({ socketId }) => {
      console.log('Connected with socket ID:', socketId)
      setIsConnected(true)
    })

    // Initial connection check
    checkConnection()

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('connection-success')
    }
  }, [])

  // Initialize local media stream
  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        })
        setLocalStream(stream)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (error) {
        console.error('Error accessing media devices:', error)
      }
    }

    initializeMedia()

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Update video ref when stream changes
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream
    }
  }, [localStream])

  const createRoom = async () => {
    if (!isConnected) {
      alert('Not connected to server. Please wait and try again.')
      return
    }

    setIsCreating(true)
    try {
      socket.emit('createRoom', (response) => {
        setIsCreating(false)
        if (response.error) {
          console.error('Error creating room:', response.error)
          alert('Failed to create room: ' + response.error)
          return
        }
        console.log('Room created and auto-joined successfully:', response.roomId, 'isHost:', response.isHost)
        
        // Store host socket ID in localStorage when creating room
        if (response.isHost && response.roomId) {
          localStorage.setItem(`room_${response.roomId}_host_socket`, socket.id)
          // Store a flag indicating this user was the host
          localStorage.setItem(`room_${response.roomId}_was_host`, 'true')
          // Store host ID for consistency
          localStorage.setItem(`room_${response.roomId}_host_id`, response.hostId)
          console.log('Host socket ID stored in localStorage:', socket.id)
        }
        
        // Navigate to room - no need for separate joinRoom call since auto-joined
        navigate(`/room/${response.roomId}?autoJoined=true`)
      })
    } catch (error) {
      setIsCreating(false)
      console.error('Error in createRoom:', error)
      alert('Failed to create room. Please try again.')
    }
  }

  const joinRoom = async () => {
    if (!roomId.trim()) {
      alert('Please enter a room code')
      return
    }

    if (!isConnected) {
      alert('Not connected to server. Please wait and try again.')
      return
    }

    setIsJoining(true)
    try {
      socket.emit('joinRoom', { roomId: roomId.trim() }, (response) => {
        setIsJoining(false)
        if (response.error) {
          console.error('Error joining room:', response.error)
          alert('Failed to join room: ' + response.error)
          return
        }
        console.log('Successfully joined room:', roomId)
        navigate(`/room/${roomId.trim()}`)
      })
    } catch (error) {
      setIsJoining(false)
      console.error('Error in joinRoom:', error)
      alert('Failed to join room. Please try again.')
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }

  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMicEnabled(audioTrack.enabled)
      }
    }
  }

  const scheduleNewMeeting = () => {
    setIsScheduleModalOpen(true)
  }

  const handleScheduleMeeting = (meetingData) => {
    console.log('Meeting scheduled:', meetingData)
    // In a real application, this would sync with a calendar service
    // For now, we'll just show a success message
  }

  const closeScheduleModal = () => {
    setIsScheduleModalOpen(false)
  }

  return (
    <div className="new-lobby-container">
      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-content">
          <h1>Connect with <span className="highlight">anyone,</span></h1>
          <h1><span className="highlight">anywhere</span></h1>
          <p className="hero-subtitle">
            Experience crystal-clear video calls with our next-generation
            conferencing platform. Built for teams that value seamless
            collaboration.
          </p>
          
          <div className="hero-actions">
            <button 
              onClick={createRoom}
              disabled={!isConnected || isCreating}
              className={`start-meeting-btn ${isCreating ? 'loading' : ''}`}
            >
              <span className="btn-icon">📹</span>
              {isCreating ? 'Creating...' : 'Start New Meeting'}
            </button>
            
            <button 
              onClick={scheduleNewMeeting}
              className="schedule-meeting-btn"
            >
              <span className="btn-icon">📅</span>
              Schedule Meeting
            </button>
          </div>
        </div>
        
        {/* Local Video Preview */}
        <div className="video-preview-section">
          <div className="preview-container">
            <div className="preview-label">Preview Mode</div>
            <video 
              ref={videoRef}
              autoPlay 
              muted 
              playsInline
              className="local-video-preview"
            />
            {!isVideoEnabled && (
              <div className="video-disabled-overlay">
                <span>📷</span>
                <p>Camera Off</p>
              </div>
            )}
            
            {/* Video Controls */}
            <div className="preview-controls">
              <button 
                onClick={toggleMic}
                className={`control-btn ${!isMicEnabled ? 'disabled' : ''}`}
                title={isMicEnabled ? 'Mute' : 'Unmute'}
              >
                {isMicEnabled ? '🎤' : '🔇'}
              </button>
              <button 
                onClick={toggleVideo}
                className={`control-btn ${!isVideoEnabled ? 'disabled' : ''}`}
                title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {isVideoEnabled ? '📹' : '📷'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Join Meeting Section */}
      <div className="join-meeting-section">
        <div className="join-container">
          <h3>Join a Meeting</h3>
          <div className="join-input-group">
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter meeting ID or link"
              disabled={!isConnected || isJoining}
              onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
              className="meeting-input"
            />
            <button 
              onClick={joinRoom}
              disabled={!isConnected || isJoining || !roomId.trim()}
              className={`join-btn ${isJoining ? 'loading' : ''}`}
            >
              {isJoining ? 'Joining...' : 'Join'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Features Section */}
      <div className="features-section">
        <div className="feature-card team-rooms">
          <div className="feature-icon">👥</div>
          <h4>Team Rooms</h4>
          <p>Dedicated spaces</p>
        </div>
        
        <div className="feature-card screen-share">
          <div className="feature-icon">💻</div>
          <h4>Screen Share</h4>
          <p>HD quality</p>
        </div>
      </div>
      
      {/* Connection Status */}
      <div className="connection-status">
        <div className={`status-indicator ${isConnected ? 'connected' : 'connecting'}`}>
          <div className="status-dot"></div>
          <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
        </div>
      </div>

      {isScheduleModalOpen && (
        <ScheduleMeetingModal
          isOpen={isScheduleModalOpen}
          onClose={closeScheduleModal}
          onSchedule={handleScheduleMeeting}
        />
      )}
    </div>
  )
}