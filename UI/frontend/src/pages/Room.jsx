/* eslint-disable no-unused-vars */
import * as mediasoupClient from 'mediasoup-client';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatBox from '../components/ChatBox';
import HandRaise from '../components/HandRaise';
import ParticipantList from '../components/ParticipantList';
import PollBox from '../components/PollBox';
import socket from '../lib/socket';
import {
  MicIcon, MicOffIcon, CameraIcon, CameraOffIcon,
  ScreenShareIcon, StopScreenShareIcon, ChatIcon,
  UsersIcon, PollIcon, RecordIcon, StopRecordIcon
} from '../components/Icons';
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

// MOVED TO REFS:
// const consumers = new Map();
// const peerVideos = new Map(); // Maps peer IDs to video elements
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
    urls: 'turn:free.expressturn.com:3478',
    username: '000000002083993993',
    credential: 'jd1vHFiGtlJVQUfj/e0ouOSu4Rg='
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
  const [connectionError, setConnectionError] = useState(null);
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

  // Ref to track screen sharing state locally avoiding closure staleness
  const isScreenSharingRef = useRef(false);

  const localVideoRef = useRef();
  const remoteVideosRef = useRef();

  // Refs for tracking media state (fixes React StrictMode/Re-render issues)
  const consumersRef = useRef(new Map());
  const peerVideosRef = useRef(new Map());

  // Refs to prevent duplicate room joins (CRITICAL: prevents transport race conditions)
  const hasJoinedRef = useRef(false);
  const isJoiningRef = useRef(false);

  // Function to get current user information from database
  const getCurrentUserInfo = async () => {
    try {
      // 1. Check for SSO Token in URL (Priority)
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');

      if (urlToken) {
        try {
          // Basic JWT decode (if no library needed, or use jwt-decode if available)
          // Using simple base64 decode for the payload
          const base64Url = urlToken.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));

          const decoded = JSON.parse(jsonPayload);
          console.log("Using SSO Token identity:", decoded);

          const userInfo = {
            name: decoded.name || decoded.username || 'Learnsphere User',
            email: decoded.email,
            avatar: decoded.avatar_url || 'default-avatar.png',
            id: decoded.userId || decoded.id,
            isHost: decoded.isHost
          };

          setCurrentUserInfo(userInfo);
          if (decoded.isHost) {
            setIsHost(true);
          }

          // Store ephemerally if needed, or just rely on this state
          return userInfo;
        } catch (e) {
          console.error("Failed to parse SSO token from URL:", e);
        }
      }

      // 2. Get user info from localStorage or session
      const token = localStorage.getItem('jwt') || sessionStorage.getItem('jwt');
      const userEmail = localStorage.getItem('userEmail') || sessionStorage.getItem('userEmail');
      const userName = localStorage.getItem('userName') || sessionStorage.getItem('userName');
      const userAvatar = localStorage.getItem('userAvatar') || sessionStorage.getItem('userAvatar');

      if (userEmail && userName) {
        const apiBase = import.meta.env.VITE_API_BASE_URL || `https://${window.location.hostname}:4000`;
        const response = await fetch(`${apiBase}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const userInfo = {
            name: data.user.name,
            email: data.user.email,
            avatar: data.user.avatar_url || 'default-avatar.png',
            id: data.user.id
          };
          setCurrentUserInfo(userInfo);
          // Also update storage to keep it in sync
          localStorage.setItem('userName', userInfo.name);
          localStorage.setItem('userEmail', userInfo.email);
          return userInfo;
        }
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
      hostId,
      consumersCount: consumersRef.current.size,
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
    consumersRef.current.forEach((entry) => {
      // Strictly exclude current socket ID and any null/undefined peerIds
      if (entry.peerId && entry.peerId !== socket?.id) {
        uniquePeerIds.add(entry.peerId);
      }
    });

    uniquePeerIds.forEach(peerId => {
      console.log(hostId);
      const isRemoteHost = peerId === hostId;
      const joinTime = participantJoinTimes.get(peerId);
      console.log(`Participant ${peerId}: isHost=${isRemoteHost}, hostId=${hostId}, joinTime=${joinTime}`);

      // Try to get participant name from server
      const participantName = getParticipantName(peerId) || participantProfiles.get(peerId)?.name || 'Unknown User';
      const participantInfo = participantProfiles.get(peerId);

      participantList.push({
        id: peerId,
        name: participantName,
        isHost: isRemoteHost,
        isMuted: false, // You might want to track this via consumers
        isCameraOff: false, // You might want to track this via consumers
        joinedAt: joinTime || new Date(),
        isCurrentUser: false,
        ...participantInfo
      });
    });

    console.log('Final participant list:', participantList);
    setParticipants(participantList);
  };

  // Enhanced function to update video tile labels with profile data
  const updateVideoTileLabels = () => {
    const remoteVideos = remoteVideosRef.current;
    if (!remoteVideos) return;

    // First, update grid layout based on DOM elements
    updateGridLayout();

    const videoContainers = remoteVideos.querySelectorAll('.video-container');
    videoContainers.forEach(container => {
      const video = container.querySelector('video');
      const label = container.querySelector('.peer-label');
      if (video && label && video.dataset.peerId) {
        const peerId = video.dataset.peerId;
        const isHostPeer = peerId === hostId;
        const isScreenShare = video.dataset.mediaType === 'screenShare';

        if (!isScreenShare) {
          const participantName = getParticipantName(peerId);
          const displayName = participantName || `User ${peerId.slice(-6)}`;
          let labelText = displayName;
          if (isHostPeer) labelText = `${displayName} (Host)`;
          if (peerId === socket?.id) labelText = `${labelText} (You)`;

          label.textContent = `${isHostPeer ? '👑 ' : ''}${labelText}`;
          if (isHostPeer) {
            label.style.background = 'rgba(16, 185, 129, 0.9)';
            label.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          } else {
            label.style.background = ''; // Reset
            label.style.border = '';
          }
        }
      }
    });
  };

  // STRICT Grid Calculation and Presenter Mode Logic
  const updateGridLayout = () => {
    const remoteVideos = remoteVideosRef.current;
    if (!remoteVideos || !remoteVideos.parentElement) return;

    const mainGrid = remoteVideos.parentElement; // The .video-grid container
    const containers = Array.from(mainGrid.querySelectorAll('.video-container')); // Helper array

    // STRICT filtering: 
    // 1. Must NOT be 'screen-share' class
    // 2. Must NOT have data-media-type="screenShare"
    // 3. Must be visible (display != none) - This prevents counting hidden avatars/ghosts if any exist
    const standardContainers = containers.filter(c => {
      const isScreenShare = c.classList.contains('screen-share') || c.getAttribute('data-media-type') === 'screenShare';
      const isHidden = c.style.display === 'none';
      return !isScreenShare && !isHidden;
    });
    const totalCount = standardContainers.length;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:293', message: 'Grid layout calculation', data: { roomId, totalContainers: containers.length, totalCount, standardContainers: standardContainers.length, containerIds: Array.from(containers).map(c => c.getAttribute('data-peer-id')) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H2' }) }).catch(() => { });
    // #endregion

    // Check for Screen Share (Presenter Mode)
    // defined by isScreenSharing state OR existence of screen share element
    const screenShareContainer = mainGrid.querySelector('.video-container.screen-share') ||
      mainGrid.querySelector('[data-media-type="screenShare"]')?.closest('.video-container');

    // Presenter Mode Active (Use Ref to avoid stale state in closures)
    if (screenShareContainer || isScreenSharingRef.current) {
      console.log('Activating Presenter Mode. Reason:', {
        foundContainer: !!screenShareContainer,
        containerHtml: screenShareContainer?.outerHTML,
        refValue: isScreenSharingRef.current
      });
      mainGrid.classList.add('presenter-mode');

      // Remove presenter-active from everyone first
      containers.forEach(c => c.classList.remove('presenter-active'));

      let activePresenterElement = null;

      // Identify the active presenter element
      if (screenShareContainer) {
        activePresenterElement = screenShareContainer;
      } else if (isScreenSharingRef.current) {
        // Local screen share case - now standardized
        activePresenterElement = mainGrid.querySelector('.local-screen-share-container') || mainGrid.querySelector('.video-container.screen-share[data-peer-id="local"]') || mainGrid.querySelector('.video-container[data-media-type="screenShare"]');
      }

      // If we found the presenter element, Activate it!
      if (activePresenterElement) {
        activePresenterElement.classList.add('presenter-active');

        // CRITICAL: Move to first position in DOM to ensure it hits grid-column: 1
        // This fixes the issue where CSS Grid auto-placement might put it in the sidebar
        if (mainGrid.firstChild !== activePresenterElement) {
          console.log('Moving presenter element to start of grid for correct layout');
          mainGrid.insertBefore(activePresenterElement, mainGrid.firstChild);
        }
      }

      // In Presenter Mode, grid-cols irrelevant as fixed by CSS
      mainGrid.style.removeProperty('--grid-cols');
      mainGrid.style.removeProperty('--grid-rows');

    } else {
      // Standard Grid Mode
      mainGrid.classList.remove('presenter-mode');
      containers.forEach(c => {
        c.classList.remove('presenter-active');
        // CRITICAL: Remove any explicit grid positioning from standard mode containers
        // This ensures auto-placement works correctly
        if (!c.classList.contains('screen-share') && c.getAttribute('data-media-type') !== 'screenShare') {
          c.style.gridColumn = '';
          c.style.gridRow = '';
        }
      });

      // Calculate columns based on count strictly
      let cols = 1;
      // Explicit thresholds for grid columns
      if (totalCount <= 1) cols = 1;
      else if (totalCount === 2) cols = 2;
      else if (totalCount === 3) cols = 2; // Strict requirement: 2 cols for 3 items (2 top, 1 bottom)
      else if (totalCount === 4) cols = 2; // 2x2 grid
      else if (totalCount <= 6) cols = 3; // 5-6 items -> 3 cols
      else if (totalCount <= 9) cols = 3; // 7-9 items -> 3 cols
      else if (totalCount <= 12) cols = 4; // 10-12 items -> 4 cols
      else cols = 4; // 13+ -> max 4 cols

      // Calculate rows to ensure proper wrapping
      const rows = Math.ceil(totalCount / cols);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:330', message: 'Grid calculation result', data: { roomId, totalCount, cols, rows, expectedLayout: `${rows}x${cols}` }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H3' }) }).catch(() => { });
      // #endregion

      // Update CSS variables - CRITICAL for Room.css to pick it up
      mainGrid.style.setProperty('--grid-cols', cols.toString());
      mainGrid.style.setProperty('--grid-rows', rows.toString());

      // CRITICAL: Set inline style to force grid-template-rows (overrides CSS if needed)
      mainGrid.style.gridTemplateRows = `repeat(${rows}, minmax(200px, 1fr))`;
      mainGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      // Ensure row-first flow
      mainGrid.style.gridAutoFlow = 'row';

      // #region agent log
      const computedStyle = window.getComputedStyle(mainGrid);
      fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:377', message: 'Grid CSS applied', data: { roomId, totalCount, cols, rows, cssCols: computedStyle.getPropertyValue('--grid-cols'), cssRows: computedStyle.getPropertyValue('--grid-rows'), gridTemplateRows: computedStyle.gridTemplateRows, gridTemplateColumns: computedStyle.gridTemplateColumns, gridAutoFlow: computedStyle.gridAutoFlow, containerCount: standardContainers.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'GRID_LAYOUT' }) }).catch(() => { });
      // #endregion

      console.log(`Updated Grid Layout: ${totalCount} items -> ${cols} cols, ${rows} rows`);
      console.log(`Applied CSS: grid-template-columns: repeat(${cols}, 1fr), grid-template-rows: repeat(${rows}, minmax(200px, 1fr))`);
    }
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
    return profile?.avatar_url || profile?.avatar || 'default-avatar.png';
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
    // IMPROVED: Check if entry exists AND has a valid DOM element
    // This prevents race conditions where the map has an entry but the DOM element was removed
    const existingEntry = consumersRef.current.get(producerId);
    if (existingEntry && existingEntry.el) {
      // Check if the element is still in the DOM
      const elementInDOM = existingEntry.el.isConnected ||
        (remoteVideosRef.current && remoteVideosRef.current.contains(existingEntry.el.parentElement));

      if (elementInDOM) {
        console.log('addRemoteMedia: Entry already exists with valid DOM element, skipping:', { producerId, kind });
        return;
      } else {
        console.warn('addRemoteMedia: Entry exists but element not in DOM, cleaning up and re-creating:', { producerId, kind });
        // Clean up the orphaned entry
        consumersRef.current.delete(producerId);
      }
    }

    // Verify it's not our own producer (prevents "seeing myself" duplicates)
    if (peerId === socket?.id) {
      console.warn('Attempted to add own media as remote media, skipping.', { producerId, kind });
      return;
    }

    // Prevent duplicate video tiles for the same peer (unless screen share)
    if (kind === 'video' && (!appData || appData.mediaType !== 'screenShare')) {
      if (remoteVideosRef.current) {
        const existing = remoteVideosRef.current.querySelector(`.video-container[data-peer-id="${peerId}"]:not(.screen-share):not([data-media-type="screenShare"])`);
        if (existing) {
          console.log(`Cleaning up existing video tile for ${peerId} before adding new one`);
          existing.remove();
          // Clean up potential zombie consumer map entry
          const oldPid = existing.getAttribute('data-producer-id');
          if (oldPid && oldPid !== producerId && consumersRef.current.has(oldPid)) {
            const oldC = consumersRef.current.get(oldPid);
            oldC.consumer?.close();
            consumersRef.current.delete(oldPid);
          }
        }
      }
    }

    console.log('Adding remote media:', { producerId, kind, peerId, isNewProducer, trackId: track?.id, trackEnabled: track?.enabled, trackReadyState: track?.readyState });
    console.log('remoteVideosRef.current:', remoteVideosRef.current);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:494', message: 'addRemoteMedia called', data: { roomId, producerId, kind, peerId, trackId: track?.id, trackEnabled: track?.enabled, trackMuted: track?.muted, trackReadyState: track?.readyState, hasRemoteVideosRef: !!remoteVideosRef.current }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'VIDEO_CONSUMER' }) }).catch(() => { });
    // #endregion

    let el;
    if (kind === 'audio') {
      el = document.createElement('audio');
      el.controls = false;
      el.muted = false;
      el.autoplay = true;
      el.srcObject = new MediaStream([track]);

      // Explicitly try to play audio to overcome autoplay policies
      el.play().catch(e => {
        console.error('Error playing audio:', e);
      });

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

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:520', message: 'Track state before adding to MediaStream', data: { roomId, producerId, peerId, trackId: track?.id, trackKind: track?.kind, trackEnabled: track?.enabled, trackMuted: track?.muted, trackReadyState: track?.readyState, trackLabel: track?.label }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'TRACK_STATE' }) }).catch(() => { });
      // #endregion

      // CRITICAL: Ensure track is enabled and ready before adding to MediaStream
      if (!track.enabled) {
        console.warn('⚠️ Track is disabled, enabling it:', track.id);
        track.enabled = true;
      }

      // Verify track is ready
      if (track.readyState !== 'live') {
        console.warn('⚠️ Track not live when adding to MediaStream:', {
          trackId: track.id,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted
        });
      }

      el.srcObject = new MediaStream([track]);
      el.className = 'video';
      el.setAttribute('data-peer-id', peerId);
      el.setAttribute('data-media-type', appData?.mediaType || 'video');

      if (appData?.mediaType === 'screenShare') {
        videoContainer.classList.add('screen-share');
        el.classList.add('screen-share');
      }

      videoContainer.appendChild(el);

      // Create overlay for name/status
      const overlay = document.createElement('div');
      overlay.className = 'video-overlay';

      // Add peer label
      const labelSpan = document.createElement('span');
      labelSpan.className = 'peer-label';

      // If it's a screen share, show "Presenter Name's Screen"
      if (appData?.mediaType === 'screenShare') {
        const presenterName = appData.presenterName || getParticipantName(peerId) || `User ${peerId.slice(0, 5)}`;
        labelSpan.textContent = `🖥️ ${presenterName}'s Screen`;
      } else {
        labelSpan.textContent = getParticipantName(peerId) || `User ${peerId.slice(0, 5)}`;
      }

      overlay.appendChild(labelSpan);
      videoContainer.appendChild(overlay);

      // Add mute/camera-off indicators (hidden by default)
      const indicators = document.createElement('div');
      indicators.className = 'status-indicators';
      indicators.style.position = 'absolute';
      indicators.style.bottom = '12px';
      indicators.style.right = '12px';
      indicators.style.display = 'flex';
      indicators.style.gap = '4px';

      const muteSpan = document.createElement('span');
      muteSpan.className = 'mute-indicator';
      muteSpan.textContent = '🔇';
      muteSpan.style.background = 'rgba(244, 67, 54, 0.9)';
      muteSpan.style.color = 'white';
      muteSpan.style.padding = '2px 6px';
      muteSpan.style.borderRadius = '4px';
      muteSpan.style.fontSize = '12px';
      muteSpan.style.display = 'none'; // Hidden by default
      indicators.appendChild(muteSpan);

      const camSpan = document.createElement('span');
      camSpan.className = 'camera-indicator';
      camSpan.textContent = '📷'; // Camera off icon
      camSpan.style.background = 'rgba(244, 67, 54, 0.9)';
      camSpan.style.color = 'white';
      camSpan.style.padding = '2px 6px';
      camSpan.style.borderRadius = '4px';
      camSpan.style.fontSize = '12px';
      camSpan.style.display = 'none'; // Hidden by default
      indicators.appendChild(camSpan);

      videoContainer.appendChild(indicators);

      // Create Avatar Container (hidden by default, shown when camera is off)
      const avatarContainer = document.createElement('div');
      avatarContainer.className = 'avatar-container';
      avatarContainer.style.display = 'none'; // Hidden by default

      const initials = document.createElement('div');
      initials.className = 'avatar-initials';
      const pName = getParticipantName(peerId) || '?';
      initials.textContent = pName.slice(0, 2).toUpperCase();

      avatarContainer.appendChild(initials);
      videoContainer.appendChild(avatarContainer);

      videoContainer.setAttribute('data-peer-id', peerId);
      videoContainer.setAttribute('data-producer-id', producerId);
      videoContainer.setAttribute('data-media-type', appData?.mediaType || 'video');

      if (remoteVideosRef.current) {
        remoteVideosRef.current.appendChild(videoContainer);
        console.log('✅ Video container added successfully:', {
          producerId,
          peerId,
          kind,
          containerInDOM: videoContainer.isConnected,
          videoConnected: el.isConnected
        });
        consumersRef.current.get(producerId).el = el; // Store ref to video element

        // Update grid layout after adding new video
        setTimeout(() => updateGridLayout(), 100);

        // Attempt to play
        el.play().catch(e => {
          console.error('Error playing name/video:', e);
        });
      } else {
        console.error('remoteVideosRef.current is null when trying to add video container');
      }
    }
    // Store video element with peer ID
    peerVideosRef.current.set(peerId, el);

    // Store peerId with consumer entry
    consumersRef.current.set(producerId, { el, consumer: null, peerId }); // Add peerId here

    console.log(hostId);
    // Update participants list when new media is added
    updateParticipants();

    // NEW: Enforce Grid Layout update on structure change
    updateGridLayout();
  }

  function removeRemoteMedia(producerId, appData = null) {
    const entry = consumersRef.current.get(producerId);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:572', message: 'Removing remote media', data: { roomId, producerId, hasEntry: !!entry, appData, consumersSize: consumersRef.current.size, peerId: entry?.peerId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H7' }) }).catch(() => { });
    // #endregion

    if (!entry) {
      // Fallback: cleanup by selector if no map entry
      if (remoteVideosRef.current) {
        const elements = remoteVideosRef.current.querySelectorAll(`[data-producer-id="${producerId}"]`);
        elements.forEach(el => {
          if (el.tagName === 'VIDEO' && el.parentElement?.className.includes('video-container')) {
            el.parentElement.remove();
          } else {
            el.remove();
          }
        });
      }
    } else {
      // Standard cleanup via map entry
      if (entry.el.tagName === 'VIDEO') {
        peerVideosRef.current.delete(entry.peerId);
        const container = entry.el.parentElement;
        if (container && container.className.includes('video-container')) {
          container.remove();
        } else {
          entry.el.remove();
        }
      } else {
        entry.el.remove();
      }

      entry.consumer?.close();
      consumersRef.current.delete(producerId);
    }

    // Additional cleanup for screen shares
    if (appData && appData.mediaType === 'screenShare') {
      console.log('Cleaning up screen share elements for producer:', producerId);
      setPresenterNotification(null);

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

    // NEW: Enforce Grid Layout update on structure change
    setTimeout(() => updateGridLayout(), 50);
  }

  // Function to create local screen share preview for the presenter
  function createLocalScreenSharePreview(stream) {
    // Remove existing preview if any
    const existingPreview = document.getElementById('local-screen-share');
    if (existingPreview) {
      existingPreview.remove();
    }

    // Create screen share preview container
    // UNIFY: Use 'video-container' and 'screen-share' classes to match remote streams
    const screenShareContainer = document.createElement('div');
    screenShareContainer.id = 'local-screen-share';
    screenShareContainer.className = 'video-container local-screen-share-container screen-share'; // Added screen-share class

    // Add data attributes for grid layout logic
    screenShareContainer.setAttribute('data-peer-id', socket?.id || 'local');
    screenShareContainer.setAttribute('data-media-type', 'screenShare');

    // Create video element for screen share preview
    const screenVideo = document.createElement('video');
    screenVideo.autoplay = true;
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    screenVideo.srcObject = stream;
    screenVideo.className = 'video local-screen-share-video screen-share'; // Match remote video classes

    // Create "You are presenting" indicator
    const indicator = document.createElement('div');
    indicator.className = 'presenting-indicator';
    indicator.innerHTML = '🖥️ You are presenting';

    screenShareContainer.appendChild(screenVideo);
    screenShareContainer.appendChild(indicator);

    // Add to the video grid
    if (remoteVideosRef.current) {
      // Insert at the beginning to be consistent with presenter mode logic
      remoteVideosRef.current.insertBefore(screenShareContainer, remoteVideosRef.current.firstChild);
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
      // CRITICAL: Check if consumer already exists for this producer
      // This prevents duplicate consumers which cause video to be recreated and go back to muted state
      const existingEntry = consumersRef.current.get(producerInfo.producerId);
      if (existingEntry && existingEntry.consumer) {
        console.log('⚠️ Consumer already exists for producer:', producerInfo.producerId, 'Skipping duplicate creation');
        return;
      }

      console.log('📹 Creating new consumer for producer:', producerInfo.producerId, producerInfo.kind);

      // CRITICAL: Create consumer with paused: true to match server-side state
      // Without this, client consumer.paused will be false even though server consumer is paused!
      const consumer = await consumerTransport.consume({
        id: producerInfo.id,
        producerId: producerInfo.producerId,
        kind: producerInfo.kind,
        rtpParameters: producerInfo.rtpParameters,
        paused: true  // MUST match backend's paused: true (app.js line 1105)
      });

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:1137', message: 'Consumer created, track state', data: { roomId, consumerId: consumer.id, producerId: producerInfo.producerId, trackId: consumer.track?.id, trackKind: consumer.track?.kind, trackEnabled: consumer.track?.enabled, trackMuted: consumer.track?.muted, trackReadyState: consumer.track?.readyState, consumerPaused: consumer.paused, hasTrack: !!consumer.track }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'CONSUMER_CREATE' }) }).catch(() => { });
      // #endregion

      const { track } = consumer;

      // CRITICAL: Verify track exists
      if (!track) {
        console.error('❌ No track available from consumer:', consumer.id);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:1145', message: 'No track from consumer', data: { roomId, consumerId: consumer.id, producerId: producerInfo.producerId, consumerPaused: consumer.paused }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'CONSUMER_CREATE' }) }).catch(() => { });
        // #endregion
        return;
      }

      // CRITICAL FIX: Explicitly enable the track to unmute it
      // When consumer is created with paused:true, the track starts muted
      // This prevents video frames from flowing even after server-side resume
      if (!track.enabled) {
        console.log('🔧 Enabling muted track:', track.id);
        track.enabled = true;
      }

      console.log('📹 Track state before adding to DOM:', {
        trackId: track.id,
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });


      // CRITICAL: Add media to DOM FIRST (addRemoteMedia will create the entry)
      // Don't store consumer before calling addRemoteMedia - it has an early return check!
      console.log('📹 Calling addRemoteMedia for:', { producerId: producerInfo.producerId, kind: producerInfo.kind, peerId: producerInfo.peerId, trackId: track?.id, trackEnabled: track?.enabled, trackMuted: track?.muted, trackReadyState: track?.readyState });

      // CRITICAL FIX: Resume consumer BEFORE adding to DOM
      // This ensures the track is active and unmuted when the MediaStream is created
      console.log(`🔄 Resuming consumer ${consumer.id} BEFORE adding to DOM (paused: ${consumer.paused})`);

      // First, resume on client side
      try {
        await consumer.resume();
        console.log('✅ Consumer resumed on client (before DOM):', consumer.id, {
          paused: consumer.paused,
          trackMuted: track.muted,
          trackEnabled: track.enabled,
          trackReadyState: track.readyState
        });
      } catch (resumeError) {
        console.error('❌ Client-side consumer resume error:', resumeError);
      }

      // Then, resume on server side
      await new Promise((resolve) => {
        socket.emit('consumer-resume', { consumerId: consumer.id, roomId: roomId }, (error) => {
          if (error) {
            console.error('❌ Consumer resume error:', error);
          } else {
            console.log('✅ Consumer resumed successfully on server:', consumer.id);
          }
          resolve();
        });
      });

      // Small delay to ensure frames start flowing
      await new Promise(r => setTimeout(r, 100));

      console.log('📹 Track state after resume, before adding to DOM:', {
        trackId: track.id,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });

      // Now add to DOM with resumed track
      addRemoteMedia(producerInfo.producerId, track, producerInfo.kind, producerInfo.peerId, producerInfo.appData, isNewProducer);

      // Store consumer AFTER adding media (addRemoteMedia creates entry with consumer: null)
      const entry = consumersRef.current.get(producerInfo.producerId);
      if (entry) {
        entry.consumer = consumer;
        consumersRef.current.set(producerInfo.producerId, entry);
      } else {
        console.error('❌ Entry not found in consumersRef after addRemoteMedia for producerId:', producerInfo.producerId);
      }

    } catch (error) {
      console.error('Error connecting recv transport:', error);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:1068', message: 'Consumer creation error', data: { roomId, producerId: producerInfo.producerId, error: error.message, errorStack: error.stack }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'CONSUMER_CREATE' }) }).catch(() => { });
      // #endregion
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
      consumersRef.current.forEach(({ consumer }) => {
        if (consumer) {
          console.log('Cleaning up existing consumer:', consumer.id);
          consumer.close();
        }
      });
      consumersRef.current.clear();

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
      setScreenAudioProducer(null);
      setIsScreenSharing(false);
      isScreenSharingRef.current = false;

      // Remove local screen share preview
      const localScreenShare = document.getElementById('local-screen-share');
      if (localScreenShare) {
        localScreenShare.remove();
      }

      console.log('Screen share stopped and server notified');
      // CRITICAL: Ensure grid layout updates locally
      setTimeout(() => updateGridLayout(), 200);
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
        appData: {
          mediaType: 'screenShare',
          presenterName: currentUserInfo?.name || 'Unknown Presenter'
        }
      });
      setScreenVideoProducer(sVideoProducer);

      // Produce system/tab audio if user ticked the checkbox
      if (audioTrack) {
        const sAudioProducer = await producerTransport.produce({
          track: audioTrack,
          kind: 'audio',
          appData: {
            mediaType: 'screenShareAudio',
            presenterName: currentUserInfo?.name || 'Unknown Presenter'
          }
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

        // Close producers and notify server using LOCAL variables to avoid closure staleness
        if (sVideoProducer) {
          sVideoProducer.close();
          setScreenVideoProducer(null);
        }
        if (audioTrack && typeof sAudioProducer !== 'undefined') {
          // If we had audio, close it too. 
          // Note: sAudioProducer might be undefined if not created, so check logic above.
          // Actually, clearer to check the state setter or track? 
          // Better: we can't easily access the sAudioProducer if we didn't declare it in a shared scope 
          // but we can trust the state cleanup or just notify server.
          // Relying on producerClosed emit is safest.
        }

        // Re-emit producerClosed using the local producer reference
        socket.emit('producerClosed', {
          producerId: sVideoProducer.id,
          appData: sVideoProducer.appData
        });

        if (screenAudioProducer) { // Fallback to state if we didn't capture local audio producer
          screenAudioProducer.close();
          setScreenAudioProducer(null);
        }

        setIsScreenSharing(false);
        isScreenSharingRef.current = false;
        console.log('Screen share cleanup completed');
        // CRITICAL: Ensure grid layout updates locally
        setTimeout(() => updateGridLayout(), 200);
      };

      setIsScreenSharing(true);
      isScreenSharingRef.current = true;
      console.log('Screen share started');
      // Update grid layout immediately for local presenter
      setTimeout(() => updateGridLayout(), 100);
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
    consumersRef.current.forEach(({ consumer }) => consumer?.close());
    consumersRef.current.clear();
    peerVideosRef.current.clear();

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
    isScreenSharingRef.current = false;
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

          if (response.error === 'Room does not exist') {
            console.log('Room does not exist (auto-join), attempting to create it as host...');
            // Get user info to pass to createRoom
            const userInfo = await getCurrentUserInfo();

            socket.emit('createRoom', { roomId, userInfo }, async (createResponse) => {
              if (createResponse.error) {
                console.error('Failed to lazy-create room:', createResponse.error);
                alert('Failed to initialize meeting: ' + createResponse.error);
                setIsInRoom(false);
              } else {
                console.log('Lazy-created room successfully:', createResponse);
                setIsHost(true);
                setHostId(socket.id);
                // Proceed with setup
                finishAutoJoinSetup();
              }
            });
            return;
          }

          // Fallback to localStorage if server call fails (other errors)
          const storedHostId = localStorage.getItem(`room_${roomId}_host_id`);
          const wasHost = localStorage.getItem(`room_${roomId}_was_host`) === 'true';
          setIsHost(wasHost);
          setHostId(storedHostId || socket.id);
        } else {
          // Use server response for accurate host information
          console.log("\n\n\n\n\n\n\n ", response);
          setIsHost(response.isHost);
          setHostId(response.hostId);
          console.log('Server confirmed room membership:', {
            isHost: response.isHost,
            hostId: response.hostId,
            currentSocketId: socket.id
          });
        }

        // Helper function to proceed with setup
        const finishAutoJoinSetup = async () => {
          // Set room join time for current user
          const joinTime = new Date();
          setRoomJoinTime(joinTime);
          setParticipantJoinTimes(prev => new Map(prev.set(socket.id, joinTime)));

          console.log('Auto-join setup complete:', {
            isHost: isHost,
            hostId: hostId,
            currentSocketId: socket.id
          });

          // Add a small delay to ensure server has processing room membership
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
        };

        // If we didn't lazy-create, run setup now
        // But for STUDENTS (who didn't create the room), we MUST emit joinRoom to register socket on server
        if (response.error !== 'Room does not exist') {
          console.log('Auto-join: Room exists. Ensuring we are joined on server...');
          // We need to call joinRoom strictly to ensure media transport can be created
          // Even if we are host (reloaded), joinRoom is idempotent
          const userInfo = await getCurrentUserInfo();
          const params = new URLSearchParams(window.location.search);
          const urlToken = params.get('token');

          socket.emit('joinRoom', { roomId, userInfo, token: urlToken }, (joinResponse) => {
            if (joinResponse.error) {
              console.error("Auto-join failed:", joinResponse.error);
              if (joinResponse.error.includes('Restricted')) {
                alert("⛔ ACCESS DENIED\n\nRestricted to Learnsphere users.");
                window.location.href = '/';
              }
            } else {
              console.log("Auto-join confirmed by server.");
              finishAutoJoinSetup();
            }
          });
        }
      });

      return;
    }

    try {
      // Get user information before joining
      const userInfo = await getCurrentUserInfo();

      // Get token from URL if available (for Restricted/SSO join)
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');

      // Inform the server about joining a room
      socket.emit('joinRoom', { roomId: roomId, userInfo: userInfo, token: urlToken }, async (response) => {
        if (response.error) {
          console.error('Error joining room:', response.error);

          // Handle Restricted Access Error
          if (response.error.includes('Restricted')) {
            alert("⛔ ACCESS DENIED\n\nThis meeting is restricted to Learnsphere users only.\nPlease join via the Learnsphere Dashboard.");
            window.location.href = 'about:blank';
            return;
          }

          console.log('Room does not exist (joinUrl), attempting to create it as host...');

          socket.emit('createRoom', { roomId, userInfo, token: urlToken }, async (createResponse) => {
            if (createResponse.error) {
              console.error('Failed to lazy-create room:', createResponse.error);
              alert('Failed to initialize meeting: ' + createResponse.error);
              setIsInRoom(false);
            } else {
              console.log('Lazy-created room successfully:', createResponse);

              // Manual success setup since we just created it
              setDisplayRoomCode(roomId);

              // Store host info
              localStorage.setItem(`room_${roomId}_host_socket`, socket.id);
              localStorage.setItem(`room_${roomId}_was_host`, 'true');
              localStorage.setItem(`room_${roomId}_host_id`, socket.id); // Add this for consistency

              setIsHost(true);
              setHostId(socket.id);

              // Set join time
              const joinTime = new Date();
              setRoomJoinTime(joinTime);
              setParticipantJoinTimes(prev => new Map(prev.set(socket.id, joinTime)));

              // Setup pipeline
              await setupMediasoupPipeline();

              // No other producers or participants yet

              setIsInRoom(true);
              console.log('Lazy-create join completed');

              // Register profile
              const token = localStorage.getItem('jwt') || sessionStorage.getItem('jwt');
              if (token) {
                socket.emit('register-profile', { token, roomId });
              }

              // Broadcast status
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
            }
          });
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
    const handleJoinRoom = () => {
      // CRITICAL: Prevent multiple simultaneous joins using refs (not local vars)
      if (urlRoomId && !hasJoinedRef.current && !isJoiningRef.current) {
        console.log('🚀 Starting room join process');
        hasJoinedRef.current = true;
        isJoiningRef.current = true;
        joinRoomFromUrl().finally(() => {
          isJoiningRef.current = false;
        });
      } else if (isJoiningRef.current) {
        console.log('⏳ Join already in progress, skipping duplicate call');
      } else if (hasJoinedRef.current) {
        console.log('✅ Already joined room, skipping duplicate call');
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

    socket.on('activeSpeaker', ({ peerId }) => {
      // Remove all highlights first
      document.querySelectorAll('.video-container.active').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.video.active').forEach(v => v.classList.remove('active'));

      console.log('CLIENT activeSpeaker', peerId);

      // Highlight video for this peer
      const videoEl = peerVideosRef.current.get(peerId);
      if (videoEl) {
        // Add active class to both video element and its container
        videoEl.classList.add('active');
        const container = videoEl.closest('.video-container');
        if (container) {
          container.classList.add('active');
        }
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
      consumersRef.current.forEach(({ consumer }) => consumer?.close());
      consumersRef.current.clear();
      peerVideosRef.current.clear();
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
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:1732', message: 'Participant joined event', data: { participantId, userInfo, joinedRoomId, currentRoomId: roomId, matches: joinedRoomId === roomId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H6' }) }).catch(() => { });
      // #endregion
      // IMPORTANT: Only process if this event is for OUR room (prevents cross-room interference)
      if (joinedRoomId === roomId) {
        // Track join time for new participant
        const currentTime = new Date();
        setParticipantJoinTimes(prev => new Map(prev.set(participantId, currentTime)));

        // Store participant information for name lookup
        if (userInfo) {
          console.log(`IMMEDIATE PROFILE STORAGE for ${participantId}:`, userInfo);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:1740', message: 'Storing participant profile', data: { participantId, userInfo, existingProfile: participantProfiles.get(participantId) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H6' }) }).catch(() => { });
          // #endregion

          // 1. Update profiles map immediately
          setParticipantProfiles(prev => {
            const newMap = new Map(prev);
            // Check for duplicates before adding
            if (newMap.has(participantId)) {
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:1746', message: 'Duplicate participant profile detected', data: { roomId, participantId, existing: newMap.get(participantId), new: userInfo, profilesSize: newMap.size }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H7' }) }).catch(() => { });
              // #endregion
            }
            newMap.set(participantId, userInfo);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/ea5934e6-ae9a-4d80-a4da-154574354d01', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Room.jsx:1750', message: 'Stored participant profile', data: { roomId, participantId, userInfo, profilesSize: newMap.size }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H6' }) }).catch(() => { });
            // #endregion
            return newMap;
          });

          // 2. Update participants list
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

    // Listen for presenter started event (screen sharing)
    socket.on('presenter-started', ({ presenterId, presenterName }) => {
      console.log(`📺 Presenter started: ${presenterName} (${presenterId})`);

      // Show notification
      setPresenterNotification(presenterName);

      // Auto-hide notification after 5 seconds
      setTimeout(() => {
        setPresenterNotification(null);
      }, 5000);

      // Store presenter info in profiles for later reference
      setParticipantProfiles(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(presenterId) || {};
        newMap.set(presenterId, {
          ...existing,
          name: presenterName,
          isPresenting: true
        });
        return newMap;
      });

      // Update video tile labels immediately
      setTimeout(() => updateVideoTileLabels(), 100);
    });

    // Listen for presenter stopped event
    socket.on('presenter-stopped', ({ presenterId }) => {
      console.log(`📺 Presenter stopped: ${presenterId}`);

      // Clear presenter notification
      setPresenterNotification(null);

      // Remove presenting flag from profile
      setParticipantProfiles(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(presenterId);
        if (existing) {
          delete existing.isPresenting;
          newMap.set(presenterId, existing);
        }
        return newMap;
      });

      // CRITICAL: Ensure grid layout updates after a short delay
      setTimeout(() => updateGridLayout(), 200);
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
      // Only set connection error if we are stuck connecting
      if (!isInRoom) {
        setConnectionError(error.message || 'Socket error occurred');
      }
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnectionError(error.message || 'Failed to connect to server');
    });

    socket.on('newProducer', (data) => {
      console.log('New producer announced:', data);

      // If presenter name is included (for screen shares), store it
      if (data.appData?.presenterName && data.peerId) {
        console.log(`📺 Storing presenter name: ${data.appData.presenterName} for ${data.peerId}`);
        setParticipantProfiles(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(data.peerId) || {};
          newMap.set(data.peerId, {
            ...existing,
            name: data.appData.presenterName,
            isPresenting: true
          });
          return newMap;
        });
      }

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

    // Handle duplicate session detection
    socket.on('session-duplicate', () => {
      alert("⚠️ You have joined this class from another tab or device.\n\nThis session will be closed.");
      setIsInRoom(false);
      window.location.href = '/';
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

    // Handle presenter events


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
      socket.off('presenter-started');
      socket.off('presenter-stopped');
      socket.off('newProducer');  // CRITICAL: Prevents duplicate consumers
      socket.off('connect_error');
      socket.off('hand-raised');
      socket.off('hand-lowered');
      socket.off('hands-cleared');
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
  }, [isMicOn, isCamOn, socket?.id, isHost, hostId]);

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

  // Update video tile labels when participant profiles change
  useEffect(() => {
    console.log('Participant profiles changed, updating video tiles');
    updateVideoTileLabels();
    updateParticipants();
  }, [participantProfiles]);

  // Update video tile labels when participants list changes (fallback)
  useEffect(() => {
    if (participants.length > 0) {
      updateVideoTileLabels();
    }
  }, [participants]);

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(displayRoomCode);
      alert('Room code copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy room code:', err);
      alert('Failed to copy room code. Please copy manually: ' + displayRoomCode);
    }
  };

  if (connectionError) {
    return (
      <div className="room-loading">
        <div className="loading-content error">
          <div className="error-icon">❌</div>
          <h2>Connection Failed</h2>
          <p>{connectionError}</p>
          <button onClick={() => window.location.reload()} className="retry-btn">
            Try Again
          </button>
          <button onClick={() => navigate('/')} className="back-btn" style={{ marginTop: '10px' }}>
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

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
                👑 Host: {isHost ? 'You' : `${getParticipantName(hostId)}`}
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
            <span className="peer-label" style={isHost ? { background: 'rgba(16, 185, 129, 0.9)', border: '1px solid rgba(16, 185, 129, 0.3)' } : {}}>
              {isHost ? '👑 ' : ''}{getParticipantName(socket?.id || 'anonymous')}{isHost ? ' (Host)' : ''}
            </span>
            {raisedHands.some(hand => hand.userId === (socket?.id || 'anonymous')) && (
              <div className="hand-raise-indicator">
                ✋
              </div>
            )}
            {!isMicOn && (
              <div className="status-indicators" style={{ position: 'absolute', bottom: '12px', right: '12px', display: 'flex', gap: '4px' }}>
                <span className="mute-indicator" style={{ background: 'rgba(244, 67, 54, 0.9)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>🔇</span>
              </div>
            )}
          </div>

          {/* Local Avatar Overlay */}
          <div className="avatar-container" style={{ display: isCamOn ? 'none' : 'flex' }}>
            {currentUserInfo?.avatar ? (
              <img
                src={currentUserInfo.avatar}
                alt="My Avatar"
                className="participant-avatar"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div className="avatar-initials" style={{ display: currentUserInfo?.avatar ? 'none' : 'flex' }}>
              {(currentUserInfo?.name || 'Y').slice(0, 2).toUpperCase()}
            </div>
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
          {isMicOn ? <MicIcon /> : <MicOffIcon />}
        </button>

        <button
          onClick={toggleCam}
          className={`control-btn ${!isCamOn ? 'disabled' : ''}`}
          title={isCamOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCamOn ? <CameraIcon /> : <CameraOffIcon />}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`control-btn ${isScreenSharing ? 'active' : ''}`}
          title={isScreenSharing ? 'Stop screen share' : 'Share screen'}
        >
          {isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
        </button>

        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`control-btn ${isChatOpen ? 'active' : ''}`}
          title="Toggle chat"
        >
          <ChatIcon />
        </button>

        <button
          onClick={() => setIsParticipantListOpen(!isParticipantListOpen)}
          className={`control-btn ${isParticipantListOpen ? 'active' : ''}`}
          title="Show participants"
        >
          <UsersIcon />
        </button>

        <button
          onClick={() => setIsPollOpen(!isPollOpen)}
          className={`control-btn ${isPollOpen ? 'active' : ''}`}
          title="Toggle polls"
        >
          <PollIcon />
        </button>

        <button
          onClick={() => {
            alert('Recording feature will be added shortly!');
            setIsRecording(!isRecording);
          }}
          className={`control-btn ${isRecording ? 'active' : ''}`}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <StopRecordIcon /> : <RecordIcon />}
        </button>

        <HandRaise
          roomId={urlRoomId || roomId}
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
        participantProfiles={participantProfiles}
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