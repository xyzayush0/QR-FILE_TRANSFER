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
  
  const timerRef = useRef(null);
  const fileRef = useRef(file);

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  useEffect(() => {
    if (mode === 'fast') {
      const peer = initPeer((id) => setPeerId(id));
      peer.on('connection', (connection) => {
        setConn(connection);
        connection.on('open', () => {
          const currentFile = fileRef.current;
          if (currentFile) {
            connection.send({ type: 'header', name: currentFile.name, size: currentFile.size, fileType: currentFile.type });
            // Send file as ArrayBuffer
            currentFile.arrayBuffer().then(buffer => {
               connection.send({ type: 'file', buffer });
               setTransferProgress(100);
            });
          }
        });
      });
      return () => {
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
    </div>
  );
};
