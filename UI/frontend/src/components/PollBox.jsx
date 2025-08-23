import { useState, useEffect } from 'react'
import './PollBox.css'

export default function PollBox({ isOpen, onClose, roomId, currentUserId, socket, isHost }) {
  const [polls, setPolls] = useState([])
  const [activePoll, setActivePoll] = useState(null)
  const [newPollQuestion, setNewPollQuestion] = useState('')
  const [newPollOptions, setNewPollOptions] = useState(['', ''])
  const [isCreatingPoll, setIsCreatingPoll] = useState(false)
  const [userVotes, setUserVotes] = useState(new Map())
  const [notification, setNotification] = useState(null) // Track user votes

  // Request existing polls when component mounts or socket changes
  useEffect(() => {
    if (socket && roomId) {
      // Request existing polls from server for late joiners
      socket.emit('get-existing-polls', { roomId }, (response) => {
        if (response.polls && Array.isArray(response.polls)) {
          console.log('Received existing polls:', response.polls)
          setPolls(response.polls)
          
          // Set active poll if there's one
          const activePollData = response.polls.find(poll => poll.isActive)
          if (activePollData) {
            setActivePoll(activePollData)
          }
          
          // Set user votes if available
          if (response.userVotes) {
            const votesMap = new Map()
            Object.entries(response.userVotes).forEach(([pollId, optionIndex]) => {
              votesMap.set(pollId, optionIndex)
            })
            setUserVotes(votesMap)
          }
        }
      })
    }
  }, [socket, roomId, currentUserId])

  // Always listen for poll events, regardless of whether poll box is open
  useEffect(() => {
    if (socket) {
      // Listen for poll events
      const handlePollCreated = (pollData) => {
        console.log('Poll created:', pollData)
        
        // Prevent duplicate polls by checking if poll already exists
        setPolls(prev => {
          const existingPoll = prev.find(poll => poll.id === pollData.id)
          if (existingPoll) {
            console.log('Poll already exists, skipping duplicate:', pollData.id)
            return prev
          }
          return [...prev, pollData]
        })
        
        if (pollData.isActive) {
          setActivePoll(pollData)
        }
        
        // Show notification if poll was created by someone else
        if (pollData.createdBy !== currentUserId) {
          setNotification({
            type: 'poll-created',
            message: `New poll: "${pollData.question}"`,
            timestamp: Date.now()
          })
          
          // Auto-hide notification after 5 seconds
          setTimeout(() => {
            setNotification(null)
          }, 5000)
        }
      }

      const handlePollVote = (voteData) => {
        setPolls(prev => prev.map(poll => 
          poll.id === voteData.pollId 
            ? { ...poll, votes: voteData.votes, totalVotes: voteData.totalVotes }
            : poll
        ))
        
        if (activePoll && activePoll.id === voteData.pollId) {
          setActivePoll(prev => ({ 
            ...prev, 
            votes: voteData.votes, 
            totalVotes: voteData.totalVotes 
          }))
        }
      }

      const handlePollClosed = (pollData) => {
        setPolls(prev => prev.map(poll => 
          poll.id === pollData.pollId 
            ? { ...poll, isActive: false, closedAt: pollData.closedAt }
            : poll
        ))
        
        if (activePoll && activePoll.id === pollData.pollId) {
          setActivePoll(prev => ({ 
            ...prev, 
            isActive: false, 
            closedAt: pollData.closedAt 
          }))
        }
      }

      const handleUserVoted = (voteData) => {
        console.log('User voted event received:', voteData)
        setUserVotes(prev => new Map(prev.set(voteData.pollId, voteData.optionIndex)))
      }

      const handleUserVoteRemoved = (voteData) => {
        console.log('User vote removed event received:', voteData)
        setUserVotes(prev => {
          const newMap = new Map(prev)
          newMap.delete(voteData.pollId)
          return newMap
        })
      }

      socket.on('poll-created', handlePollCreated)
      socket.on('poll-vote-update', handlePollVote)
      socket.on('poll-closed', handlePollClosed)
      socket.on('user-voted', handleUserVoted)
      socket.on('user-vote-removed', handleUserVoteRemoved)

      return () => {
        socket.off('poll-created', handlePollCreated)
        socket.off('poll-vote-update', handlePollVote)
        socket.off('poll-closed', handlePollClosed)
        socket.off('user-voted', handleUserVoted)
        socket.off('user-vote-removed', handleUserVoteRemoved)
      }
    }
  }, [socket, activePoll, currentUserId]) // Removed isOpen dependency

  const addOption = () => {
    if (newPollOptions.length < 6) {
      setNewPollOptions([...newPollOptions, ''])
    }
  }

  const removeOption = (index) => {
    if (newPollOptions.length > 2) {
      setNewPollOptions(newPollOptions.filter((_, i) => i !== index))
    }
  }

  const updateOption = (index, value) => {
    const updated = [...newPollOptions]
    updated[index] = value
    setNewPollOptions(updated)
  }

  const createPoll = () => {
    if (!newPollQuestion.trim()) {
      alert('Please enter a poll question')
      return
    }

    const validOptions = newPollOptions.filter(opt => opt.trim())
    if (validOptions.length < 2) {
      alert('Please provide at least 2 options')
      return
    }

    const pollData = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      question: newPollQuestion.trim(),
      options: validOptions,
      createdBy: currentUserId,
      createdAt: new Date().toISOString(),
      isActive: true,
      votes: validOptions.map(() => 0),
      totalVotes: 0,
      voters: [], // Initialize empty voters array
      roomId
    }

    socket.emit('create-poll', pollData)
    
    // Reset form
    setNewPollQuestion('')
    setNewPollOptions(['', ''])
    setIsCreatingPoll(false)
  }

  const vote = (pollId, optionIndex) => {
    const currentVote = userVotes.get(pollId)
    
    if (currentVote === optionIndex) {
      // User clicked on their current vote - remove the vote (toggle off)
      socket.emit('remove-vote-poll', { pollId, roomId })
    } else if (userVotes.has(pollId)) {
      // User has voted for a different option - change their vote
      socket.emit('change-vote-poll', { pollId, optionIndex, roomId })
    } else {
      // User hasn't voted yet - cast new vote
      socket.emit('vote-poll', { pollId, optionIndex, roomId })
    }
  }

  const closePoll = (pollId) => {
    socket.emit('close-poll', { pollId, roomId })
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const getVotePercentage = (votes, optionIndex, totalVotes) => {
    if (totalVotes === 0) return 0
    return Math.round((votes[optionIndex] / totalVotes) * 100)
  }

  if (!isOpen) return null

  return (
    <div className="poll-overlay">
      {/* Poll Notification */}
      {notification && (
        <div className="poll-notification">
          <div className="notification-content">
            <span className="notification-icon">📊</span>
            <span className="notification-message">{notification.message}</span>
            <button 
              className="notification-close"
              onClick={() => setNotification(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      <div className="poll-container">
        <div className="poll-header">
          <h3>📊 Polls</h3>
          <button onClick={onClose} className="poll-close-btn">✕</button>
        </div>

        <div className="poll-content">
          {/* Create Poll Section (Host Only) */}
          {isHost && (
            <div className="create-poll-section">
              {!isCreatingPoll ? (
                <button 
                  onClick={() => setIsCreatingPoll(true)}
                  className="create-poll-btn"
                >
                  ➕ Create New Poll
                </button>
              ) : (
                <div className="poll-form">
                  <h4>Create New Poll</h4>
                  <input
                    type="text"
                    placeholder="Enter your poll question..."
                    value={newPollQuestion}
                    onChange={(e) => setNewPollQuestion(e.target.value)}
                    className="poll-question-input"
                  />
                  
                  <div className="poll-options">
                    <label>Options:</label>
                    {newPollOptions.map((option, index) => (
                      <div key={index} className="option-input-group">
                        <input
                          type="text"
                          placeholder={`Option ${index + 1}`}
                          value={option}
                          onChange={(e) => updateOption(index, e.target.value)}
                          className="option-input"
                        />
                        {newPollOptions.length > 2 && (
                          <button 
                            onClick={() => removeOption(index)}
                            className="remove-option-btn"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    
                    {newPollOptions.length < 6 && (
                      <button onClick={addOption} className="add-option-btn">
                        ➕ Add Option
                      </button>
                    )}
                  </div>
                  
                  <div className="poll-form-actions">
                    <button onClick={createPoll} className="create-btn">
                      Create Poll
                    </button>
                    <button 
                      onClick={() => {
                        setIsCreatingPoll(false)
                        setNewPollQuestion('')
                        setNewPollOptions(['', ''])
                      }}
                      className="cancel-btn"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Poll */}
          {activePoll && activePoll.isActive && (
            <div className="active-poll">
              <h4>🔴 Active Poll</h4>
              <div className="poll-item">
                <div className="poll-question">{activePoll.question}</div>
                <div className="poll-meta">
                  Created by {activePoll.createdBy === currentUserId ? 'You' : `User ${activePoll.createdBy.slice(-6)}`} • 
                  {formatTime(activePoll.createdAt)}
                </div>
                
                <div className="poll-options-list">
                  {activePoll.options.map((option, index) => {
                    const hasVoted = userVotes.has(activePoll.id)
                    const isUserVote = userVotes.get(activePoll.id) === index
                    const percentage = getVotePercentage(activePoll.votes, index, activePoll.totalVotes)
                    
                    return (
                      <div 
                        key={index} 
                        className={`poll-option-box ${
                          isUserVote ? 'user-voted' : ''
                        } ${hasVoted && !isUserVote ? 'other-voted' : ''}`}
                        onClick={() => vote(activePoll.id, index)}
                      >
                        <div className="option-content">
                          <span className="option-text">{option}</span>
                          {isUserVote && (
                            <span className="vote-indicator">✓ Your vote</span>
                          )}
                        </div>
                        
                        {hasVoted && (
                          <div className="vote-bar">
                            <div 
                              className="vote-fill" 
                              style={{ width: `${percentage}%` }}
                            ></div>
                            <span className="vote-count">
                              {activePoll.votes[index]} ({percentage}%)
                            </span>
                          </div>
                        )}
                        
                        {!hasVoted && (
                          <div className="vote-hint">Click to vote</div>
                        )}
                      </div>
                    )
                  })}
                </div>
                
                <div className="poll-stats">
                  Total votes: {activePoll.totalVotes}
                </div>
                
                {isHost && (
                  <button 
                    onClick={() => closePoll(activePoll.id)}
                    className="close-poll-btn"
                  >
                    🔒 Close Poll
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Poll History */}
          <div className="poll-history">
            <h4>📋 Poll History</h4>
            {polls.length === 0 ? (
              <div className="no-polls">
                <p>No polls yet. {isHost ? 'Create the first poll!' : 'Wait for the host to create a poll.'}</p>
              </div>
            ) : (
              <div className="polls-list">
                {polls
                  .filter(poll => !poll.isActive)
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                  .map((poll) => (
                    <div key={poll.id} className="poll-item closed">
                      <div className="poll-question">{poll.question}</div>
                      <div className="poll-meta">
                        Created by {poll.createdBy === currentUserId ? 'You' : `User ${poll.createdBy.slice(-6)}`} • 
                        {formatTime(poll.createdAt)} • 
                        Closed {formatTime(poll.closedAt)}
                      </div>
                      
                      <div className="poll-results">
                        {poll.options.map((option, index) => {
                          const percentage = getVotePercentage(poll.votes, index, poll.totalVotes)
                          
                          return (
                            <div key={index} className="result-option">
                              <div className="option-header">
                                <span className="option-text">{option}</span>
                                <span className="vote-count">
                                  {poll.votes[index]} ({percentage}%)
                                </span>
                              </div>
                              <div className="result-bar">
                                <div 
                                  className="result-fill" 
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      
                      <div className="poll-stats">
                        Total votes: {poll.totalVotes}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}