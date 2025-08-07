import React, { useState, useEffect } from 'react';

const HandRaise = ({ roomId, currentUserId, isHost, socket, onRaisedHandsChange }) => {
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    setIsConnected(socket.connected);

    const handleConnect = () => {
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleHandRaised = ({ userId, userName, timestamp }) => {
      setRaisedHands(prev => {
        const existing = prev.find(hand => hand.userId === userId);
        if (existing) return prev;
        return [...prev, { userId, userName: userName || `Client ${userId.substring(0, 8)}`, timestamp }];
      });
    };

    const handleHandLowered = ({ userId }) => {
      setRaisedHands(prev => prev.filter(hand => hand.userId !== userId));
    };

    const handleHandsCleared = () => {
      setRaisedHands([]);
    };

    // Listen for hand raise events
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('hand-raised', handleHandRaised);
    socket.on('hand-lowered', handleHandLowered);
    socket.on('hands-cleared', handleHandsCleared);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('hand-raised', handleHandRaised);
      socket.off('hand-lowered', handleHandLowered);
      socket.off('hands-cleared', handleHandsCleared);
    };
  }, [roomId, socket]);

  // Notify parent component when raised hands change
  useEffect(() => {
    if (onRaisedHandsChange) {
      onRaisedHandsChange(raisedHands);
    }
  }, [raisedHands, onRaisedHandsChange]);

  const toggleHandRaise = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/61ba8bd1-5a40-4e87-b536-f0bcf18abf50',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HandRaise.jsx:60',message:'Hand raise toggle clicked',data:{socket:!!socket,isConnected,roomId,currentUserId,isHandRaised},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    
    if (!socket || !isConnected) {
      console.error('Cannot raise hand: socket or connection issue', { socket: !!socket, isConnected });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/61ba8bd1-5a40-4e87-b536-f0bcf18abf50',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HandRaise.jsx:65',message:'Hand raise blocked - connection issue',data:{socket:!!socket,isConnected},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      return;
    }

    if (!roomId) {
      console.error('Cannot raise hand: roomId is missing', { roomId });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/61ba8bd1-5a40-4e87-b536-f0bcf18abf50',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HandRaise.jsx:72',message:'Hand raise blocked - no roomId',data:{roomId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      return;
    }

    if (isHandRaised) {
      socket.emit('lower-hand', { roomId, userId: currentUserId });
      setIsHandRaised(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/61ba8bd1-5a40-4e87-b536-f0bcf18abf50',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HandRaise.jsx:78',message:'Lower hand emitted',data:{roomId,userId:currentUserId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
    } else {
      socket.emit('raise-hand', { 
        roomId, 
        userId: currentUserId, 
        userName: `Client ${currentUserId.substring(0, 8)}` 
      });
      setIsHandRaised(true);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/61ba8bd1-5a40-4e87-b536-f0bcf18abf50',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'HandRaise.jsx:87',message:'Raise hand emitted',data:{roomId,userId:currentUserId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
    }
  };

  const clearAllHands = () => {
    if (!socket || !isConnected || !isHost) return;
    socket.emit('clear-all-hands', { roomId });
    setRaisedHands([]);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatUserId = (userId) => {
    if (userId === currentUserId) return 'You';
    return `Client ${userId.substring(0, 8)}`;
  };

  return (
    <div className="hand-raise-container">
      {/* Hand Raise Button */}
      <button 
        onClick={toggleHandRaise}
        className={`control-btn hand-raise-btn ${isHandRaised ? 'active' : ''}`}
        title={isHandRaised ? 'Lower hand' : 'Raise hand'}
        disabled={!isConnected}
      >
        {isHandRaised ? '✋' : '🖐️'}
      </button>

      {/* Raised Hands Indicator */}
      {raisedHands.length > 0 && (
        <div className="raised-hands-indicator">
          <span className="hands-count">{raisedHands.length}</span>
          <span className="hands-icon">✋</span>
        </div>
      )}

      {/* Host Controls - Raised Hands List */}
      {isHost && raisedHands.length > 0 && (
        <div className="raised-hands-panel">
          <div className="panel-header">
            <h3>Raised Hands ({raisedHands.length})</h3>
            <button 
              onClick={clearAllHands}
              className="clear-hands-btn"
              title="Clear all hands"
            >
              Clear All
            </button>
          </div>
          <div className="hands-list">
            {raisedHands.map((hand) => (
              <div key={hand.userId} className="hand-item">
                <div className="hand-info">
                  <span className="hand-user">{formatUserId(hand.userId)}</span>
                  <span className="hand-time">{formatTime(hand.timestamp)}</span>
                </div>
                <div className="hand-icon">✋</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HandRaise;