import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { UploadCloud, Zap, Eye, Play, Pause, CheckCircle } from 'lucide-react';
import { prepareChunks } from '../utils/chunking';
import { initPeer } from '../utils/webrtc';

export const SendDashboard = ({ onBack }) => {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('optical'); // 'optical' or 'fast'
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Optical state
  const [chunks, setChunks] = useState([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Fast state
  const [peerId, setPeerId] = useState('');
  const [conn, setConn] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [logs, setLogs] = useState([]);
  const addLog = (msg) => { console.log(msg); setLogs(prev => [...prev.slice(-4), msg]); };
  
  const timerRef = useRef(null);
  const fileRef = useRef(file);

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  useEffect(() => {
    if (mode === 'fast') {
      setErrorMsg('');
      addLog('Initializing PeerJS...');
      const peer = initPeer(
        (id) => { setPeerId(id); addLog(`PeerJS Open. ID: ${id}`); }, 
        (err) => { setErrorMsg(err); addLog(`PeerJS Error: ${err}`); }
      );
      peer.on('connection', (connection) => {
        addLog(`Incoming connection from ${connection.peer}`);
        setConn(connection);
        const sendData = async () => {
          addLog('DataChannel Open. Starting chunked transfer...');
          const currentFile = fileRef.current;
          if (currentFile) {
            const CHUNK_SIZE = 64 * 1024; // 64KB chunks
            const totalChunks = Math.ceil(currentFile.size / CHUNK_SIZE);
            
            connection.send({ 
              type: 'header', 
              name: currentFile.name, 
              size: currentFile.size, 
              fileType: currentFile.type,
              totalChunks: totalChunks
            });

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, currentFile.size);
              const chunkBlob = currentFile.slice(start, end);
              const chunkBuffer = await chunkBlob.arrayBuffer();
              
              // Prevent crashing the browser's WebRTC buffer
              if (connection.dataChannel && connection.dataChannel.bufferedAmount > 1024 * 1024 * 2) {
                await new Promise(resolve => {
                  const checkBuffer = () => {
                    if (connection.dataChannel.bufferedAmount < 1024 * 1024) resolve();
                    else setTimeout(checkBuffer, 20);
                  };
                  checkBuffer();
                });
              }
              
              connection.send({ type: 'chunk', index: i, buffer: chunkBuffer });
              setTransferProgress(Math.round(((i + 1) / totalChunks) * 100));
            }
            addLog('Transfer complete.');
          }
        };
        if (connection.open) {
          addLog('Connection already open, sending...');
          sendData();
        } else {
          addLog('Waiting for DataChannel to open...');
          connection.on('open', sendData);
        }
      });
      return () => {
        addLog('Cleaning up PeerJS...');
        peer.destroy();
        setPeerId('');
      };
    }
  }, [mode]);

  useEffect(() => {
    if (isPlaying && chunks.length > 0) {
      timerRef.current = setInterval(() => {
        setCurrentChunkIndex((prev) => (prev + 1) % chunks.length);
      }, 100); // 10 FPS
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isPlaying, chunks]);

  const handleFileChange = async (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      if (mode === 'optical') {
        setIsProcessing(true);
        const { chunks: fileChunks } = await prepareChunks(selected);
        setChunks(fileChunks);
        setIsProcessing(false);
      }
    }
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange({ target: { files: e.dataTransfer.files } });
    }
  };

  const reset = () => {
    setFile(null);
    setChunks([]);
    setIsPlaying(false);
    setConn(null);
    setTransferProgress(0);
  };

  return (
    <div className="glass-panel">
      <div className="header">
        <h2>Send File</h2>
        <p>Choose your transfer mode</p>
      </div>

      <div className="mode-toggle">
        <button 
          className={mode === 'optical' ? 'active' : ''} 
          onClick={() => { setMode('optical'); reset(); }}
        >
          <Eye size={16} style={{marginRight: 4}}/> Optical Mode
        </button>
        <button 
          className={mode === 'fast' ? 'active' : ''} 
          onClick={() => { setMode('fast'); reset(); }}
        >
          <Zap size={16} style={{marginRight: 4}}/> Fast Mode (WebRTC)
        </button>
      </div>

      {!file && (
        <div 
          className="file-drop" 
          onDragOver={handleDragOver} 
          onDrop={handleDrop}
          onClick={() => document.getElementById('fileInput').click()}
        >
          <UploadCloud size={48} color="var(--accent-color)" />
          <h3>Drag & Drop or Click</h3>
          <p>Select a file to send</p>
          <input 
            type="file" 
            id="fileInput" 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
          />
        </div>
      )}

      {isProcessing && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="pulse">Compressing and generating QR chunks...</p>
        </div>
      )}

      {file && !isProcessing && mode === 'optical' && chunks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          <div className="badge badge-optical">Offline Optical Transfer</div>
          <div className="qr-container">
            <QRCodeSVG value={chunks[currentChunkIndex]} size={250} level="L" />
          </div>
          <div className="progress-bar-container">
             <div className="progress-bar" style={{ width: `${((currentChunkIndex + 1) / chunks.length) * 100}%` }}></div>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Frame {currentChunkIndex + 1} of {chunks.length}
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
             <button className="btn btn-primary" onClick={() => setIsPlaying(!isPlaying)}>
               {isPlaying ? <Pause size={18} /> : <Play size={18} />} {isPlaying ? 'Pause' : 'Start Transmission'}
             </button>
          </div>
        </div>
      )}

      {file && mode === 'fast' && peerId && !conn && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          <div className="badge badge-fast">WebRTC Transfer</div>
          <p style={{ textAlign: 'center', fontSize: '0.9rem' }}>Scan this QR with the receiver device to pair instantly.</p>
          <div className="qr-container">
            <QRCodeSVG value={`WEBRTC|${peerId}`} size={200} level="M" />
          </div>
          <p className="pulse" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Waiting for connection...</p>
        </div>
      )}

      {errorMsg && (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--error-color)', background: 'rgba(255,0,0,0.1)', borderRadius: '8px', marginTop: '1rem' }}>
          <p><strong>Connection Error:</strong> {errorMsg}</p>
        </div>
      )}

      {conn && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <CheckCircle size={48} color="var(--success-color)" style={{ margin: '0 auto 1rem' }} />
          <h3>Connected!</h3>
          <p>Sending file: {file.name}</p>
          <div className="progress-bar-container" style={{ marginTop: '1rem' }}>
             <div className="progress-bar" style={{ width: `${transferProgress}%`, background: 'var(--success-color)' }}></div>
          </div>
          {transferProgress === 100 && <p style={{ marginTop: '0.5rem', color: 'var(--success-color)' }}>Transfer Complete</p>}
        </div>
      )}

      <button className="btn" onClick={onBack} style={{ marginTop: '1rem' }}>Back</button>

      {logs.length > 0 && (
        <div style={{ marginTop: '2rem', padding: '1rem', background: '#000', color: '#0f0', fontFamily: 'monospace', fontSize: '12px', borderRadius: '8px', textAlign: 'left' }}>
          <strong>Debug Logs:</strong><br/>
          {logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
};
