  const io = require('socket.io-client')
  const mediasoupClient = require('mediasoup-client')

  const socket = io("/mediasoup")

  socket.on('connection-success', ({ socketId }) => {
    console.log('Connected with socket ID:', socketId)
  })


  let device;
  let rtpCapabilities;
  let producerTransport;
  let consumerTransport;
  let videoProducer;
  let audioProducer;
  let roomId;
  let screenVideoProducer = null;
  let screenAudioProducer = null;

const consumers = new Map();

  socket.on('disconnect', () => {
    // Show room setup again
    console.log('Disconnected from server');
    roomSetupDiv.style.display = 'block';
    roomControlsDiv.style.display = 'none';
      displayRoomCodeSpan.textContent = 'N/A';
      copyRoomCodeButton.style.display = 'none';

    localVideo.srcObject = null;
      remoteVideos.srcObject = null;
      // Reset room state
      roomId = null;
      device = null;
      rtpCapabilities = null;
      producerTransport = null;
      consumerTransport = null;
      videoProducer = null;
      audioProducer = null;
      //consumer = null;
      consumers.forEach(({ consumer }) => consumer?.close());
      consumers.clear();
      
      
      

  })

  socket.on('error', (error) => {
    console.error('Socket error:', error)
  })

  
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
  }

  const audioParams = {
  track: null,                // will be filled with stream.getAudioTracks()[0]
  codecOptions: {
    opusStereo: false,        // mono keeps bit-rate low
    opusFec: true,            // forward-error-correction for packet-loss
    opusDtx: true,            // silent-period suppression make it false for now
    opusMaxPlaybackRate: 48000,
    opusPtime: 20
  },
  encodings: [
    {
      maxBitrate: 64000       // 64 kbps is crisp for speech
    }
  ]
};

  // ICE servers configuration - make sure these work
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:relay1.expressturn.com:3480',
      username: '000000002065332507',
      credential: '2dm9ltTqJIjVrRq/LI/QvTm0nPY='
    }
  ]

  // DOM elements
  const localVideo = document.getElementById('localVideo')
  const remoteVideos = document.getElementById('remoteVideos')
  const btnJoinRoom = document.getElementById('btnJoinRoom');
  const btnCreateRoom = document.getElementById('btnCreateRoom');
  const roomCodeInput = document.getElementById('roomCodeInput'); // Input for joining
  const displayRoomCodeSpan = document.getElementById('displayRoomCode'); // To show created room code
  const copyRoomCodeButton = document.getElementById('copyRoomCode'); // New button to copy
  const roomSetupDiv = document.getElementById('roomSetup'); // To hide after joining/creating
  const roomControlsDiv = document.getElementById('roomControls'); // To show after joining/creating
  const btnShareScreen = document.getElementById('btnShareScreen');
  // const btnStopScreenShare = document.getElementById('btnStopScreenShare');
  const btnToggleMic = document.getElementById('btnToggleMic');
  const btnToggleCam = document.getElementById('btnToggleCam');
function addRemoteMedia(producerId, track, kind) {
  if (consumers.has(producerId)) return;

  let el;
  if (kind === 'audio') {
    el = document.createElement('audio');
    el.controls = false;
    el.muted = false;
  } else {
    el = document.createElement('video');
    el.playsInline = true;
  }
  el.autoplay = true;
  el.srcObject = new MediaStream([track]);
  document.getElementById(kind === 'audio' ? 'remoteAudios' : 'remoteVideos').appendChild(el);

  consumers.set(producerId, { el, consumer: null });
}

function removeRemoteMedia(producerId) {
  const entry = consumers.get(producerId);
  if (!entry) return;

  entry.el.remove();
  entry.consumer?.close();
  consumers.delete(producerId);
}


  const streamSuccess = async (stream) => {
    try {
      localVideo.srcObject = stream
      const videotrack = stream.getVideoTracks()[0];
      const audiotrack = stream.getAudioTracks()[0];
      videoparams.track = videotrack;
      audioParams.track = audiotrack;
      console.log('Local stream set successfully')
    } catch (error) {
      console.error('Error in streamSuccess:', error)
    }
  }
  const getLocalStream = async () => { // Make getLocalStream async itself
      console.log("Getting the local stream");
      try {
          const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: {
                  width: { min: 640, max: 1920 },
                  height: { min: 400, max: 1080 }
              }
          });
           streamSuccess(stream); // Call streamSuccess directly with the awaited stream
          // return track; // getLocalStream now returns the track
      } catch (error) {
          console.error("Error accessing media devices in getLocalStream:", error.name, error.message, error);
          throw error;
      }
  };


  const createDevice = async () => {
    try {
      if (!rtpCapabilities) {
        console.error('RTP capabilities not loaded')
        throw new Error('RTP capabilities not loaded');
      }

      device = new mediasoupClient.Device()
      await device.load({ routerRtpCapabilities: rtpCapabilities })
      console.log('Device created successfully')
      console.log('Device RTP Capabilities:', device.rtpCapabilities)
    } catch (error) {
      console.error('Device creation error:', error)
      if (error.name === 'UnsupportedError') {
        console.error('Browser not supported')
      }
    }
  }

  const getRtpCapabilities = () => {
      return new Promise((resolve, reject) => {
          socket.emit('getRtpCapabilities', (data) => {
              if (data.error) {
                  console.error('Error getting RTP capabilities:', data.error);
                  reject(data.error);
                  return;
              }
              console.log('Router RTP Capabilities received');
              rtpCapabilities = data.rtpCapabilities;
              resolve();
          });
      });
  };


  const createSendTransport = () => {
    return new Promise((resolve, reject) => {
      if (!device) {
        const error = 'Device not initialized'
        console.error(error)
        reject(error)
        return
      }

      console.log(roomId);
      socket.emit('createWebRtcTransport', { sender: true , roomId:roomId}, (response) => {
        if (response.error || response.params?.error) {
          const error = response.error || response.params.error
          console.error('Transport creation error:', error)
          reject(error)
          return
        }

        console.log('Producer transport params:', response.params)
        
        // Create transport with ICE servers
        producerTransport = device.createSendTransport({
          ...response.params,
          iceServers: iceServers
        })

        // Enhanced logging for debugging
        producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          console.log('Producer transport connect event triggered')
          try {
            await new Promise((resolve, reject) => {
              socket.emit('transport-connect', { dtlsParameters ,transportId: producerTransport.id, roomId: roomId}, (error) => {
                console.log("socket emit done")
                if (error) {
                  console.error('Transport connect server error:', error)
                  reject(error)
                } else {
                  console.log('Transport connect server success')
                  resolve()
                }
              })
            })
            console.log("trying to callback")
            callback();
          } catch (error) {
            console.error('Transport connect error:', error)
            errback(error)
          }
        })

        producerTransport.on('produce', async (parameters, callback, errback) => {
          console.log('Producer transport produce event triggered');
          console.log("now i will try to go in the tansport produce");
          try {
            console.log("in the try");
            await new Promise((resolve, reject) => {
              socket.emit('transport-produce', {
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters,
                appData: parameters.appData,
                transportId: producerTransport.id, 
                roomId: roomId
              }, (response) => {
                if (response.error) {
                  console.error('Produce server error:', response.error)
                  reject(response.error)
                } else {
                  console.log('Produce server success, ID:', response.id)
                  resolve(response.id)
                }
              })
            }).then((id) => {
              callback({ id })
            })
          } catch (error) {
            console.error('Produce event error:', error)
            errback(error)
          }
        })

        producerTransport.on('connectionstatechange', (state) => {
          console.log('Producer transport connection state:', state)
          if (state === 'connected') {
            console.log('Producer transport connected successfully!')
          } else if (state === 'failed') {
            console.error('Producer transport connection failed!')
          }
        })

        producerTransport.on('iceconnectionstatechange', (state) => {
          console.log('Producer ICE connection state:', state)
          if (state === 'connected') {
            console.log('Producer ICE connected!')
          } else if (state === 'failed') {
            console.error('Producer ICE connection failed!')
          }
        })

        producerTransport.on('icegatheringstatechange', (state) => {
          console.log('Producer ICE gathering state:', state)
        })

        resolve(producerTransport)
      })
    })
  }

  
  const connectSendTransport = async () => {
  try {
    if (!producerTransport) {
      throw new Error('Producer transport not created');
    }
    if (!videoparams.track) {
      throw new Error('No video track available');
    }

    // 1. VIDEO
    console.log('Starting to produce video...')
    videoProducer = await producerTransport.produce({
      track: videoparams.track,
      ...videoparams,         // encodings / codecOptions
      kind: 'video'
    });
    console.log('videoProducer created successfully:', videoProducer.id);

     videoProducer.on('trackended', () => {
      console.log('Video track ended');
      videoProducer?.close();          // clean up
    });
    videoProducer.on('transportclose', () => {
      console.log('Video producer transport closed');
      videoProducer = null;
    });


    // 2. AUDIO
    console.log('Starting to produce audio...')
    if (audioParams.track) {
      audioProducer = await producerTransport.produce({
        track: audioParams.track,
        ...audioParams,
        kind: 'audio'
      });
    }
    console.log('audioProducer created successfully:', audioProducer.id);
      audioProducer.on('trackended', () => {
        console.log('Audio track ended');
        audioProducer?.close();
      });
      audioProducer.on('transportclose', () => {
        console.log('Audio producer transport closed');
        audioProducer = null;
      });

    console.log('Produced video & audio:', !!videoProducer, !!audioProducer);
  } catch (error) {
    console.error('Error in connectSendTransport:', error);
    throw error;
  }
};

  const createRecvTransport = () => {
    return new Promise((resolve, reject) => {
      if (!device) {
        const error = 'Device not initialized'
        console.error(error)
        reject(error)
        return
      }

      console.log(roomId);
      socket.emit('createWebRtcTransport', { sender: false , roomId :roomId}, (response) => {
        if (response.error || response.params?.error) {
          const error = response.error || response.params.error
          console.error('Consumer transport creation error:', error)
          reject(error)
          return
        }

        console.log('Consumer transport params:', response.params)
        consumerTransport = device.createRecvTransport({
          ...response.params,
          iceServers: iceServers
        })

        consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          console.log('Consumer transport connect event triggered')
          try {
            await new Promise((resolve, reject) => {
              socket.emit('transport-recv-connect', { dtlsParameters , transportId: consumerTransport.id, roomId: roomId }, (error) => {
                if (error) {
                  console.error('Consumer transport connect server error:', error)
                  reject(error)
                } else {
                  console.log('Consumer transport connect server success')
                  resolve()
                }
              })
            })
            callback()
          } catch (error) {
            console.error('Consumer transport connect error:', error)
            errback(error)
          }
        })

        consumerTransport.on('connectionstatechange', (state) => {
          console.log('Consumer transport connection state:', state)
          if (state === 'connected') {
            console.log('Consumer transport connected successfully!')
          } else if (state === 'failed') {
            console.error('Consumer transport connection failed!')
          }
        })

        consumerTransport.on('iceconnectionstatechange', (state) => {
          console.log('Consumer ICE connection state:', state)
        })

        resolve(consumerTransport)
      })
    })
  }

  // consumers = new Map();   // already defined at top-level scope

const connectRecvTransport = async (producerInfo) => {
  try {
    if (!consumerTransport) throw new Error('Consumer transport not created');
    if (!device?.rtpCapabilities) throw new Error('Device capabilities not available');

    console.log('Starting to consume media...', producerInfo);

    // 1. Ask server for consume params
    const { params } = await new Promise((resolve, reject) => {
      socket.emit('consume', {
        producerId: producerInfo.producerId,
        rtpCapabilities: device.rtpCapabilities,
        roomId
      }, (data) => {
        if (data.error) reject(data.error);
        else resolve(data);
      });
    });

    // 2. Create the consumer object
    const consumer = await consumerTransport.consume({
      id: params.id,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters,
      paused: true
    });

    addRemoteMedia(params.producerId, consumer.track, params.kind);

    // 5. Resume on server
    await new Promise((resolve, reject) => {
      socket.emit('consumer-resume', { consumerId: consumer.id, roomId }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    console.log('Consumer created & resumed:', consumer.id);
    return consumer;
  } catch (err) {
    console.error('connectRecvTransport error:', err);
    throw err;
  }
};

  const setupMediasoupPipeline = async () => {
    roomSetupDiv.style.display = 'none'; // hide immediately
      try {
          await getLocalStream();
          await getRtpCapabilities();
          await createDevice();
          await createSendTransport();
          await connectSendTransport();
          await createRecvTransport();
          // We'll consume producers as they become available in the room
          console.log('Mediasoup pipeline initialized.');
          // wire controls only AFTER producers are ready
          document.getElementById('btnToggleMic').addEventListener('click', toggleMic);
        document.getElementById('btnToggleCam').addEventListener('click', toggleCam);

          // roomSetupDiv.style.display = 'none'; // Hide room setup controls
          roomControlsDiv.style.display = 'block'; // Show video elements and call buttons
      } catch (error) {
          console.error('Error setting up Mediasoup pipeline:', error);
          alert('Failed to set up video call. See console for details.');
          // Potentially disable UI elements or show error to user
      }
  };

  async function toggleScreenShare() {
  // Stop previous share if running
  if (screenVideoProducer) {
    screenVideoProducer.close();
    screenAudioProducer?.close();
    screenVideoProducer = screenAudioProducer = null;
    return;
  }

  // Browser will pop the native picker
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,          // always required
    audio: true           // shows “Share audio” checkbox if available
  });

  const [videoTrack] = stream.getVideoTracks();
  const [audioTrack] = stream.getAudioTracks();

  // Produce the screen video
  screenVideoProducer = await producerTransport.produce({
    track: videoTrack,
    kind: 'video'
  });

  // Produce system/tab audio if user ticked the checkbox
  if (audioTrack) {
    screenAudioProducer = await producerTransport.produce({
      track: audioTrack,
      kind: 'audio'
    });
  }

  // Auto-close when user clicks “Stop sharing” in the browser UI
  videoTrack.onended = toggleScreenShare;
}

function toggleMic() {
  const btn = document.getElementById('btnToggleMic');
  if (audioProducer && !audioProducer.paused) {
    audioProducer.pause();                 // mute local mic
    btn.textContent = '🎤 Mic OFF';
  } else if (audioProducer) {
    audioProducer.resume();                // un-mute mic
    btn.textContent = '🎤 Mic ON';
  }
}

function toggleCam() {
  const btn = document.getElementById('btnToggleCam');
  if (videoProducer && !videoProducer.paused) {
    videoProducer.pause();                 // turn camera off
    btn.textContent = '📹 Cam OFF';
  } else if (videoProducer) {
    videoProducer.resume();                // turn camera on
    btn.textContent = '📹 Cam ON';
  }
}

  const CreateRoom = async () => {
      try {
          // Request the server to create a room and get a unique ID
          socket.emit('createRoom', (response) => {
              if (response.error) {
                  console.error('Error creating room:', response.error);
                  alert('Failed to create room: ' + response.error);
                  return;
              }
              roomId = response.roomId;
              console.log('Room created with ID:', roomId);
              displayRoomCodeSpan.textContent = roomId; // Display the room code to the user
              copyRoomCodeButton.style.display = 'inline-block'; // Show copy button

              setupMediasoupPipeline();
          });
      } catch (error) {
          console.error('Error in CreateRoom:', error);
      }
  };

  const JoinRoom = async () => {
      const enteredRoomId = roomCodeInput.value.trim();
      if (!enteredRoomId) {
          alert('Please enter a room code.');
          return;
      }
      roomId = enteredRoomId;

      try {
          // Inform the server about joining a room
          socket.emit('joinRoom', { roomId: roomId }, async (response) => {
              if (response.error) {
                  console.error('Error joining room:', response.error);
                  alert('Failed to join room: ' + response.error);
                  return;
              }
              console.log('Successfully joined room:', roomId);
              displayRoomCodeSpan.textContent = roomId; // Also display for joiners
              copyRoomCodeButton.style.display = 'inline-block'; // Show copy button

              // Now, set up Mediasoup pipeline
              await setupMediasoupPipeline();
              // After joining, we need to request existing producers in the room
              requestExistingProducers();
          });
      } catch (error) {
          console.error('Error in JoinRoom:', error);
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
                      connectRecvTransport(consumerResponse.params); // Use the data from the server
                  });
              }
          });
      });
  };

  // Listener for new producers in the room (from other participants)
  socket.on('newProducer', (data) => {
      console.log('New producer announced:', data);
       const myPids = [videoProducer?.id, audioProducer?.id].filter(Boolean);
      if (data.producerId && !myPids.includes(data.producerId)) { // Don't consume our own producer
          // Request server for consumer parameters for this new producer
          socket.emit('consume', { producerId: data.producerId, rtpCapabilities: device.rtpCapabilities, roomId: roomId }, (consumerResponse) => {
              if (consumerResponse.error) {
                  console.error('Error creating consumer for new producer:', consumerResponse.error);
                  return;
              }
              console.log('Consumer response for new producer:', consumerResponse.params);
              connectRecvTransport(consumerResponse.params);
          });
      }
  });

  // Listener for producers removed from the room
  socket.on('producerClosed', ({ producerId }) => {
  console.log('Producer closed:', producerId);
  removeRemoteMedia(producerId);
});

  // --- UI Event Listeners ---
  btnJoinRoom.addEventListener('click', JoinRoom);
  btnCreateRoom.addEventListener('click', CreateRoom);
  copyRoomCodeButton.addEventListener('click', () => {
      const roomCode = displayRoomCodeSpan.textContent;
      if (roomCode) {
          navigator.clipboard.writeText(roomCode)
              .then(() => {
                  alert('Room code copied to clipboard!');
              })
              .catch(err => {
                  console.error('Failed to copy room code: ', err);
                  alert('Failed to copy room code. Please copy manually: ' + roomCode);
              });
      }
  });

  // Hide video controls and copy button initially
  document.addEventListener('DOMContentLoaded', () => {
      roomControlsDiv.style.display = 'none';
      copyRoomCodeButton.style.display = 'none';
  });

  document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnShareScreen')
          .addEventListener('click', toggleScreenShare);
  // document.getElementById('btnToggleMic')  .addEventListener('click', toggleMic);
  // document.getElementById('btnToggleCam')  .addEventListener('click', toggleCam);
});

  