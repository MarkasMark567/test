import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Upload, Download, Play, CheckCircle2, AlertCircle, FileText, Loader2, Video, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Status {
  message: string;
  progress: number;
  videoProgress?: number;
  audioProgress?: number;
  downloadUrl?: string;
}

export default function App() {
  const [url, setUrl] = useState('');
  const [cookieFile, setCookieFile] = useState<string | null>(null);
  const [isUploadingCookie, setIsUploadingCookie] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('status', (data: Status) => {
      setStatus(data);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const handleCookieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCookie(true);
    const formData = new FormData();
    formData.append('cookies', file);

    try {
      const response = await fetch('/api/upload-cookies', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.filename) {
        setCookieFile(data.filename);
      }
    } catch (error) {
      // Silently fail or handle UI error
    } finally {
      setIsUploadingCookie(false);
    }
  };

  const startDownload = async () => {
    if (!url || !cookieFile) return;

    setStatus({ message: 'Initializing...', progress: 0, videoProgress: 0, audioProgress: 0 });

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, cookieFile }),
      });
      const data = await response.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
        socketRef.current?.emit('join', data.sessionId);
      }
    } catch (error) {
      setStatus({ message: 'Failed to start download', progress: 0 });
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        <header className="mb-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mb-4"
          >
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Download className="w-6 h-6 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">TubeFetch</h1>
          </motion.div>
          <p className="text-zinc-400 max-w-lg">
            High-performance YouTube video downloader. Cookies are required for all downloads to ensure compatibility.
          </p>
        </header>

        <div className="grid gap-8">
          {/* Input Section */}
          <motion.section 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-xl"
          >
            <div className="flex flex-col gap-6">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  YouTube Video URL
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-black/40 border border-zinc-800 rounded-xl py-4 px-5 pr-12 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-emerald-500 transition-colors">
                    <Play className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                    Authentication (Required)
                  </label>
                  <label className={`
                    flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl border border-dashed cursor-pointer transition-all
                    ${cookieFile ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-400' : 'bg-black/20 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-black/40'}
                  `}>
                    <input type="file" className="hidden" onChange={handleCookieUpload} accept=".txt" />
                    {isUploadingCookie ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : cookieFile ? (
                      <FileText className="w-4 h-4" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium">
                      {cookieFile ? 'Cookies Loaded' : 'Upload cookies-youtube-com.txt'}
                    </span>
                  </label>
                </div>

                <button
                  onClick={startDownload}
                  disabled={!url || !cookieFile || (status && status.progress < 100 && !status.message.includes('Error'))}
                  className="h-[50px] mt-7 px-8 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {status && status.progress < 100 && !status.message.includes('Error') ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Start Download
                    </>
                  )}
                </button>
              </div>
              {!cookieFile && (
                <p className="text-xs text-red-400/80 flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3" />
                  Please upload a cookies file to enable downloads.
                </p>
              )}
            </div>
          </motion.section>

          {/* Progress Section */}
          <AnimatePresence>
            {status && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    {status.message.includes('Error') ? (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    ) : status.progress === 100 ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    )}
                    <span className="font-medium text-zinc-200">{status.message}</span>
                  </div>
                </div>

                <div className="grid gap-6">
                  {/* Video Progress */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                      <div className="flex items-center gap-2">
                        <Video className="w-3 h-3" />
                        Video Stream
                      </div>
                      <span className="font-mono">{Math.round(status.videoProgress || 0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <motion.div 
                        className={`h-full ${status.message.includes('Error') ? 'bg-red-500' : 'bg-emerald-500'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${status.videoProgress || 0}%` }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                      />
                    </div>
                  </div>

                  {/* Audio Progress */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                      <div className="flex items-center gap-2">
                        <Music className="w-3 h-3" />
                        Audio Stream
                      </div>
                      <span className="font-mono">{Math.round(status.audioProgress || 0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <motion.div 
                        className={`h-full ${status.message.includes('Error') ? 'bg-red-500' : 'bg-blue-500'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${status.audioProgress || 0}%` }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                      />
                    </div>
                  </div>
                </div>

                {status.downloadUrl && (
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mt-8 overflow-hidden rounded-xl border border-zinc-800 bg-black shadow-2xl"
                  >
                    <video 
                      src={status.downloadUrl} 
                      controls 
                      className="w-full aspect-video"
                      autoPlay
                    />
                    <div className="p-4 bg-zinc-900/50 flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-400">Download Complete</span>
                      <a 
                        href={status.downloadUrl} 
                        download 
                        className="text-xs font-bold uppercase tracking-wider text-emerald-500 hover:text-emerald-400 transition-colors flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Save File
                      </a>
                    </div>
                  </motion.div>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="max-w-4xl mx-auto px-6 py-12 border-t border-zinc-900 text-center">
        <p className="text-xs text-zinc-600 uppercase tracking-[0.2em]">
          Powered by yt-dlp & ffmpeg
        </p>
      </footer>
    </div>
  );
}
