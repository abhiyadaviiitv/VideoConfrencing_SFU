import React, { useState, useEffect } from 'react';
import socket from '../lib/socket';

const SocketTest = () => {
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [token, setToken] = useState('');
  const [socketId, setSocketId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    setToken(storedToken || 'No token found');

    // Socket event listeners
    socket.on('connect', () => {
      setConnectionStatus('Connected');
      setSocketId(socket.id);
      setError('');
    });

    socket.on('disconnect', (reason) => {
      setConnectionStatus(`Disconnected: ${reason}`);
      setSocketId('');
    });

    socket.on('connect_error', (error) => {
      setConnectionStatus('Connection Failed');
      setError(error.message);
    });

    socket.on('connection-success', ({ socketId }) => {
      console.log('Connection success event received:', socketId);
    });

    // Check initial connection status
    if (socket.connected) {
      setConnectionStatus('Connected');
      setSocketId(socket.id);
    }

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('connection-success');
    };
  }, []);

  const testCreateRoom = () => {
    if (socket.connected) {
      socket.emit('createRoom', (response) => {
        console.log('Create room response:', response);
        alert(`Room creation result: ${JSON.stringify(response)}`);
      });
    } else {
      alert('Socket not connected');
    }
  };

  const reconnectSocket = () => {
    socket.disconnect();
    socket.connect();
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Socket Connection Test</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Connection Status: <span style={{ color: socket.connected ? 'green' : 'red' }}>{connectionStatus}</span></h3>
        {socketId && <p><strong>Socket ID:</strong> {socketId}</p>}
        {error && <p style={{ color: 'red' }}><strong>Error:</strong> {error}</p>}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Authentication Token:</h3>
        <p style={{ wordBreak: 'break-all', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
          {token}
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button onClick={testCreateRoom} style={{ marginRight: '10px', padding: '10px 20px' }}>
          Test Create Room
        </button>
        <button onClick={reconnectSocket} style={{ padding: '10px 20px' }}>
          Reconnect Socket
        </button>
      </div>

      <div>
        <h3>Debug Info:</h3>
        <ul>
          <li>Socket URL: http://localhost:4000/mediasoup</li>
          <li>Transport: {socket.io.engine.transport.name}</li>
          <li>Connected: {socket.connected ? 'Yes' : 'No'}</li>
          <li>Token Present: {localStorage.getItem('token') ? 'Yes' : 'No'}</li>
        </ul>
      </div>
    </div>
  );
};

export default SocketTest;