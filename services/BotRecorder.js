import { launch } from 'puppeteer-stream';
import { getStream } from 'puppeteer-stream';
import puppeteer from 'puppeteer';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';

const RECORD_DIR = './uploads/recordings';

class BotRecorder extends EventEmitter {
    constructor() {
        super();
        this.browsers = new Map(); // roomId -> { browser, stream }
    }

    async startRecording(roomId) {
        if (this.browsers.has(roomId)) {
            throw new Error('Recording already in progress for this room');
        }

        console.log(`[BotRecorder] Starting recording for room ${roomId}`);
        const filePath = `${RECORD_DIR}/${roomId}-${Date.now()}.mp4`;
        let frontendUrl = process.env.FRONTEND_URL || 'https://10.37.80.42.nip.io:5173';
        if (frontendUrl.startsWith('http://localhost:5173')) {
            console.log('[BotRecorder] Enforcing HTTPS for local development');
            frontendUrl = frontendUrl.replace('http:', 'https:');
        }

        try {
            // 1. Generate Bot Token
            // Use a fixed ID or random high ID to avoid conflict
            const botUser = {
                id: 999999,
                name: 'Recorder Bot',
                email: 'recorder@bot.local',
                avatar_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' // 1x1 transparent PNG
            };

            const token = jwt.sign(botUser, process.env.JWT_SECRET, { expiresIn: '1d' });

            // 2. Launch Browser using puppeteer-stream's launch
            const browser = await launch({
                executablePath: puppeteer.executablePath(), // Use Chromium from puppeteer package
                headless: "new", // Valid for newer puppeteer
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--ignore-certificate-errors', // Vital for self-signed certs
                    '--use-fake-ui-for-media-stream',
                    '--autoplay-policy=no-user-gesture-required'
                ],
                defaultViewport: {
                    width: 1280,
                    height: 720
                },
                ignoreHTTPSErrors: true
            });

            const page = await browser.newPage();

            // Debug browser console
            page.on('console', msg => console.log('[Bot Browser Log]:', msg.text()));

            // Ignore non-critical resource loading errors
            page.on('pageerror', error => {
                console.log('[Bot Browser Page Error]:', error.message);
            });
            page.on('requestfailed', request => {
                console.log('[Bot Browser Request Failed]:', request.url(), request.failure()?.errorText);
            });

            // 3. Inject Auth Token (Navigate to domain first to set localStorage)
            // We go to the login page first
            console.log(`[BotRecorder] Navigating to ${frontendUrl}/auth...`);
            await page.goto(`${frontendUrl}/auth`, { waitUntil: 'load', timeout: 0 });

            await page.evaluate((t, u) => {
                console.log('Injecting tokens into localStorage...');
                localStorage.setItem('token', t);
                localStorage.setItem('jwt', t);
                localStorage.setItem('userName', u.name);
                localStorage.setItem('userEmail', u.email);
                localStorage.setItem('userId', u.id);
                localStorage.setItem('userAvatar', u.avatar_url);
                localStorage.setItem('cachedUser', JSON.stringify(u));
                localStorage.setItem('userCacheTimestamp', Date.now().toString());
                console.log('Tokens injected. Current localStorage keys:', Object.keys(localStorage));
            }, token, botUser);

            console.log(`[BotRecorder] Auth token injected for ${roomId}`);

            // 4. Join Room
            // Append ?isBot=true to hide controls
            console.log(`[BotRecorder] Navigating to room ${frontendUrl}/room/${roomId}?isBot=true...`);
            await page.goto(`${frontendUrl}/room/${roomId}?isBot=true`, { waitUntil: 'load', timeout: 0 }); // Wait for connection
            console.log('[BotRecorder] Page loaded successfully');

            // Give time for React to mount and media streams to initialize
            console.log('[BotRecorder] Waiting 5s for room initialization...');
            await new Promise(r => setTimeout(r, 5000));
            console.log('[BotRecorder] Starting stream capture...');

            // 5. Start Stream Capture
            // puppeteer-stream uses ffmpeg internally.
            const stream = await getStream(page, {
                audio: true,
                video: true,
                frameSize: 30, // fps
                mimeType: "video/mp4", // Output format
            });

            const fileStream = fs.createWriteStream(filePath);
            stream.pipe(fileStream);

            console.log(`[BotRecorder] Stream piping to ${filePath}`);

            this.browsers.set(roomId, { browser, stream, fileStream });

            // Monitor for close
            browser.on('disconnected', () => {
                this.cleanup(roomId);
            });

            return { filePath };

        } catch (error) {
            console.error('[BotRecorder] Error:', error);
            this.cleanup(roomId);
            throw error;
        }
    }

    async stopRecording(roomId) {
        const rec = this.browsers.get(roomId);
        if (!rec) return;

        console.log(`[BotRecorder] Stopping recording for ${roomId}`);
        await rec.browser.close();
        // cleanup called via 'disconnected' event
    }

    async cleanup(roomId) {
        if (this.browsers.has(roomId)) {
            this.browsers.delete(roomId);
            console.log(`[BotRecorder] Cleaned up ${roomId}`);
        }
    }
}

export default BotRecorder;
