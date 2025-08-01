import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Config
const RECORD_DIR = './uploads/recordings';

class Recorder extends EventEmitter {
    constructor(worker, rooms) {
        super();
        this.worker = worker; // Mediasoup worker (if custom worker needed)
        this.rooms = rooms; // Reference to rooms object from app.js
        this.recordings = new Map(); // Store active recordings: roomId -> recordingData
    }

    /**
     * Start recording a room
     * @param {string} roomId 
     * @param {object} router Mediasoup router
     * @param {Array} producers List of active producers to record
     */
    async startRecording(roomId, router, producers) {
        if (this.recordings.has(roomId)) {
            throw new Error('Recording already in progress for this room');
        }

        console.log(`[Recorder] Starting recording for room ${roomId}`);

        const recordingData = {
            router,
            transports: [], // PlainTransports
            consumers: [],  // Mediasoup Consumers
            process: null,  // GStreamer Process
            filePath: `${RECORD_DIR}/${roomId}-${Date.now()}.mp4`
        };

        // store for now
        this.recordings.set(roomId, recordingData);

        try {
            // 1. Create RTP inputs (consumers)
            const inputs = [];
            for (const p of producers) {
                if (p.kind !== 'video' && p.kind !== 'audio') continue;

                const input = await this.createInput(router, p.producer);
                inputs.push({ ...input, kind: p.kind, codec: p.producer.rtpParameters.codecs[0].mimeType.split('/')[1] });

                recordingData.transports.push(input.transport);
                recordingData.consumers.push(input.consumer);
            }

            if (inputs.length === 0) {
                throw new Error('No producers to record');
            }

            // 2. Build GStreamer Command
            const gstCmd = this.buildPipeline(inputs, recordingData.filePath);
            console.log(`[Recorder] GStreamer Pipeline: ${gstCmd}`);

            // 3. Spawn Process
            const args = gstCmd.split(' ').filter(a => a.length > 0);
            const child = spawn(args[0], args.slice(1));

            recordingData.process = child;

            child.stdout.on('data', (data) => console.log(`[GST-${roomId}] ${data}`));
            child.stderr.on('data', (data) => console.log(`[GST-${roomId}] ${data}`)); // GStreamer logs to stderr mostly

            child.on('close', (code) => {
                console.log(`[Recorder] Process exited with code ${code}`);
                this.cleanup(roomId);
            });

            return { filePath: recordingData.filePath };

        } catch (error) {
            console.error('[Recorder] Error starting recording:', error);
            this.cleanup(roomId);
            throw error;
        }
    }

    async stopRecording(roomId) {
        const rec = this.recordings.get(roomId);
        if (!rec) return;

        console.log(`[Recorder] Stopping recording for ${roomId}`);

        // Graceful stop (send SIGINT to allow mp4mux to finalize)
        if (rec.process) {
            rec.process.kill('SIGINT');
        }

        // Cleanup will happen in 'close' event
    }

    // --- Internal Helpers ---

    async createInput(router, producer) {
        const remotePort = await this.getPort();
        const remoteRtcpPort = remotePort + 1;

        // 1. Create PlainTransport
        const transport = await router.createPlainTransport({
            listenIp: { ip: '127.0.0.1', announcedIp: null },
            rtcpMux: false, // Separate ports for RTP and RTCP
            comedia: false  // We initiate connection
        });

        // 2. Connect transport to GStreamer destination
        await transport.connect({
            ip: '127.0.0.1',
            port: remotePort,
            rtcpPort: remoteRtcpPort
        });

        console.log(`[Recorder] Transport connected to 127.0.0.1:${remotePort} (RTP) / ${remoteRtcpPort} (RTCP)`);

        // 3. Create Consumer
        // We need to consume the producer's RTP.
        const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities: router.rtpCapabilities,
            paused: false
        });

        console.log(`[Recorder] Consumer created: ${consumer.id}, Kind: ${consumer.kind}`);

        return {
            transport,
            consumer,
            remotePort,
            remoteRtcpPort
        };
    }

    buildPipeline(inputs, filePath) {
        const videoInputs = inputs.filter(i => i.kind === 'video');
        const audioInputs = inputs.filter(i => i.kind === 'audio');

        let pipeline = 'gst-launch-1.0 -e ';

        // --- Audio Mixing Section ---
        if (audioInputs.length > 0) {
            pipeline += 'audiomixer name=amix ! audioconvert ! audioresample ! avenc_aac ! queue ! mux.audio_0 ';

            audioInputs.forEach((input, index) => {
                const codec = input.codec.toUpperCase();
                const pt = input.consumer.rtpParameters.codecs[0].payloadType;
                const clockRate = input.consumer.rtpParameters.codecs[0].clockRate;

                let depay = 'rtpopusdepay';
                let dec = 'opusdec';

                if (codec !== 'OPUS') {
                    console.warn(`[Recorder] Unsupported audio codec: ${codec}, defaulting elements but might fail.`);
                    depay = 'rtpdepay';
                    dec = 'fakesink';
                }

                pipeline += `udpsrc port=${input.remotePort} caps="application/x-rtp,media=audio,clock-rate=${clockRate},encoding-name=${codec},payload=${pt}" ! ${depay} ! ${dec} ! queue ! amix.sink_${index} `;
            });
        }

        // --- Video Compositing Section ---
        if (videoInputs.length > 0) {
            pipeline += 'compositor name=comp sink_1::alpha=1 sink_2::alpha=1 sink_3::alpha=1 sink_4::alpha=1 ! videoconvert ! videoscale ! video/x-raw,width=1280,height=720 ! x264enc speed-preset=ultrafast tune=zerolatency ! queue ! mux.video_0 ';

            const grid = this.calculateGrid(videoInputs.length);
            const cellWidth = Math.floor(1280 / grid.cols);
            const cellHeight = Math.floor(720 / grid.rows);

            videoInputs.forEach((input, index) => {
                const codec = input.codec.toUpperCase();
                const pt = input.consumer.rtpParameters.codecs[0].payloadType;

                // Grid position logic
                const row = Math.floor(index / grid.cols);
                const col = index % grid.cols;
                const xpos = col * cellWidth;
                const ypos = row * cellHeight;

                let depay = '';
                let dec = '';

                if (codec === 'VP8') {
                    depay = 'rtpvp8depay';
                    dec = 'vp8dec';
                } else if (codec === 'H264') {
                    depay = 'rtph264depay';
                    dec = 'avdec_h264';
                } else {
                    // Skip unknown for now, or handle gracefully
                    return;
                }

                pipeline += `udpsrc port=${input.remotePort} caps="application/x-rtp,media=video,clock-rate=90000,encoding-name=${codec},payload=${pt}" ! ${depay} ! ${dec} ! videoconvert ! videoscale ! video/x-raw,width=${cellWidth},height=${cellHeight} ! queue ! comp.sink_${index} `;

                // Set sink properties for position (need to append to pipeline? No, compositor properties are set on pads or globally, wait.)
                // In gst-launch-1.0, sink properties are set on the element usually via sink_N::prop=val
                // BUT we need to set them for specific pads. 
                // Correct syntax: compositor name=comp sink_0::xpos=0 ... sink_1::xpos=...
                // So we need to inject these settings into the 'compositor' element definition block ABOVE.

                // Actually, easier way: 
                // We can append pad properties to the compositor element definition string.

            });

            // RE-WRITE to inject pad properties correctly
            let compStr = 'compositor name=comp background=black '; // Use black background

            // We need to generate the sink_N::xpos params part of the string
            videoInputs.forEach((_, index) => {
                const row = Math.floor(index / grid.cols);
                const col = index % grid.cols;
                const xpos = col * cellWidth;
                const ypos = row * cellHeight;
                compStr += `sink_${index}::xpos=${xpos} sink_${index}::ypos=${ypos} sink_${index}::width=${cellWidth} sink_${index}::height=${cellHeight} `;
            });

            // Replace the generic compositor line with this specific one
            pipeline = pipeline.replace('compositor name=comp sink_1::alpha=1 sink_2::alpha=1 sink_3::alpha=1 sink_4::alpha=1', compStr);
        }

        // --- Muxer ---
        pipeline += `mp4mux name=mux ! filesink location="${filePath}"`;

        return pipeline;
    }

    calculateGrid(count) {
        if (count <= 1) return { rows: 1, cols: 1 };
        if (count <= 2) return { rows: 1, cols: 2 };
        if (count <= 4) return { rows: 2, cols: 2 };
        if (count <= 6) return { rows: 2, cols: 3 };
        if (count <= 9) return { rows: 3, cols: 3 };
        return { rows: 4, cols: 4 }; // Max 16
    }

    async cleanup(roomId) {
        const rec = this.recordings.get(roomId);
        if (!rec) return;

        // Close transports
        rec.transports.forEach(t => t.close());
        rec.consumers.forEach(c => c.close());

        // Process handling
        if (rec.process) {
            // already handled in startRecording
        }

        this.recordings.delete(roomId);
    }

    async getPort() {
        // Return random even port between 20000 and 40000
        // Port must be even for RTP? Mediasoup doesn't restrict, but GStreamer conventions prefer even RTP, odd RTCP
        let port = Math.floor(Math.random() * 20000) + 20000;
        if (port % 2 !== 0) port++;
        return port;
    }
}

export default Recorder;
