/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../lib/socket'

export default function MeetingNotifications() {
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [currentNotification, setCurrentNotification] = useState(null)
  const [showScheduledMeetings, setShowScheduledMeetings] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const checkScheduledMeetings = () => {
      const scheduledMeetings = JSON.parse(localStorage.getItem('scheduledMeetings') || '[]')
      const now = new Date()
      const currentTime = now.getTime()
      
      scheduledMeetings.forEach(meeting => {
        const meetingDateTime = new Date(`${meeting.date}T${meeting.time}`)
        const meetingTime = meetingDateTime.getTime()
        const timeDiff = meetingTime - currentTime
        
        // Notify 5 minutes before meeting
        if (timeDiff > 0 && timeDiff <= 5 * 60 * 1000 && !meeting.notified) {
          setCurrentNotification({
            ...meeting,
            type: 'upcoming',
            timeUntil: Math.ceil(timeDiff / (60 * 1000))
          })
          
          // Mark as notified
          meeting.notified = true
          localStorage.setItem('scheduledMeetings', JSON.stringify(scheduledMeetings))
        }
        
        // Auto-start meeting when time arrives
        if (timeDiff <= 0 && timeDiff >= -2 * 60 * 1000 && !meeting.started) {
          setCurrentNotification({
            ...meeting,
            type: 'start',
            overdue: Math.abs(Math.ceil(timeDiff / (60 * 1000)))
          })
          
          // Mark as started
          meeting.started = true
          localStorage.setItem('scheduledMeetings', JSON.stringify(scheduledMeetings))
        }
      })
      
      // Update upcoming meetings list
      const upcoming = scheduledMeetings.filter(meeting => {
        const meetingDateTime = new Date(`${meeting.date}T${meeting.time}`)
        return meetingDateTime.getTime() > currentTime && !meeting.started
      })
      setUpcomingMeetings(upcoming)
    }

    // Listen for localStorage changes from other tabs
    const handleStorageChange = (e) => {
      if (e.key === 'scheduledMeetings') {
        console.log('Scheduled meetings updated in another tab')
        checkScheduledMeetings()
      }
    }

    // Check immediately
    checkScheduledMeetings()
    
    // Check every minute
    const interval = setInterval(checkScheduledMeetings, 60000)
    
    // Listen for cross-tab localStorage changes
    window.addEventListener('storage', handleStorageChange)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  
  const handleStartMeeting = async (meetingId) => {
    try {
      // Use the centralized socket connection
      if (socket.connected) {
        // Create a new room on the server
        socket.emit('createRoom', (response) => {
          if (response.roomId) {
            // Navigate to the created room
            navigate(`/room/${response.roomId}`);
            setCurrentNotification(null);
          } else {
            console.error('Failed to create room:', response.error);
            alert('Failed to start meeting. Please try again.');
          }
        });
      } else {
        // If socket is not connected, wait for connection
        socket.on('connect', () => {
          socket.emit('createRoom', (response) => {
            if (response.roomId) {
              navigate(`/room/${response.roomId}`);
              setCurrentNotification(null);
            } else {
              console.error('Failed to create room:', response.error);
              alert('Failed to start meeting. Please try again.');
            }
          });
        });
      }
      
      socket.on('connect_error', (error) => {
        console.error('Failed to connect to server:', error);
        alert('Failed to connect to server. Please try again.');
        socket.disconnect();
      });
    } catch (error) {
      console.error('Error starting meeting:', error);
      alert('Failed to start meeting. Please try again.');
    }
  }

  const handleDismiss = () => {
    setCurrentNotification(null)
  }

  const formatTime = (timeString) => {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  if (!currentNotification) return null

  return (
    <div className="meeting-notification-overlay">
      <div className="meeting-notification">
        <div className="notification-header">
          <h3>
            {currentNotification.type === 'upcoming' ? '📅 Meeting Starting Soon' : '🚀 Meeting Time!'}
          </h3>
          <button onClick={handleDismiss} className="notification-close">✕</button>
        </div>
        
        <div className="notification-content">
          <h4>{currentNotification.title}</h4>
          <p className="meeting-time">
            📅 {currentNotification.date} at {formatTime(currentNotification.time)}
          </p>
          
          {currentNotification.type === 'upcoming' && (
            <p className="time-until">
              Starting in {currentNotification.timeUntil} minute{currentNotification.timeUntil !== 1 ? 's' : ''}
            </p>
          )}
          
          {currentNotification.type === 'start' && (
            <p className="time-overdue">
              {currentNotification.overdue > 0 
                ? `Started ${currentNotification.overdue} minute${currentNotification.overdue !== 1 ? 's' : ''} ago`
                : 'Starting now!'
              }
            </p>
          )}
          
          {currentNotification.description && (
            <p className="meeting-description">{currentNotification.description}</p>
          )}
        </div>
        
        <div className="notification-actions">
          <button onClick={handleDismiss} className="dismiss-btn">
            Dismiss
          </button>
          <button 
             onClick={() => handleStartMeeting(currentNotification.meetingId)} 
             className="start-meeting-btn"
           >
             Start Meeting
           </button>
        </div>
      </div>
      
      {/* Scheduled Meetings Section */}
      <div className="scheduled-meetings-section">
        <button 
          onClick={() => setShowScheduledMeetings(!showScheduledMeetings)}
          className="toggle-scheduled-btn"
        >
          📅 Scheduled Meetings ({upcomingMeetings.length})
        </button>
        
        {showScheduledMeetings && (
          <div className="scheduled-meetings-list">
            {upcomingMeetings.map((meeting, index) => (
              <div key={index} className="scheduled-meeting-item">
                <h4>{meeting.title}</h4>
                <p>📅 {meeting.date} at {formatTime(meeting.time)}</p>
                {meeting.description && <p>{meeting.description}</p>}
                <button 
                   onClick={() => handleStartMeeting(meeting.meetingId)}
                   className="start-meeting-btn"
                 >
                   Start Meeting
                 </button>
              </div>
            ))}
            {upcomingMeetings.length === 0 && (
              <p className="no-meetings">No upcoming meetings scheduled</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}