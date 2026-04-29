import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'ffmpeg-static';
import { execSync } from 'child_process';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

// Setup storage
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');
const BIN_DIR = path.join(process.cwd(), 'bin');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR);
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR);

const YTP_PATH = path.join(BIN_DIR, 'yt-dlp');
const DENO_PATH = path.join(BIN_DIR, 'deno');

// Add BIN_DIR and ffmpeg dir to PATH so yt-dlp can find tools
if (ffmpeg) {
  const ffmpegDir = path.dirname(ffmpeg);
  process.env.PATH = `${ffmpegDir}${path.delimiter}${BIN_DIR}${path.delimiter}${process.env.PATH}`;
} else {
  process.env.PATH = `${BIN_DIR}${path.delimiter}${process.env.PATH}`;
}

// Download yt-dlp if not exists
async function ensureYtDlp() {
  if (!fs.existsSync(YTP_PATH)) {
    try {
      const response = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp');
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(YTP_PATH, Buffer.from(buffer));
      fs.chmodSync(YTP_PATH, '755');
    } catch (error) {
      // Error is handled by the fact that the file won't exist
    }
  }
}

// Download deno if not exists (required for some YouTube challenges)
async function ensureDeno() {
  if (!fs.existsSync(DENO_PATH)) {
    try {
      const zipPath = path.join(BIN_DIR, 'deno.zip');
      execSync(`curl -sSL -Lo ${zipPath} https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip`);
      execSync(`unzip -o ${zipPath} -d ${BIN_DIR}`);
      fs.unlinkSync(zipPath);
      fs.chmodSync(DENO_PATH, '755');
    } catch (error) {
      // Error is handled by the fact that the file won't exist
    }
  }
}

ensureYtDlp();
ensureDeno();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

app.use(express.json());

// API Routes
app.post('/api/download', async (req, res) => {
  const { url, cookieFile } = req.body;

  if (!url || !cookieFile) {
    return res.status(400).json({ error: 'URL and Cookies are required' });
  }

  const sessionId = uuidv4();
  const outputFilename = `${sessionId}-video.mp4`;
  const outputPath = path.join(DOWNLOADS_DIR, outputFilename);

  // We'll handle the actual download in the background and notify via socket
  res.json({ sessionId });

  try {
    const options: any = {
      output: outputPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
      mergeOutputFormat: 'mp4',
      ffmpegLocation: ffmpeg,
      extractorArgs: 'youtube:remote_components=ejs:github',
      noCheckCertificates: true,
      preferFreeFormats: true,
    };

    if (cookieFile) {
      options.cookies = path.join(UPLOADS_DIR, cookieFile);
    }

    io.to(sessionId).emit('status', { message: 'Starting download...', progress: 0, videoProgress: 0, audioProgress: 0 });

    // Use the downloaded yt-dlp binary if available, otherwise fallback to youtube-dl-exec default
    const ydl = fs.existsSync(YTP_PATH) ? youtubedl.create(YTP_PATH) : youtubedl;
    
    const subprocess = ydl.exec(url, options);

    let currentType: 'video' | 'audio' | 'none' = 'none';
    let videoProgress = 0;
    let audioProgress = 0;

    subprocess.stdout?.on('data', (data) => {
      const output = data.toString();
      
      // Detect which stream is being downloaded
      if (output.includes('Destination:') || output.includes('has already been downloaded')) {
        if (output.includes('.mp4')) currentType = 'video';
        else if (output.includes('.m4a')) currentType = 'audio';
      }

      // Try to parse progress
      const progressMatch = output.match(/(\d+\.\d+)%/);
      if (progressMatch) {
        const progress = parseFloat(progressMatch[1]);
        if (currentType === 'video') {
          videoProgress = progress;
        } else if (currentType === 'audio') {
          audioProgress = progress;
        }

        io.to(sessionId).emit('status', { 
          message: currentType === 'video' ? 'Downloading Video...' : currentType === 'audio' ? 'Downloading Audio...' : 'Downloading...', 
          progress: (videoProgress + audioProgress) / 2,
          videoProgress,
          audioProgress
        });
      }
    });

    subprocess.stderr?.on('data', (data) => {
      const errorMsg = data.toString();
      // Only emit error if it seems fatal (not just a warning)
      if (errorMsg.includes('ERROR:')) {
        io.to(sessionId).emit('status', { 
          message: `Error: ${errorMsg.split('ERROR:')[1].trim()}`, 
          progress: 0 
        });
      }
    });

    await subprocess;

    if (fs.existsSync(outputPath)) {
      io.to(sessionId).emit('status', { 
        message: 'Download complete!', 
        progress: 100,
        videoProgress: 100,
        audioProgress: 100,
        downloadUrl: `/api/files/${outputFilename}`
      });
    } else {
      io.to(sessionId).emit('status', { 
        message: 'Error: Download finished but output file is missing.', 
        progress: 0 
      });
    }

  } catch (error: any) {
    io.to(sessionId).emit('status', { 
      message: `Error: ${error.message || 'Unknown error'}`, 
      progress: 0 
    });
  }
});

app.post('/api/upload-cookies', upload.single('cookies'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ filename: req.file.filename });
});

app.get('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  console.log(`Download request for: ${filename}`);
  if (!filename || filename.includes('..')) {
    return res.status(400).send('Invalid filename');
  }

  const filePath = path.resolve(DOWNLOADS_DIR, filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).send('Error downloading file');
        }
      }
    });
  } else {
    res.status(404).send('File not found');
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  socket.on('join', (sessionId) => {
    socket.join(sessionId);
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
