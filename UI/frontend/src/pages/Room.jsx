/* eslint-disable no-unused-vars */
import * as mediasoupClient from 'mediasoup-client';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatBox from '../components/ChatBox';
import HandRaise from '../components/HandRaise';
import ParticipantList from '../components/ParticipantList';
import PollBox from '../components/PollBox';
import socket from '../lib/socket';
import './Room.css';

// Global variables exactly like index.js - but isolated per component instance
// socket is now imported directly from ../lib/socket
let device;
let rtpCapabilities;
let producerTransport;
let consumerTransport;
let roomId;
let isSettingUpPipeline = false; // Flag to prevent multiple simultaneous setups

// These will be moved to component state to avoid cross-tab conflicts
// let videoProducer;
// let audioProducer;
// let screenVideoProducer = null;
// let screenAudioProducer = null;

const consumers = new Map();
const peerVideos = new Map(); // Maps peer IDs to video elements

// Exact parameters from index.js
const videoparams = {
  encodings: [
    {
      rid: 'r0',
      maxBitrate: 100000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r1',
      maxBitrate: 300000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r2',
      maxBitrate: 900000,
      scalabilityMode: 'S1T3',
    },
  ],
  codecOptions: {
    videoGoogleStartBitrate: 1000
  }
};

const audioParams = {
  track: null,
  codecOptions: {
    opusStereo: false,
    opusFec: true,
    opusDtx: true,
    opusMaxPlaybackRate: 48000,
    opusPtime: 20
  },
  encodings: [
    {
      maxBitrate: 64000
    }
  ]
};

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:relay1.expressturn.com:3480',
    username: '000000002065332507',
    credential: '2dm9ltTqJIjVrRq/LI/QvTm0nPY='
  }
];

const Room = () => {
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();
  const [isInRoom, setIsInRoom] = useState(false);
  const [displayRoomCode, setDisplayRoomCode] = useState(urlRoomId || 'N/A');
  
  // Debug logging
  console.log('Room component initialized with:', {
    urlRoomId,
    windowLocation: window.location.href,
    pathname: window.location.pathname
  });
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [hostId, setHostId] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantListOpen, setIsParticipantListOpen] = useState(false);
  const [isPollOpen, setIsPollOpen] = useState(false);
  const [participants, setParticipants] = useState([])
  const [raisedHands, setRaisedHands] = useState([])
  const [participantJoinTimes, setParticipantJoinTimes] = useState(new Map())
  const [roomJoinTime, setRoomJoinTime] = useState(null)
  const [remotePeerStatus, setRemotePeerStatus] = useState(new Map()) // Track remote peer mute/camera status
  const [currentUserInfo, setCurrentUserInfo] = useState(null) // Store current user info
  const [participantProfiles, setParticipantProfiles] = useState(new Map()); // Store participant profiles
  const [isRecording, setIsRecording] = useState(false); // Recording state
  
  // Producer state to avoid cross-tab conflicts
  const [videoProducer, setVideoProducer] = useState(null);
  const [audioProducer, setAudioProducer] = useState(null);
  const [screenVideoProducer, setScreenVideoProducer] = useState(null);
  const [screenAudioProducer, setScreenAudioProducer] = useState(null);
  const [presenterNotification, setPresenterNotification] = useState(null);
  
  const localVideoRef = useRef();
  const remoteVideosRef = useRef();

  // Function to get current user information from database
  const getCurrentUserInfo = async () => {
    try {
      // Get user info from localStorage or session
      const userEmail = localStorage.getItem('userEmail') || sessionStorage.getItem('userEmail');
      const userName = localStorage.getItem('userName') || sessionStorage.getItem('userName');
      const userAvatar = localStorage.getItem('userAvatar') || sessionStorage.getItem('userAvatar');
      
      if (userEmail && userName) {
        const userInfo = {
          name: userName,
          email: userEmail,
          avatar: userAvatar || 'default-avatar.png'
        };
        setCurrentUserInfo(userInfo);
        return userInfo;
      }
      
      // If not in storage, try to get from database via API
      const response = await fetch('/api/user/current', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const userData = await response.json();
        setCurrentUserInfo(userData);
        return userData;
      }
      
      // Fallback to anonymous
      return { name: 'Anonymous', email: '', avatar: 'default-avatar.png' };
    } catch (error) {
      console.error('Error getting user info:', error);
      return { name: 'Anonymous', email: '', avatar: 'default-avatar.png' };
    }
  };

  // Function to update participants list
  // Function to update video tile labels when host status changes
  const updateParticipants = () => {
    const participantList = [];
    
    console.log('Updating participants - Current state:', {
      currentSocketId: socket?.id,
      isHost,
      hostId,
      consumersCount: consumers.size,
      participantJoinTimes: Array.from(participantJoinTimes.entries())
    });
    
    // Add current user
    participantList.push({
      id: socket?.id || 'anonymous',
      name: currentUserInfo?.name || 'You',
      isHost: isHost,
      isMuted: !isMicOn,
      isCameraOff: !isCamOn,
      joinedAt: roomJoinTime || new Date(), // Use actual join time
      isCurrentUser: true
    });
    
    // Add participants from consumers (remote participants)
    const uniquePeerIds = new Set();
    consumers.forEach((entry) => {
      if (entry.peerId && entry.peerId !== (socket?.id || 'anonymous')) {
        uniquePeerIds.add(entry.peerId);
      }
    });
    
    uniquePeerIds.forEach(peerId => {
      console.log(hostId);
      const isRemoteHost = peerId === hostId;
      const joinTime = participantJoinTimes.get(peerId);
      console.log(`Participant ${peerId}: isHost=${isRemoteHost}, hostId=${hostId}, joinTime=${joinTime}`);
      
      // Try to get participant name from server
      const participantName = getParticipantName(peerId);
      
      participantList.push({
        id: peerId,
        name: participantName || `Client ${peerId.substring(0, 8)}`, // Use name from server or fallback
        isHost: isRemoteHost,
        isMuted: remotePeerStatus.get(peerId)?.isMuted || false,
        isCameraOff: remotePeerStatus.get(peerId)?.isCameraOff || false,
        joinedAt: joinTime || new Date(), // Use actual join time or current time as fallback
        isCurrentUser: false
      });
    });
    
    console.log('Final participant list:', participantList);
    setParticipants(participantList);
  };

  // Enhanced function to update video tile labels with profile data
  const updateVideoTileLabels = () => {
    const remoteVideos = remoteVideosRef.current;
    if (!remoteVideos) return;
    
    console.log('Updating video tile labels with profiles:', Array.from(participantProfiles.entries()));
    
    // Update all video tile labels
    const videoContainers = remoteVideos.querySelectorAll('.video-container');
    videoContainers.forEach(container => {
      const video = container.querySelector('video');
      const label = container.querySelector('.peer-label');
      if (video && label && video.dataset.peerId) {
        const peerId = video.dataset.peerId;
        const isHostPeer = peerId === hostId;
        const isScreenShare = video.dataset.mediaType === 'screenShare';
        
        if (!isScreenShare) {
          // Get participant name from profiles or participants
          const participantName = getParticipantName(peerId);
          const displayName = participantName || `User ${peerId.slice(-6)}`;
          
          console.log(`Updating label for ${peerId}: ${displayName} (isHost: ${isHostPeer})`);
          
          // Update label text and styling for non-screen share videos
          label.textContent = `${isHostPeer ? '👑 ' : ''}${displayName}`;
          if (isHostPeer) {
            label.style.background = 'rgba(16, 185, 129, 0.9)';
            label.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          } else {
            label.style.background = '';
            label.style.border = '';
          }
        }
      }
    });
  };

  // Function to get participant name from profiles
  const getParticipantName = (peerId) => {
    if (!peerId) return null;
    
    // Check if it's the current user
    if (peerId === socket?.id) {
      return currentUserInfo?.name || 'You';
    }
    
    // Check participant profiles first
    const profile = participantProfiles.get(peerId);
    if (profile?.name) {
      console.log(`Found profile for ${peerId}:`, profile.name);
      return profile.name;
    }
    
    // Fallback to participants list
    const participant = participants.find(p => p.id === peerId);
    if (participant?.name) {
      console.log(`Found participant name for ${peerId}:`, participant.name);
      return participant.name;
    }
    
    console.log(`No name found for ${peerId}, using fallback`);
    return null;
  };

  // Function to get participant avatar
  const getParticipantAvatar = (peerId) => {
    if (!peerId) return 'default-avatar.png';
    
    // Check if it's the current user
    if (peerId === socket?.id) {
      return currentUserInfo?.avatar || 'default-avatar.png';
    }
    
    // Check participant profiles
    const profile = participantProfiles.get(peerId);
    return profile?.avatar || 'default-avatar.png';
  };

  // Function to get participant initials
  const getParticipantInitials = (peerId) => {
    const name = getParticipantName(peerId);
    if (!name) return '?';
    
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Exact functions from index.js
  function addRemoteMedia(producerId, track, kind, peerId, appData, isNewProducer = false) { // Add isNewProducer parameter
    if (consumers.has(producerId)) return;

    console.log('Adding remote media:', { producerId, kind, peerId, isNewProducer });
    console.log('remoteVideosRef.current:', remoteVideosRef.current);

    let el;
    if (kind === 'audio') {
      el = document.createElement('audio');
      el.controls = false;
      el.muted = false;
      el.autoplay = true;
      el.srcObject = new MediaStream([track]);
      
      // Add producerId data attribute for cleanup
      el.setAttribute('data-producer-id', producerId);
      el.setAttribute('data-peer-id', peerId);
      
      if (remoteVideosRef.current) {
        remoteVideosRef.current.appendChild(el);
      } else {
        console.error('remoteVideosRef.current is null when trying to add audio element');
      }
    } else {
      const videoContainer = document.createElement('div');
      videoContainer.className = 'video-container';
      
      el = document.createElement('video');
      el.playsInline = true;
      el.autoplay = true;
      el.srcObject = new MediaStream([track]);
      el.classList.add('video', 'remote-video');
      
      // Add data attributes for identification and cleanup
      el.setAttribute('data-producer-id', producerId);
      el.setAttribute('data-peer-id', peerId);
      if (appData && appData.mediaType) {
        el.setAttribute('data-media-type', appData.mediaType);
      }
      videoContainer.setAttribute('data-producer-id', producerId);
      videoContainer.setAttribute('data-peer-id', peerId);
      
      // Add screen share identification
      if (appData && appData.mediaType === 'screenShare') {
        el.classList.add('screen-share');
        el.setAttribute('data-media-type', 'screenShare');
        videoContainer.setAttribute('data-media-type', 'screenShare');
        videoContainer.classList.add('screen-share');
        
        // Only show presenter notification for truly new screen shares, not existing ones
        if (isNewProducer) {
          const presenterName = `Client ${peerId.substring(0, 8)}`;
          setPresenterNotification(presenterName);
          
          // Auto-hide notification after 5 seconds
          setTimeout(() => {
            setPresenterNotification(null);
          }, 5000);
        }
      }
      
      const overlay = document.createElement('div');
      overlay.className = 'video-overlay';
      
      const label = document.createElement('span');
      label.className = 'peer-label';
      const isHostPeer = peerId === hostId;
      const isScreenShare = appData && appData.mediaType === 'screenShare';
      
      if (isScreenShare) {
        const presenterName = getParticipantName(peerId) || `Client ${peerId.substring(0, 8)}`;
        label.textContent = `🖥️ ${presenterName} is presenting`;
        label.style.background = 'rgba(52, 168, 83, 0.9)';
        label.style.border = '1px solid rgba(52, 168, 83, 0.3)';
        label.style.color = 'white';
      } else {
        const participantName = getParticipantName(peerId) || `Client ${peerId.substring(0, 8)}`;
        label.textContent = `${isHostPeer ? '👑 ' : ''}${participantName}`; // Add crown for host
        if (isHostPeer) {
          label.style.background = 'rgba(16, 185, 129, 0.9)';
          label.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        }
      }
      
      // Add status indicators container
      const statusContainer = document.createElement('div');
      statusContainer.className = 'status-indicators';
      statusContainer.style.cssText = 'display: flex; gap: 4px; margin-top: 4px;';
      
      // Add mute indicator
      const muteIndicator = document.createElement('span');
      muteIndicator.className = 'mute-indicator';
      muteIndicator.innerHTML = '🔇';
      muteIndicator.style.cssText = 'background: rgba(244, 67, 54, 0.9); color: white; padding: 2px 6px; border-radius: 4px; font-size: 12px; display: none;';
      
      // Add camera off indicator
      const cameraIndicator = document.createElement('span');
      cameraIndicator.className = 'camera-indicator';
      cameraIndicator.innerHTML = '📷';
      cameraIndicator.style.cssText = 'background: rgba(244, 67, 54, 0.9); color: white; padding: 2px 6px; border-radius: 4px; font-size: 12px; display: none;';
      
      statusContainer.appendChild(muteIndicator);
      statusContainer.appendChild(cameraIndicator);
      
      // Add hand raise indicator
      const handRaiseIndicator = document.createElement('div');
      handRaiseIndicator.className = 'hand-raise-indicator';
      handRaiseIndicator.innerHTML = '✋';
      handRaiseIndicator.style.display = 'none';
      
      // Add avatar container for when video is off
      const avatarContainer = document.createElement('div');
      avatarContainer.className = 'avatar-container';
      avatarContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.3); backdrop-filter: blur(10px); z-index: 1;';
      
      const avatar = document.createElement('img');
      avatar.className = 'participant-avatar';
      avatar.style.cssText = 'width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid rgba(255, 255, 255, 0.3);';
      avatar.src = getParticipantAvatar(peerId);
      avatar.alt = getParticipantName(peerId) || 'Participant';
      
      // Add fallback for when avatar fails to load
      avatar.onerror = () => {
        avatar.style.display = 'none';
        const initialsDiv = document.createElement('div');
        initialsDiv.className = 'avatar-initials';
        initialsDiv.style.cssText = 'width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: bold; border: 3px solid rgba(255, 255, 255, 0.3);';
        initialsDiv.textContent = getParticipantInitials(peerId);
        avatarContainer.appendChild(initialsDiv);
      };
      
      avatarContainer.appendChild(avatar);
      
      overlay.appendChild(label);
      overlay.appendChild(statusContainer);
      overlay.appendChild(handRaiseIndicator);
      videoContainer.appendChild(el);
      videoContainer.appendChild(avatarContainer);
      videoContainer.appendChild(overlay);
      
      // Store reference to update hand raise indicator
      videoContainer.setAttribute('data-peer-id', peerId);
      
      if (remoteVideosRef.current) {
        remoteVideosRef.current.appendChild(videoContainer);
        console.log('Video container added successfully');
      } else {
        console.error('remoteVideosRef.current is null when trying to add video container');
        console.error('This might be the "Node cannot be found" error');
      }
      
      // Store video element with peer ID
      peerVideos.set(peerId, el);
    }
    
    // Store peerId with consumer entry
    consumers.set(producerId, { el, consumer: null, peerId }); // Add peerId here
    
    console.log(hostId);
    // Update participants list when new media is added
    updateParticipants();
  }

  function removeRemoteMedia(producerId, appData = null) {
    const entry = consumers.get(producerId);
    if (!entry) {
      // If no entry found, try to find and remove by producerId data attribute
      if (remoteVideosRef.current) {
        const elements = remoteVideosRef.current.querySelectorAll(`[data-producer-id="${producerId}"]`);
        elements.forEach(el => {
          if (el.tagName === 'VIDEO' && el.parentElement?.className === 'video-container') {
            el.parentElement.remove();
          } else {
            el.remove();
          }
        });
      }
      return;
    }

    // Remove from peerVideos if video
    if (entry.el.tagName === 'VIDEO') {
      peerVideos.delete(entry.peerId);
      // Remove the video container instead of just the video element
      const container = entry.el.parentElement;
      if (container && container.className === 'video-container') {
        container.remove();
      } else {
        entry.el.remove();
      }
    } else {
      entry.el.remove();
    }

    entry.consumer?.close();
    consumers.delete(producerId);
    
    // Additional cleanup for screen shares
    if (appData && appData.mediaType === 'screenShare') {
      console.log('Cleaning up screen share elements for producer:', producerId);
      
      // Clear presenter notification when screen share ends
      setPresenterNotification(null);
      
      // Remove any remaining screen share elements
      if (remoteVideosRef.current) {
        const screenShareElements = remoteVideosRef.current.querySelectorAll('.screen-share, [data-media-type="screenShare"]');
        screenShareElements.forEach(el => {
          if (el.getAttribute('data-producer-id') === producerId) {
            if (el.tagName === 'VIDEO' && el.parentElement?.className === 'video-container') {
              el.parentElement.remove();
            } else {
              el.remove();
            }
          }
        });
      }
    }
    
    // Update participants list when media is removed
    updateParticipants();
  }

  // Function to create local screen share preview for the presenter
  function createLocalScreenSharePreview(stream) {
    // Remove existing preview if any
    const existingPreview = document.getElementById('local-screen-share');
    if (existingPreview) {
      existingPreview.remove();
    }

    // Create screen share preview container
    const screenShareContainer = document.createElement('div');
    screenShareContainer.id = 'local-screen-share';
    screenShareContainer.className = 'local-screen-share-container';
    
    // Create video element for screen share preview
    const screenVideo = document.createElement('video');
    screenVideo.autoplay = true;
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    screenVideo.srcObject = stream;
    screenVideo.className = 'local-screen-share-video';
    
    // Create "You are presenting" indicator
    const indicator = document.createElement('div');
    indicator.className = 'presenting-indicator';
    indicator.innerHTML = '🖥️ You are presenting';
    
    screenShareContainer.appendChild(screenVideo);
    screenShareContainer.appendChild(indicator);
    
    // Add to the video grid
    if (remoteVideosRef.current) {
      remoteVideosRef.current.appendChild(screenShareContainer);
    }
  }

  const streamSuccess = async (stream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    } else {
      console.error('localVideoRef.current is null in streamSuccess');
    }
    
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    videoparams.track = videoTrack;
    audioParams.track = audioTrack;
    
    console.log('Local stream acquired successfully');
  };

  async function pickMic() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      return audioDevices.length > 0 ? audioDevices[0].deviceId : null;
    } catch (error) {
      console.error('Error picking microphone:', error);
      return null;
    }
  }

  const getLocalStream = async () => {
    console.log('Getting local stream with optimized constraints...');
    
    // Use pickMic to get the preferred microphone device
    const preferredMicId = await pickMic();
    
    const constraints = {
      audio: {
        deviceId: preferredMicId ? { exact: preferredMicId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 }
      }
    };
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Local stream acquired successfully with preferred microphone');
      await streamSuccess(stream);
    } catch (error) {
      console.error('Error getting local stream:', error);
      throw error;
    }
  };

  const createDevice = async () => {
    try {
      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      console.log('Device created and loaded');
    } catch (error) {
      console.error('Error creating device:', error);
      throw error;
    }
  };

  const getRtpCapabilities = () => {
    return new Promise((resolve, reject) => {
      socket.emit('getRtpCapabilities', { roomId: roomId }, (response) => {
        if (response.error) {
          console.error('Error getting RTP capabilities:', response.error);
          reject(response.error);
          return;
        }
        
        rtpCapabilities = response.rtpCapabilities;
        console.log('RTP capabilities received:', rtpCapabilities);
        resolve();
      });
    });
  };

  const createSendTransport = () => {
    return new Promise((resolve, reject) => {
      socket.emit('createWebRtcTransport', { sender: true, roomId: roomId }, (response) => {
        if (response.error || response.params?.error) {
          const error = response.error || response.params.error;
          console.error('Producer transport creation error:', error);
          reject(error);
          return;
        }

        console.log('Producer transport params:', response.params);
        
        producerTransport = device.createSendTransport({
          ...response.params,
          iceServers: iceServers
        });

        producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await new Promise((resolve, reject) => {
              socket.emit('transport-connect', {
                dtlsParameters,
                transportId: producerTransport.id,
                roomId: roomId
              }, (error) => {
                if (error) {
                  console.error('Producer transport connect error:', error);
                  reject(error);
                } else {
                  console.log('Producer transport connected');
                  resolve();
                }
              });
            });
            callback();
          } catch (error) {
            console.error('Producer transport connect error:', error);
            errback(error);
          }
        });

        producerTransport.on('produce', async (parameters, callback, errback) => {
          try {
            const response = await new Promise((resolve, reject) => {
              socket.emit('transport-produce', {
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters,
                appData: parameters.appData,
                transportId: producerTransport.id,
                roomId: roomId
              }, (response) => {
                if (response.error) {
                  reject(response.error);
                } else {
                  resolve(response);
                }
              });
            });
            
            callback({ id: response.id });
          } catch (error) {
            console.error('Producer transport produce error:', error);
            errback(error);
          }
        });

        resolve();
      });
    });
  };

  const connectSendTransport = async () => {
    try {
      if (videoparams.track) {
        const vProducer = await producerTransport.produce(videoparams);
        setVideoProducer(vProducer);
        
        vProducer.on('trackended', () => {
          console.log('Video track ended');
          setVideoProducer(null);
        });
        
        vProducer.on('transportclose', () => {
          console.log('Video producer transport closed');
          setVideoProducer(null);
        });
      }
      
      if (audioParams.track) {
        const aProducer = await producerTransport.produce(audioParams);
        setAudioProducer(aProducer);
        
        aProducer.on('trackended', () => {
          console.log('Audio track ended');
          setAudioProducer(null);
        });
        
        aProducer.on('transportclose', () => {
          console.log('Audio producer transport closed');
          setAudioProducer(null);
        });
      }
    } catch (error) {
      console.error('Error connecting send transport:', error);
    }
  };

  const createRecvTransport = () => {
    return new Promise((resolve, reject) => {
      socket.emit('createWebRtcTransport', { sender: false, roomId: roomId }, (response) => {
        if (response.error || response.params?.error) {
          const error = response.error || response.params.error;
          console.error('Consumer transport creation error:', error);
          reject(error);
          return;
        }

        console.log('Consumer transport params:', response.params);
        
        consumerTransport = device.createRecvTransport({
          ...response.params,
          iceServers: iceServers
        });

        consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await new Promise((resolve, reject) => {
              socket.emit('transport-recv-connect', {
                dtlsParameters,
                transportId: consumerTransport.id,
                roomId: roomId
              }, (error) => {
                if (error) {
                  console.error('Consumer transport connect error:', error);
                  reject(error);
                } else {
                  console.log('Consumer transport connected');
                  resolve();
                }
              });
            });
            callback();
          } catch (error) {
            console.error('Consumer transport connect error:', error);
            errback(error);
          }
        });

        resolve();
      });
    });
  };

  const connectRecvTransport = async (producerInfo, isNewProducer = false) => {
    try {
      const consumer = await consumerTransport.consume({
        id: producerInfo.id,
        producerId: producerInfo.producerId,
        kind: producerInfo.kind,
        rtpParameters: producerInfo.rtpParameters
      });

      const { track } = consumer;
      addRemoteMedia(producerInfo.producerId, track, producerInfo.kind, producerInfo.peerId, producerInfo.appData, isNewProducer);
      
      // Store consumer
      const entry = consumers.get(producerInfo.producerId) || {};
      entry.consumer = consumer;
      consumers.set(producerInfo.producerId, entry);

      socket.emit('consumer-resume', { consumerId: consumer.id, roomId: roomId });
    } catch (error) {
      console.error('Error connecting recv transport:', error);
    }
  };

  const setupMediasoupPipeline = async () => {
    // Prevent multiple simultaneous setups
    if (isSettingUpPipeline) {
      console.log('Pipeline setup already in progress, skipping...');
      return;
    }
    
    isSettingUpPipeline = true;
    setIsInRoom(true); // hide room setup immediately
    
    try {
      console.log('Starting Mediasoup pipeline setup...');
      
      // Clean up existing transports and producers to prevent conflicts
      if (producerTransport) {
        console.log('Cleaning up existing producer transport');
        producerTransport.close();
        producerTransport = null;
      }
      
      if (consumerTransport) {
        console.log('Cleaning up existing consumer transport');
        consumerTransport.close();
        consumerTransport = null;
      }
      
      // Clean up existing producers
      if (videoProducer) {
        console.log('Cleaning up existing video producer');
        videoProducer.close();
        setVideoProducer(null);
      }
      
      if (audioProducer) {
        console.log('Cleaning up existing audio producer');
        audioProducer.close();
        setAudioProducer(null);
      }
      
      // Clean up existing consumers
      consumers.forEach(({ consumer }) => {
        if (consumer) {
          console.log('Cleaning up existing consumer:', consumer.id);
          consumer.close();
        }
      });
      consumers.clear();
      
      // Reset device if it exists
      if (device) {
        console.log('Resetting device');
        device = null;
      }
      
      rtpCapabilities = null;
      
      // Wait for component to be fully mounted before accessing refs
      if (!localVideoRef.current) {
        console.log('Waiting for component to mount...');
        await new Promise(resolve => {
          const checkMount = () => {
            if (localVideoRef.current) {
              resolve();
            } else {
              setTimeout(checkMount, 100);
            }
          };
          checkMount();
        });
      }
      
      console.log('Step 1: Getting local stream');
      await getLocalStream();
      console.log('Step 2: Getting RTP capabilities');
      await getRtpCapabilities();
      console.log('Step 3: Creating device');
      await createDevice();
      console.log('Step 4: Creating send transport');
      await createSendTransport();
      console.log('Step 5: Connecting send transport');
      await connectSendTransport();
      console.log('Step 6: Creating recv transport');
      await createRecvTransport();
      // We'll consume producers as they become available in the room
      console.log('Mediasoup pipeline initialized successfully.');
    } catch (error) {
      console.error('Error setting up Mediasoup pipeline:', error);
      console.error('Error details:', error.message, error.stack);
      alert('Failed to set up video call. See console for details.');
      setIsInRoom(false); // show room setup again on error
    } finally {
      isSettingUpPipeline = false; // Reset flag regardless of success or failure
    }
  };

  function toggleMic() {
    console.log('toggleMic called, audioProducer:', audioProducer);
    if (audioProducer && !audioProducer.paused) {
      audioProducer.pause();
      setIsMicOn(false);
      console.log('Mic OFF');
      // Broadcast status change to other participants
      if (socket) {
        socket.emit('status-changed', {
          roomId: roomId,
          peerId: socket.id,
          isMuted: true,
          isCameraOff: !isCamOn
        });
      }
    } else if (audioProducer) {
      audioProducer.resume();
      setIsMicOn(true);
      console.log('Mic ON');
      // Broadcast status change to other participants
      if (socket) {
        socket.emit('status-changed', {
          roomId: roomId,
          peerId: socket.id,
          isMuted: false,
          isCameraOff: !isCamOn
        });
      }
    } else {
      console.log('No audioProducer available');
    }
  }

  function toggleCam() {
    console.log('toggleCam called, videoProducer:', videoProducer);
    if (videoProducer && !videoProducer.paused) {
      videoProducer.pause();
      setIsCamOn(false);
      console.log('Cam OFF');
      // Broadcast status change to other participants
      if (socket) {
        socket.emit('status-changed', {
          roomId: roomId,
          peerId: socket.id,
          isMuted: !isMicOn,
          isCameraOff: true
        });
      }
    } else if (videoProducer) {
      videoProducer.resume();
      setIsCamOn(true);
      console.log('Cam ON');
      // Broadcast status change to other participants
      if (socket) {
        socket.emit('status-changed', {
          roomId: roomId,
          peerId: socket.id,
          isMuted: !isMicOn,
          isCameraOff: false
        });
      }
    } else {
      console.log('No videoProducer available');
    }
  }

  async function toggleScreenShare() {
    // Stop previous share if running
    if (screenVideoProducer) {
      // Notify server about producer closure before closing locally
      socket.emit('producerClosed', {
        producerId: screenVideoProducer.id,
        appData: screenVideoProducer.appData
      });
      
      if (screenAudioProducer) {
        socket.emit('producerClosed', {
          producerId: screenAudioProducer.id,
          appData: screenAudioProducer.appData
        });
      }
      
      screenVideoProducer.close();
      screenAudioProducer?.close();
      setScreenVideoProducer(null);
      setScreenAudioProducer(null);
      setIsScreenSharing(false);
      
      // Remove local screen share preview
      const localScreenShare = document.getElementById('local-screen-share');
      if (localScreenShare) {
        localScreenShare.remove();
      }
      
      console.log('Screen share stopped and server notified');
      return;
    }

    try {
      // Browser will pop the native picker
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,          // always required
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        }           // shows "Share audio" checkbox if available
      });

      const [videoTrack] = stream.getVideoTracks();
      const [audioTrack] = stream.getAudioTracks();

      // Create local screen share preview for the presenter
      createLocalScreenSharePreview(stream);

      // Produce the screen video
      const sVideoProducer = await producerTransport.produce({
        track: videoTrack,
        kind: 'video',
        appData: { mediaType: 'screenShare' }
      });
      setScreenVideoProducer(sVideoProducer);

      // Produce system/tab audio if user ticked the checkbox
      if (audioTrack) {
        const sAudioProducer = await producerTransport.produce({
          track: audioTrack,
          kind: 'audio',
          appData: { mediaType: 'screenShareAudio' }
        });
        setScreenAudioProducer(sAudioProducer);
      }

      // Auto-close when user clicks "Stop sharing" in the browser UI
      videoTrack.onended = () => {
        console.log('Screen share ended from browser UI');
        // Clean up local preview
        const localScreenShare = document.getElementById('local-screen-share');
        if (localScreenShare) {
          localScreenShare.remove();
        }
        
        // Close producers and notify server
        if (screenVideoProducer) {
          screenVideoProducer.close();
          setScreenVideoProducer(null);
        }
        if (screenAudioProducer) {
          screenAudioProducer.close();
          setScreenAudioProducer(null);
        }
        
        setIsScreenSharing(false);
        console.log('Screen share cleanup completed');
      };
      
      setIsScreenSharing(true);
      console.log('Screen share started');
    } catch (error) {
      console.error('Error starting screen share:', error);
    }
  }

  const leaveRoom = () => {
    console.log('Leaving room...');
    
    // Close all producers
    if (videoProducer) {
      videoProducer.close();
      setVideoProducer(null);
    }
    if (audioProducer) {
      audioProducer.close();
      setAudioProducer(null);
    }
    if (screenVideoProducer) {
      screenVideoProducer.close();
      setScreenVideoProducer(null);
    }
    if (screenAudioProducer) {
      screenAudioProducer.close();
      setScreenAudioProducer(null);
    }
    
    // Close transports
    if (producerTransport) {
      producerTransport.close();
      producerTransport = null;
    }
    if (consumerTransport) {
      consumerTransport.close();
      consumerTransport = null;
    }
    
    // Stop local media stream
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      const stream = localVideoRef.current.srcObject;
      stream.getTracks().forEach(track => track.stop());
      localVideoRef.current.srcObject = null;
    }
    
    // Close all consumers
    consumers.forEach(({ consumer }) => consumer?.close());
    consumers.clear();
    peerVideos.clear();
    
    // Disconnect socket
    if (socket) {
      socket.disconnect();
    }
    
    // Reset state
    setIsInRoom(false);
    setDisplayRoomCode('N/A');
    setIsMicOn(true);
    setIsCamOn(true);
    setIsScreenSharing(false);
    setIsHost(false);
    setHostId(null);
    
    // Reset global variables
    roomId = null;
    device = null;
    rtpCapabilities = null;
    
    // Navigate back to lobby
    navigate('/');
  };

  const joinRoomFromUrl = async () => {
    console.log('joinRoomFromUrl called with urlRoomId:', urlRoomId);
    if (!urlRoomId) {
      console.error('No room ID provided in URL, urlRoomId is:', urlRoomId);
      alert('No room ID provided in URL');
      return;
    }
    roomId = urlRoomId;
    console.log('Setting roomId to:', roomId);

    // Check if user was auto-joined from createRoom
    const urlParams = new URLSearchParams(window.location.search);
    const autoJoined = urlParams.get('autoJoined') === 'true';
    
    if (autoJoined) {
      console.log('Auto-joined from createRoom, setting up room state');
      setDisplayRoomCode(roomId);
      
      // Since we're using the same socket connection, verify room membership with server
      socket.emit('getRoomInfo', { roomId }, async (response) => {
        if (response.error) {
          console.error('Error getting room info:', response.error);
          // Fallback to localStorage if server call fails
          const storedHostId = localStorage.getItem(`room_${roomId}_host_id`);
          const wasHost = localStorage.getItem(`room_${roomId}_was_host`) === 'true';
          setIsHost(wasHost);
          setHostId(storedHostId || socket.id);
        } else {
          // Use server response for accurate host information
          console.log("\n\n\n\n\n\n\n " , response);
          setIsHost(response.isHost);
          setHostId(response.hostId);
          console.log('Server confirmed room membership:', {
            isHost: response  .isHost,
            hostId: response.hostId,
            currentSocketId: socket.id
          });
        }
        
        // Set room join time for current user
        const joinTime = new Date();
        setRoomJoinTime(joinTime);
        setParticipantJoinTimes(prev => new Map(prev.set(socket.id, joinTime)));
        
        console.log('Auto-join setup complete:', {
          isHost: response?.isHost || localStorage.getItem(`room_${roomId}_was_host`) === 'true',
          hostId: response?.hostId || localStorage.getItem(`room_${roomId}_host_id`) || socket.id,
          currentSocketId: socket.id
        });
        
        // Add a small delay to ensure server has processed room membership
        setTimeout(async () => {
          try {
            // Set up Mediasoup pipeline after server confirms room membership
            await setupMediasoupPipeline();
            
            // Request existing producers
            requestExistingProducers();
            
            // Mark as successfully joined
        setIsInRoom(true);
        console.log('Auto-join completed, setIsInRoom(true) called');
        
        // Note: User is already auto-joined to chat on server side during joinRoom
        // No need to emit join-chat again to avoid duplicate join messages
        
        // Broadcast initial status to other participants
        setTimeout(() => {
          if (socket) {
            socket.emit('status-changed', {
              roomId: roomId,
              peerId: socket.id,
              isMuted: !isMicOn,
              isCameraOff: !isCamOn
            });
          }
        }, 1000);
          } catch (error) {
            console.error('Error during auto-join setup:', error);
            setIsInRoom(false);
          }
        }, 500); // 500ms delay to ensure server processing
      });
      
      return;
    }

    try {
      // Get user information before joining
      const userInfo = await getCurrentUserInfo();
      
      // Inform the server about joining a room
      socket.emit('joinRoom', { roomId: roomId, userInfo: userInfo }, async (response) => {
        if (response.error) {
          console.error('Error joining room:', response.error);
          alert('Failed to join room: ' + response.error);
          return;
        }
        console.log('Successfully joined room:', roomId);
        setDisplayRoomCode(roomId);
        
        // Store host information in localStorage
        if (response.isHost) {
          localStorage.setItem(`room_${roomId}_host_socket`, socket.id);
          localStorage.setItem(`room_${roomId}_was_host`, 'true');
        }
        
        // Set host status based on server response
        const finalIsHost = response.isHost || false;
        const finalHostId = response.hostId || null;
        
        setIsHost(finalIsHost);
        setHostId(finalHostId);
        
        console.log('Host detection result:', {
          serverIsHost: response.isHost,
          serverHostId: response.hostId,
          finalIsHost,
          finalHostId,
          currentSocketId: socket.id
        });
        
        // Set room join time for current user
        const joinTime = new Date();
        setRoomJoinTime(joinTime);
        setParticipantJoinTimes(prev => new Map(prev.set(socket.id, joinTime)));
        
        if (response.isHost) {
          console.log('You are the host of this room');
        } else if (response.hostId) {
          console.log('Room host ID:', response.hostId);
        }

        // Now, set up Mediasoup pipeline
        await setupMediasoupPipeline();
        
        // Request existing producers with hostId context
        requestExistingProducers(finalHostId);
        
        // Mark as successfully joined
        setIsInRoom(true);
        console.log('Regular join completed, setIsInRoom(true) called');
        
        // Get all participants from server
        socket.emit('getParticipants', { roomId }, (response) => {
          if (!response.error && response.participants) {
            console.log('Received participants from server:', response.participants);
            // Update participants list with names from server
            setParticipants(prev => {
              const updatedParticipants = [...prev];
              response.participants.forEach(serverParticipant => {
                const existingIndex = updatedParticipants.findIndex(p => p.id === serverParticipant.id);
                if (existingIndex >= 0) {
                  updatedParticipants[existingIndex] = {
                    ...updatedParticipants[existingIndex],
                    name: serverParticipant.name
                  };
                }
              });
              return updatedParticipants;
            });
          }
        });
        
        // Note: User is already auto-joined to chat on server side during joinRoom
        // No need to emit join-chat again to avoid duplicate join messages
        
        // Register profile with server
        if (userInfo) {
          // Get JWT token from localStorage
          const token = localStorage.getItem('jwt') || sessionStorage.getItem('jwt');
          if (token) {
            socket.emit('register-profile', { 
              token,
              roomId
            });
          } else {
            console.warn('No JWT token found for profile registration');
          }
        }
        
        // Get all participant profiles
        socket.emit('get-participant-profiles', { roomId }, (profiles) => {
          console.log('Received participant profiles:', profiles);
          const profilesMap = new Map();
          Object.entries(profiles).forEach(([socketId, profile]) => {
            profilesMap.set(socketId, profile);
          });
          setParticipantProfiles(profilesMap);
          updateVideoTileLabels();
          updateParticipants();
        });
        
        // Broadcast initial status to other participants
        setTimeout(() => {
          if (socket) {
            socket.emit('status-changed', {
              roomId: roomId,
              peerId: socket.id,
              isMuted: !isMicOn,
              isCameraOff: !isCamOn
            });
          }
        }, 1000); // Small delay to ensure everything is set up
      });
    } catch (error) {
      console.error('Error in joinRoomFromUrl:', error);
    }
  };

  const requestExistingProducers = () => {
    console.log("trying to get the producers in the room");
    const myPids = [videoProducer?.id, audioProducer?.id].filter(Boolean);

    socket.emit('getProducersInRoom', { roomId: roomId }, (response) => {
      if (response.error) {
        console.error('Error getting producers in room:', response.error);
        return;
      }
      console.log('Existing producers in room:', response.producerIds);
      response.producerIds.forEach(async (producerId) => {
        if (!myPids.includes(producerId)) { // Don't consume our own producer
          // Request server for consumer parameters for this producer
          socket.emit('consume', { producerId: producerId, rtpCapabilities: device.rtpCapabilities, roomId: roomId }, (consumerResponse) => {
            if (consumerResponse.error) {
              console.error('Error creating consumer for existing producer:', consumerResponse.error);
              return;
            }
            console.log('Consumer response for existing producer:', consumerResponse.params);
                connectRecvTransport(consumerResponse.params, false); // Existing producer, no notification
          });
        }
      });
    });
  };

  // Socket initialization and event handlers
  useEffect(() => {
    // Note: socket is imported directly, no need to reassign
    let hasJoined = false; // Prevent multiple join attempts

    const handleJoinRoom = () => {
      if (urlRoomId && !hasJoined) {
        hasJoined = true;
        joinRoomFromUrl();
      }
    };

    // Check if socket is already connected
    if (socket.connected) {
      console.log('Using existing socket connection with ID:', socket.id);
      // Auto-join room from URL if socket is already connected
      handleJoinRoom();
    }

    const handleConnectionSuccess = ({ socketId }) => {
      console.log('Connected with socket ID:', socketId);
      // Auto-join room from URL after socket connection
      handleJoinRoom();
    };

    const handleConnect = () => {
      console.log('Socket connected with ID:', socket.id);
      // Auto-join room from URL after socket connection
      handleJoinRoom();
    };

    socket.on('connection-success', handleConnectionSuccess);
    socket.on('connect', handleConnect);

    socket.on('activeSpeaker', ({ peerId }) => { // Now receives peerId
      // Remove all highlights
      document.querySelectorAll('.video-container').forEach(container => container.classList.remove('active'));
      document.querySelectorAll('.video').forEach(t => t.classList.remove('active'));
      console.log('CLIENT activeSpeaker', peerId);
      
      // Highlight video for this peer
      const videoEl = peerVideos.get(peerId);
      if (videoEl) {
        // Add active class to both video element and its container
        videoEl.classList.add('active');
        const container = videoEl.closest('.video-container');
        if (container) {
          container.classList.add('active');
        }
        videoEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    socket.on('disconnect', () => {
      setIsInRoom(false);
      setDisplayRoomCode('N/A');
      
      console.log('Disconnected from server');
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      // Reset room state
      roomId = null;
      device = null;
      rtpCapabilities = null;
      producerTransport = null;
      consumerTransport = null;
      setVideoProducer(null);
      setAudioProducer(null);
      setScreenVideoProducer(null);
      setScreenAudioProducer(null);
      consumers.forEach(({ consumer }) => consumer?.close());
      consumers.clear();
      peerVideos.clear();
    });

    // Listen for peer status changes
    socket.on('peer-status-changed', ({ peerId, isMuted, isCameraOff }) => {
      setRemotePeerStatus(prev => {
        const newMap = new Map(prev);
        newMap.set(peerId, { isMuted, isCameraOff });
        return newMap;
      });
      updateParticipants(); // Update participants list
      updateVideoTileStatus(peerId, isMuted, isCameraOff); // Update video tile indicators
    });

    // Listen for peer disconnection to clean up status
    socket.on('peer-disconnected', ({ peerId }) => {
      setRemotePeerStatus(prev => {
        const newMap = new Map(prev);
        newMap.delete(peerId);
        return newMap;
      });
      updateParticipants();
    });

    // Listen for host mute requests
    socket.on('host-mute-request', ({ roomId, shouldMute }) => {
      console.log(`Host requested to ${shouldMute ? 'mute' : 'unmute'} this participant`);
      if (shouldMute && isMicOn) {
        // Mute the participant
        toggleMic();
      } else if (!shouldMute && !isMicOn) {
        // Unmute the participant
        toggleMic();
      }
    });

    // Listen for host changes
    socket.on('host-changed', ({ newHostId, roomId: changedRoomId }) => {
      console.log(`Host changed in room ${changedRoomId}: new host is ${newHostId}`);
      if (changedRoomId === roomId) {
        setHostId(newHostId);
        setIsHost(socket?.id === newHostId);
        // Update video tile labels when host changes
        setTimeout(() => updateVideoTileLabels(), 100);
        updateParticipants(); // Refresh participant list to reflect host change
        console.log(`Updated host status: isHost=${socket?.id === newHostId}, hostId=${newHostId}`);
      }
    });

    // Listen for participant joined events
    socket.on('participant-joined', ({ participantId, userInfo, hostId: serverHostId, roomId: joinedRoomId }) => {
      console.log(`Participant ${participantId} joined room ${joinedRoomId}, server hostId: ${serverHostId}`, userInfo);
      if (joinedRoomId === roomId) {
        // Track join time for new participant
        const currentTime = new Date();
        setParticipantJoinTimes(prev => new Map(prev.set(participantId, currentTime)));
        
        // Store participant information for name lookup
        if (userInfo) {
          setParticipants(prev => {
            const existing = prev.find(p => p.id === participantId);
            if (existing) {
              return prev.map(p => p.id === participantId ? { ...p, name: userInfo.name } : p);
            } else {
              return [...prev, {
                id: participantId,
                name: userInfo.name,
                isHost: participantId === serverHostId,
                isMuted: false,
                isCameraOff: false,
                joinedAt: currentTime,
                isCurrentUser: false
              }];
            }
          });
        }
        
        // Only update hostId if it's different, but don't change isHost status
        // The isHost status should only be set during initial room join or host-changed events
        if (serverHostId && serverHostId !== hostId) {
          console.log(`Updating hostId from ${hostId} to ${serverHostId}`);
          setHostId(serverHostId);
          // Update video tile labels when hostId changes
          setTimeout(() => updateVideoTileLabels(), 100);
        }
        
        console.log(`Participant ${participantId} joined. Host status unchanged: isHost=${isHost}, hostId=${hostId}`);
        updateParticipants();
      }
    });

    // Listen for profile updates
    socket.on('profile-updated', ({ socketId, profile }) => {
      console.log('Profile updated for:', socketId, profile);
      setParticipantProfiles(prev => new Map(prev.set(socketId, profile)));
      updateVideoTileLabels();
      updateParticipants();
    });

    // Listen for all participant profiles
    socket.on('participant-profiles-updated', (profiles) => {
      console.log('All participant profiles updated:', profiles);
      const profilesMap = new Map();
      Object.entries(profiles).forEach(([socketId, profile]) => {
        profilesMap.set(socketId, profile);
      });
      setParticipantProfiles(profilesMap);
      updateVideoTileLabels();
      updateParticipants();
    });

    // Listen for poll updates
    socket.on('poll-created', (pollData) => {
      console.log('New poll created:', pollData);
      // This will be handled by PollBox component
    });

    socket.on('poll-voted', (voteData) => {
      console.log('Poll vote received:', voteData);
      // This will be handled by PollBox component
    });

    socket.on('poll-closed', (pollData) => {
      console.log('Poll closed:', pollData);
      // This will be handled by PollBox component
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socket.on('newProducer', (data) => {
        console.log('New producer announced:', data);
        const myPids = [videoProducer?.id, audioProducer?.id].filter(Boolean);
        if (data.producerId && !myPids.includes(data.producerId)) { // Don't consume our own producer
            // Track join time for new participants (only if not already tracked)
            if (data.peerId && !participantJoinTimes.has(data.peerId)) {
              const currentTime = new Date();
              setParticipantJoinTimes(prev => new Map(prev.set(data.peerId, currentTime)));
            }
            // Request server for consumer parameters for this new producer
            socket.emit('consume', { producerId: data.producerId, rtpCapabilities: device.rtpCapabilities, roomId: roomId }, (consumerResponse) => {
                if (consumerResponse.error) {
                    console.error('Error creating consumer for new producer:', consumerResponse.error);
                    return;
                }
                console.log('Consumer response for new producer:', consumerResponse.params);
                connectRecvTransport(consumerResponse.params, true); // New producer, show notification
            });
        }
    });

    // Hand raise event listeners
    socket.on('hand-raised', ({ userId, userName, timestamp }) => {
      setRaisedHands(prev => {
        const existing = prev.find(hand => hand.userId === userId);
        if (existing) return prev;
        return [...prev, { userId, userName: userName || `User ${userId.slice(-4)}`, timestamp }];
      });
    });

    socket.on('hand-lowered', ({ userId }) => {
      setRaisedHands(prev => prev.filter(hand => hand.userId !== userId));
    });

    socket.on('hands-cleared', () => {
      setRaisedHands([]);
    });

    // Poll event listeners are handled by PollBox component to avoid conflicts

    socket.on('user-voted', (voteData) => {
      console.log('User voted event received in Room:', voteData);
      // The PollBox component will handle this when it's opened
    });

    // Listener for producers removed from the room
    socket.on('producerClosed', ({ producerId, appData }) => {
      console.log('Producer closed:', producerId, 'appData:', appData);
      
      // Remove the remote media for all participants, passing appData for better cleanup
      removeRemoteMedia(producerId, appData);
      
      // If this was our own screen share producer, clean up local preview
      if (screenVideoProducer && screenVideoProducer.id === producerId) {
        const localScreenShare = document.getElementById('local-screen-share');
        if (localScreenShare) {
          localScreenShare.remove();
        }
        setScreenVideoProducer(null);
        setIsScreenSharing(false);
        console.log('Local screen share producer closed and cleaned up');
      }
      if (screenAudioProducer && screenAudioProducer.id === producerId) {
        setScreenAudioProducer(null);
        console.log('Local screen audio producer closed');
      }
      
      // Enhanced cleanup for screen shares using data attributes
      if (appData && (appData.mediaType === 'screenShare' || appData.mediaType === 'screenShareAudio')) {
        console.log('Enhanced screen share cleanup for producer:', producerId);
        
        // Remove elements by producerId data attribute
        if (remoteVideosRef.current) {
          const elementsToRemove = remoteVideosRef.current.querySelectorAll(
            `[data-producer-id="${producerId}"], .screen-share[data-producer-id="${producerId}"], [data-media-type="screenShare"][data-producer-id="${producerId}"]`
          );
          
          elementsToRemove.forEach(element => {
            console.log('Removing screen share element:', element);
            if (element.tagName === 'VIDEO' && element.parentElement?.className === 'video-container') {
              element.parentElement.remove();
            } else {
              element.remove();
            }
          });
        }
        
        // Fallback: remove any remaining screen share elements
        const allScreenShares = document.querySelectorAll('.screen-share, [data-media-type="screenShare"]');
        allScreenShares.forEach(element => {
          if (element.getAttribute('data-producer-id') === producerId) {
            console.log('Fallback removal of screen share element:', element);
            if (element.tagName === 'VIDEO' && element.parentElement?.className === 'video-container') {
              element.parentElement.remove();
            } else {
              element.remove();
            }
          }
        });
      }
    });

    // Handle being removed from room
    socket.on('removed-from-room', ({ roomId, reason }) => {
      alert(`You have been removed from the room. Reason: ${reason}`);
      // Redirect to lobby
      window.location.href = '/';
    });

    // Handle participant removal notification
    socket.on('participant-removed', ({ participantId }) => {
      console.log(`Participant ${participantId} was removed from the room`);
      // The participant list will update automatically through the disconnect event
    });

    return () => {
      // Clean up event listeners
      socket.off('connection-success', handleConnectionSuccess);
      socket.off('connect', handleConnect);
      socket.off('activeSpeaker');
      socket.off('disconnect');
      socket.off('peer-status-changed');
      socket.off('peer-disconnected');
      socket.off('host-mute-request');
      socket.off('host-changed');
      socket.off('participant-joined');
      socket.off('participant-removed');
      socket.off('profile-updated');
      socket.off('participant-profiles-updated');
      socket.off('poll-created');
      socket.off('poll-voted');
      socket.off('poll-closed');
    };
  }, [urlRoomId]); // Only re-run when urlRoomId changes

  // Function to update status indicators on video tiles
  const updateVideoTileStatus = (peerId, isMuted, isCameraOff) => {
    if (remoteVideosRef.current) {
      const videoContainer = remoteVideosRef.current.querySelector(`[data-peer-id="${peerId}"]`);
      if (videoContainer) {
        const muteIndicator = videoContainer.querySelector('.mute-indicator');
        const cameraIndicator = videoContainer.querySelector('.camera-indicator');
        const avatarContainer = videoContainer.querySelector('.avatar-container');
        const video = videoContainer.querySelector('video');
        
        if (muteIndicator) {
          muteIndicator.style.display = isMuted ? 'block' : 'none';
        }
        if (cameraIndicator) {
          cameraIndicator.style.display = isCameraOff ? 'block' : 'none';
        }
        
        // Show/hide avatar when camera is off
        if (avatarContainer && video) {
          if (isCameraOff) {
            // Camera is off - show avatar, hide video
            avatarContainer.style.display = 'flex';
            video.style.display = 'none';
            // Add blur effect to video when camera is off
            video.style.filter = 'blur(10px)';
          } else {
            // Camera is on - check if video has actual content
            const hasVideo = video.videoWidth > 0 && video.videoHeight > 0 && !video.paused;
            if (hasVideo) {
              avatarContainer.style.display = 'none';
              video.style.display = 'block';
              video.style.filter = 'none'; // Remove blur
            } else {
              // Video exists but no content - show avatar
              avatarContainer.style.display = 'flex';
              video.style.display = 'none';
              video.style.filter = 'blur(10px)';
            }
          }
        }
      }
    }
  };

  // Function to remove participant (host only)
  const handleRemoveParticipant = (participantId) => {
    if (isHost && socket) {
      socket.emit('remove-participant', { roomId, participantId });
      console.log('Removing participant:', participantId);
    }
  };

  // Function to mute/unmute participant (host only)
  const handleMuteParticipant = (participantId, shouldMute) => {
    if (isHost && socket) {
      socket.emit('mute-participant', { roomId, participantId, shouldMute });
      console.log(`${shouldMute ? 'Muting' : 'Unmuting'} participant:`, participantId);
    }
  };

  // Update displayRoomCode when urlRoomId changes
  useEffect(() => {
    if (urlRoomId) {
      setDisplayRoomCode(urlRoomId);
      console.log('Updated displayRoomCode to:', urlRoomId);
    }
  }, [urlRoomId]);

  // Update participants when mic/camera states change
  useEffect(() => {
    updateParticipants();
  }, [isMicOn, isCamOn, consumers, socket?.id, isHost, hostId]);

  // Update hand raise indicators on video tiles
  useEffect(() => {
    if (remoteVideosRef.current) {
      const videoContainers = remoteVideosRef.current.querySelectorAll('[data-peer-id]');
      videoContainers.forEach(container => {
        const peerId = container.getAttribute('data-peer-id');
        const handIndicator = container.querySelector('.hand-raise-indicator');
        if (handIndicator) {
          const hasRaisedHand = raisedHands.some(hand => hand.userId === peerId);
          handIndicator.style.display = hasRaisedHand ? 'block' : 'none';
        }
      });
    }
  }, [raisedHands]);

  // Update video tile labels when hostId changes
  useEffect(() => {
    updateVideoTileLabels();
  }, [hostId]);

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(displayRoomCode);
      alert('Room code copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy room code:', err);
      alert('Failed to copy room code. Please copy manually: ' + displayRoomCode);
    }
  };

  if (!isInRoom) {
    return (
      <div className="room-loading">
        <div className="loading-content">
          <div className="loading-spinner-large"></div>
          <h2>Connecting to room</h2>
          <p className="room-code-display">
            <span className="room-label">Room Code:</span>
            <span className="room-code">{displayRoomCode}</span>
          </p>
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="room">
      <div className="room-header">
        <div className="room-info">
          <h2>Room: {displayRoomCode}</h2>
          {hostId && (
            <div className="host-info">
              <span className="host-indicator">
                👑 Host: {isHost ? 'You' : `User ${hostId.slice(-6)}`}
              </span>
            </div>
          )}
        </div>
        <button onClick={copyRoomCode} className="copy-btn">
          📋 Copy Code
        </button>
      </div>
      
      {/* Presenter notification */}
      {presenterNotification && (
        <div className="presenter-notification">
          <div className="notification-content">
            🖥️ <strong>{presenterNotification}</strong> is presenting
          </div>
        </div>
      )}
      
      <div className="video-grid">
        <div className={`video-container local-video-container ${isHost ? 'host-container' : ''}`}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video"
          />
          <div className="video-overlay">
            <span className="peer-label" style={isHost ? {background: 'rgba(16, 185, 129, 0.9)', border: '1px solid rgba(16, 185, 129, 0.3)'} : {}}>
              {isHost ? '👑 ' : ''}You{isHost ? ' (Host)' : ''}
            </span>
            {raisedHands.some(hand => hand.userId === (socket?.id || 'anonymous')) && (
              <div className="hand-raise-indicator">
                ✋
              </div>
            )}
          </div>
        </div>
        
        <div ref={remoteVideosRef} className="remote-videos-grid">
          {/* Remote videos will be dynamically added here */}
        </div>
      </div>
      
      <div className="controls-bar">
        <button 
          onClick={toggleMic} 
          className={`control-btn ${!isMicOn ? 'muted' : ''}`}
          title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {isMicOn ? '🎤' : '🔇'}
        </button>
        
        <button 
          onClick={toggleCam} 
          className={`control-btn ${!isCamOn ? 'disabled' : ''}`}
          title={isCamOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCamOn ? '📹' : '📷'}
        </button>
        
        <button 
          onClick={toggleScreenShare} 
          className={`control-btn ${isScreenSharing ? 'active' : ''}`}
          title={isScreenSharing ? 'Stop screen share' : 'Share screen'}
        >
          {isScreenSharing ? '🛑' : '🖥️'}
        </button>
        
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`control-btn ${isChatOpen ? 'active' : ''}`}
          title="Toggle chat"
        >
          💬
        </button>
        
        <button 
          onClick={() => setIsParticipantListOpen(!isParticipantListOpen)}
          className={`control-btn ${isParticipantListOpen ? 'active' : ''}`}
          title="Show participants"
        >
          👥
        </button>
        
        <button 
          onClick={() => setIsPollOpen(!isPollOpen)}
          className={`control-btn ${isPollOpen ? 'active' : ''}`}
          title="Toggle polls"
        >
          📊
        </button>
        
        <button 
          onClick={() => {
            alert('Recording feature will be added shortly!');
            setIsRecording(!isRecording);
          }}
          className={`control-btn ${isRecording ? 'active' : ''}`}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? '⏹️' : '⏺️'}
        </button>
        
        <HandRaise
            roomId={roomId}
            currentUserId={socket?.id || 'anonymous'}
            isHost={isHost}
            socket={socket}
            onRaisedHandsChange={setRaisedHands}
          />
        
        <button
          onClick={leaveRoom}
          className="control-btn leave-btn"
          title="Leave room"
        >
          📞
        </button>
      </div>
      
      <ChatBox
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          roomId={roomId}
          currentUserId={socket?.id || 'anonymous'}
          socket={socket}
        />
      
      <ParticipantList
          isOpen={isParticipantListOpen}
          onClose={() => setIsParticipantListOpen(false)}
          roomId={roomId}
          currentUserId={socket?.id || 'anonymous'}
          isHost={isHost}
          hostId={hostId}
          participants={participants}
          participantProfiles={participantProfiles}
          onRemoveParticipant={handleRemoveParticipant}
          onMuteParticipant={handleMuteParticipant}
        />
      
      <PollBox
          isOpen={isPollOpen}
          onClose={() => setIsPollOpen(false)}
          roomId={roomId}
          currentUserId={socket?.id || 'anonymous'}
          isHost={isHost}
          socket={socket}
          currentUserInfo={currentUserInfo}
        />
    </div>
  );
};

export default Room;