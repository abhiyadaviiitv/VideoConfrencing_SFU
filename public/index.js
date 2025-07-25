  const io = require('socket.io-client')
  const mediasoupClient = require('mediasoup-client')

  const socket = io("/mediasoup")

  socket.on('connection-success', ({ socketId }) => {
    console.log('Connected with socket ID:', socketId)
  })

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    localVideo.srcObject = null;
      remoteVideo.srcObject = null;
      // Reset room state
      roomId = null;
      device = null;
      rtpCapabilities = null;
      producerTransport = null;
      consumerTransport = null;
      producer = null;
      consumer = null;
      // Show room setup again
      roomSetupDiv.style.display = 'block';
      roomControlsDiv.style.display = 'none';
      displayRoomCodeSpan.textContent = 'N/A';
      copyRoomCodeButton.style.display = 'none';

  })

  socket.on('error', (error) => {
    console.error('Socket error:', error)
  })

  let device
  let rtpCapabilities
  let producerTransport
  let consumerTransport
  let producer
  let consumer
  let roomId;

  const params = {
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
  const remoteVideo = document.getElementById('remoteVideo')
  const btnJoinRoom = document.getElementById('btnJoinRoom');
  const btnCreateRoom = document.getElementById('btnCreateRoom');
  const roomCodeInput = document.getElementById('roomCodeInput'); // Input for joining
  const displayRoomCodeSpan = document.getElementById('displayRoomCode'); // To show created room code
  const copyRoomCodeButton = document.getElementById('copyRoomCode'); // New button to copy
  const roomSetupDiv = document.getElementById('roomSetup'); // To hide after joining/creating
  const roomControlsDiv = document.getElementById('roomControls'); // To show after joining/creating


  const streamSuccess = async (stream) => {
    try {
      localVideo.srcObject = stream
      const track = stream.getVideoTracks()[0]
      params.track = track
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
          const track = streamSuccess(stream); // Call streamSuccess directly with the awaited stream
          return track; // getLocalStream now returns the track
      } catch (error) {
          console.error("Error accessing media devices in getLocalStream:", error.name, error.message, error);
          throw error; // Propagate error
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
        throw new Error('Producer transport not created')
      }
      
      if (!params.track) {
        throw new Error('No track available to produce')
      }

      console.log('Starting to produce media...')
      producer = await producerTransport.produce(params);
      console.log('Producer created successfully:', producer.id);

      producer.on('trackended', () => {
        console.log('Producer track ended')
      })

      producer.on('transportclose', () => {
        console.log('Producer transport closed')
      })

      return producer
    } catch (error) {
      console.error('Error connecting send transport:', error)
      throw error
    }
  }

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

  const connectRecvTransport = async (producerInfo) => {
    try {
      if (!consumerTransport) {
        throw new Error('Consumer transport not created')
      }
      
      console.log(producerInfo);
      if (!device?.rtpCapabilities) {
        throw new Error('Device capabilities not available')
      }
      console.log('Starting to consume media...')
      const response = await new Promise((resolve, reject) => {
        socket.emit('consume', {
          producerId : producerInfo.producerId  ,
          rtpCapabilities: device.rtpCapabilities,
          roomId:roomId,
        }, (data) => {
          if (data.error) {
            reject(data.error)
            return
          }
          resolve(data)
        })
      })

      console.log('Consumer params:', response.params)
      consumer = await consumerTransport.consume({
        id: response.params.id,
        producerId: response.params.producerId,
        kind: response.params.kind,
        rtpParameters: response.params.rtpParameters,
        paused: true
      })

      console.log("trying to add the remote video")
      // Set up the remote video stream
      const { track } = consumer
      if (!remoteVideo.srcObject) {
        remoteVideo.srcObject = new MediaStream()
      }
      remoteVideo.srcObject.addTrack(track)
      console.log("remote video set successfully")
      // Resume the consumer
     await new Promise((resolve, reject) => {
    // Correct way to emit with data and an acknowledgment callback
    socket.emit('consumer-resume', { consumerId: consumer.id, roomId : roomId }, (error) => {
        if (error) {
            console.error('Consumer resume server error:', error); // More specific logging
            reject(error);
            return;
        }
        console.log('Consumer resume server success'); // Log success
        resolve();
    });
});

      console.log('Consumer created and resumed successfully:', consumer.id)
      return consumer
    } catch (error) {
      console.error('Error in connectRecvTransport:', error)
      throw error
    }
  }

  const setupMediasoupPipeline = async () => {
      try {
          await getLocalStream();
          await getRtpCapabilities();
          await createDevice();
          await createSendTransport();
          await connectSendTransport();
          await createRecvTransport();
          // We'll consume producers as they become available in the room
          console.log('Mediasoup pipeline initialized.');
          roomSetupDiv.style.display = 'none'; // Hide room setup controls
          roomControlsDiv.style.display = 'block'; // Show video elements and call buttons
      } catch (error) {
          console.error('Error setting up Mediasoup pipeline:', error);
          alert('Failed to set up video call. See console for details.');
          // Potentially disable UI elements or show error to user
      }
  };

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
    console.log("trying to get the producers in the room")
      socket.emit('getProducersInRoom', { roomId: roomId }, (response) => {
          if (response.error) {
              console.error('Error getting producers in room:', response.error);
              return;
          }
          console.log('Existing producers in room:', response.producerIds);
          response.producerIds.forEach(async (producerId) => {
              if (producerId !== producer?.id) { // Don't consume our own producer
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
      if (data.producerId && data.producerId !== producer?.id) { // Don't consume our own producer
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
  socket.on('producerRemoved', ({ producerId }) => {
      console.log('Producer removed:', producerId);
      // You would typically find the corresponding remote video element and remove it
      // For simplicity, we are only supporting one remote video in this example.
      // In a multi-party scenario, you'd need to map producerIds to specific video elements.
      if (consumer && consumer.producerId === producerId) {
          console.log('Our consumed producer was removed. Cleaning up remote video.');
          consumer.close();
          consumer = null;
          remoteVideo.srcObject = null; // Clear the remote video
      }
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
