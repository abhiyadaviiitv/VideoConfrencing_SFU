const io = require('socket.io-client')
const mediasoupClient = require('mediasoup-client')

const socket = io("/mediasoup")

socket.on('connection-success', ({ socketId }) => {
  console.log('Connected with socket ID:', socketId)
})

socket.on('disconnect', () => {
  console.log('Disconnected from server')
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
  // Comment out TURN server if it's not working
  // {
  //   urls: 'turn:relay1.expressturn.com:3480',
  //   username: '000000002065332507',
  //   credential: '2dm9ltTqJIjVrRq/LI/QvTm0nPY='
  // }
]

// DOM elements
const localVideo = document.getElementById('localVideo')
const remoteVideo = document.getElementById('remoteVideo')
const btnLocalVideo = document.getElementById('btnLocalVideo')
const btnRtpCapabilities = document.getElementById('btnRtpCapabilities')
const btnDevice = document.getElementById('btnDevice')
const btnCreateSendTransport = document.getElementById('btnCreateSendTransport')
const btnConnectSendTransport = document.getElementById('btnConnectSendTransport')
const btnRecvSendTransport = document.getElementById('btnRecvSendTransport')
const btnConnectRecvTransport = document.getElementById('btnConnectRecvTransport')

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

const getLocalStream = () => {
  console.log("Getting the local stream")
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { min: 640, max: 1920 },
      height: { min: 400, max: 1080 }
    }
  })
  .then(streamSuccess)
  .catch(error => {
    console.error("Error accessing media devices:", error)
  })
}

const createDevice = async () => {
  try {
    if (!rtpCapabilities) {
      console.error('RTP capabilities not loaded')
      return
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
  socket.emit('getRtpCapabilities', (data) => {
    if (data.error) {
      console.error('Error getting RTP capabilities:', data.error)
      return
    }
    console.log('Router RTP Capabilities received')
    rtpCapabilities = data.rtpCapabilities
  })
}

const createSendTransport = () => {
  return new Promise((resolve, reject) => {
    if (!device) {
      const error = 'Device not initialized'
      console.error(error)
      reject(error)
      return
    }

    socket.emit('createWebRtcTransport', { sender: true }, (response) => {
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
            socket.emit('transport-connect', { dtlsParameters }, (error) => {
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

    socket.emit('createWebRtcTransport', { sender: false }, (response) => {
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
            socket.emit('transport-recv-connect', { dtlsParameters }, (error) => {
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

const connectRecvTransport = async () => {
  try {
    if (!consumerTransport) {
      throw new Error('Consumer transport not created')
    }
    
    if (!device?.rtpCapabilities) {
      throw new Error('Device capabilities not available')
    }
    console.log('Starting to consume media...')
    const response = await new Promise((resolve, reject) => {
      socket.emit('consume', {
        rtpCapabilities: device.rtpCapabilities,
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

    // Set up the remote video stream
    const { track } = consumer
    if (!remoteVideo.srcObject) {
      remoteVideo.srcObject = new MediaStream()
    }
    remoteVideo.srcObject.addTrack(track)

    // Resume the consumer
    await new Promise((resolve, reject) => {
      socket.emit('consumer-resume', (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })

    console.log('Consumer created and resumed successfully:', consumer.id)
    return consumer
  } catch (error) {
    console.error('Error in connectRecvTransport:', error)
    throw error
  }
}

// Event listeners
btnLocalVideo.addEventListener('click', getLocalStream)
btnRtpCapabilities.addEventListener('click', getRtpCapabilities)
btnDevice.addEventListener('click', createDevice)
btnCreateSendTransport.addEventListener('click', createSendTransport)
btnConnectSendTransport.addEventListener('click', connectSendTransport)
btnRecvSendTransport.addEventListener('click', createRecvTransport)
btnConnectRecvTransport.addEventListener('click', connectRecvTransport)