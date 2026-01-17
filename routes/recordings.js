import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Ensure recordings directory exists
const RECORDINGS_DIR = './uploads/recordings';
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, RECORDINGS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${req.body.roomId}-${Date.now()}.webm`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Upload endpoint
router.post('/upload', upload.single('recording'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/recordings/${req.file.filename}`;

    console.log(`Recording saved: ${req.file.filename} (${req.file.size} bytes)`);

    res.json({
        success: true,
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size
    });
});

// List recordings endpoint (optional)
router.get('/list', (req, res) => {
    fs.readdir(RECORDINGS_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to list recordings' });
        }

        const recordings = files
            .filter(f => f.endsWith('.webm'))
            .map(f => ({
                filename: f,
                url: `/uploads/recordings/${f}`,
                size: fs.statSync(path.join(RECORDINGS_DIR, f)).size
            }));

        res.json({ recordings });
    });
});

export default router;
