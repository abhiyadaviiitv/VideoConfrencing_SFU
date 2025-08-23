import { useState } from 'react'

export default function ScheduleMeetingModal({ isOpen, onClose, onSchedule }) {
  const [meetingTitle, setMeetingTitle] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingTime, setMeetingTime] = useState('')
  const [duration, setDuration] = useState('60')
  const [description, setDescription] = useState('')
  const [isScheduling, setIsScheduling] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!meetingTitle || !meetingDate || !meetingTime) {
      alert('Please fill in all required fields')
      return
    }

    setIsScheduling(true)
    
    const scheduledMeeting = {
      title: meetingTitle,
      date: meetingDate,
      time: meetingTime,
      duration: parseInt(duration),
      description,
      scheduledAt: new Date().toISOString(),
      meetingId: `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    try {
      // Save to localStorage for now (in a real app, this would be sent to a server)
      const existingMeetings = JSON.parse(localStorage.getItem('scheduledMeetings') || '[]')
      existingMeetings.push(scheduledMeeting)
      localStorage.setItem('scheduledMeetings', JSON.stringify(existingMeetings))
      
      onSchedule(scheduledMeeting)
      
      // Reset form
      setMeetingTitle('')
      setMeetingDate('')
      setMeetingTime('')
      setDuration('60')
      setDescription('')
      
      alert(`Meeting "${meetingTitle}" scheduled successfully!\nMeeting ID: ${scheduledMeeting.meetingId}`)
      onClose()
    } catch (error) {
      console.error('Error scheduling meeting:', error)
      alert('Failed to schedule meeting. Please try again.')
    } finally {
      setIsScheduling(false)
    }
  }

  const handleClose = () => {
    if (!isScheduling) {
      onClose()
    }
  }

  if (!isOpen) return null

  // Get today's date for min date validation
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Schedule New Meeting</h2>
          <button 
            className="close-btn" 
            onClick={handleClose}
            disabled={isScheduling}
          >
            ✕
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="schedule-form">
          <div className="form-group">
            <label htmlFor="meetingTitle">Meeting Title *</label>
            <input
              id="meetingTitle"
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="Enter meeting title"
              disabled={isScheduling}
              required
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="meetingDate">Date *</label>
              <input
                id="meetingDate"
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                min={today}
                disabled={isScheduling}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="meetingTime">Time *</label>
              <input
                id="meetingTime"
                type="time"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                disabled={isScheduling}
                required
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="duration">Duration (minutes)</label>
            <select
              id="duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={isScheduling}
            >
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add meeting description or agenda"
              rows={3}
              disabled={isScheduling}
            />
          </div>
          
          <div className="form-actions">
            <button 
              type="button" 
              onClick={handleClose}
              className="cancel-btn"
              disabled={isScheduling}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className={`schedule-btn ${isScheduling ? 'loading' : ''}`}
              disabled={isScheduling}
            >
              {isScheduling ? (
                <>
                  <div className="btn-spinner"></div>
                  Scheduling...
                </>
              ) : (
                'Schedule Meeting'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}