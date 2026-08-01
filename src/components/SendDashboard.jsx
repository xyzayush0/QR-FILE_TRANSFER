import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, CheckCircle, Eye, Zap, Play, Pause, Camera, QrCode, Keyboard } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from "html5-qrcode";
import { prepareChunks } from '../utils/chunking';
import { initPeer, connectToPeer } from '../utils/webrtc';

export const SendDashboard = ({ onBack }) => {
  const [file, setFile] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState('fast'); // 'optical' or 'fast'
  
  // 'show' (QR), 'scan' (Camera), 'code' (Text)
  const [pairingMode, setPairingMode] = useState('show');
  const pairingModeRef = useRef('show');

  // 'generate' or 'enter' (for 'code' mode)
  const [codeMode, setCodeMode] = useState('generate');
  const [enteredCode, setEnteredCode] = useState('');
  const codeModeRef = useRef('generate');

  const [peerId, setPeerId] = useState('');
  const [conn, setConn] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [logs, setLogs] = useState([]);
  
  const [scannerInstance, setScannerInstance] = useState(null);
  const isProcessingScan = useRef(false);

  const addLog = (msg) => { console.log(msg); setLogs(prev => [...prev.slice(-4), msg]); };
  
  const timerRef = useRef(null);
  const fileRef = useRef(file);
  const peerRef = useRef(null);

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  useEffect(() => {
    pairingModeRef.current = pairingMode;
  }, [pairingMode]);

  useEffect(() => {
    codeModeRef.current = codeMode;
  }, [codeMode]);

  const sendData = async (connection) => {
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
        
        if (connection.dataChannel && connection.dataChannel.bufferedAmount > 1024 * 1024 * 2) {
          connection.dataChannel.bufferedAmountLowThreshold = 1024 * 1024;
          await new Promise(resolve => {
            const onLow = () => {
              connection.dataChannel.removeEventListener('bufferedamountlow', onLow);
              resolve();
            };
            if (connection.dataChannel.bufferedAmount <= 1024 * 1024) {
              resolve();
            } else {
              connection.dataChannel.addEventListener('bufferedamountlow', onLow);
            }
          });
        }
        
        connection.send({ type: 'chunk', index: i, buffer: chunkBuffer });
        setTransferProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
      addLog('Transfer complete.');
    }
  };

  useEffect(() => {
    if (mode === 'fast') {
      let customId = null;
      if (pairingMode === 'code' && codeMode === 'generate') {
        customId = Math.random().toString(36).substring(2, 8).toUpperCase();
      }

      if (pairingMode === 'show' || (pairingMode === 'code' && codeMode === 'generate')) {
        setErrorMsg('');
        addLog('Initializing PeerJS...');
        const peer = initPeer(
          customId,
          (id) => { setPeerId(id); addLog(`PeerJS Open. ID: ${id}`); }, 
          (err) => { 
             if (err.type === 'unavailable-id') {
                setErrorMsg('Code collision. Please try generating again.');
             } else {
                setErrorMsg(String(err)); 
             }
             addLog(`PeerJS Error: ${err}`); 
          }
        );
        peerRef.current = peer;

        peer.on('connection', (connection) => {
          if (pairingModeRef.current === 'show' || (pairingModeRef.current === 'code' && codeModeRef.current === 'generate')) {
            addLog(`Incoming connection from ${connection.peer}`);
            setConn(connection);
            if (connection.open) {
              addLog('Connection already open, sending...');
              sendData(connection);
            } else {
              addLog('Waiting for DataChannel to open...');
              connection.on('open', () => sendData(connection));
            }
          }
        });
        return () => {
          addLog('Cleaning up PeerJS...');
          peer.destroy();
          peerRef.current = null;
          setPeerId('');
        };
      } else {
        // Just client mode
        setErrorMsg('');
        const peer = initPeer(
          null,
          (id) => { setPeerId(id); }, 
          (err) => { setErrorMsg(String(err)); }
        );
        peerRef.current = peer;
        return () => {
          peer.destroy();
          peerRef.current = null;
          setPeerId('');
        };
      }
    }
  }, [mode, pairingMode, codeMode]);

  useEffect(() => {
    let html5Qrcode;
    if (mode === 'fast' && pairingMode === 'scan' && file && !conn) {
      html5Qrcode = new Html5Qrcode("sender-reader");
      setScannerInstance(html5Qrcode);
      
      const config = { fps: 15, qrbox: { width: 250, height: 250 } };
      
      html5Qrcode.start({ facingMode: "environment" }, config, (decodedText) => {
        if (isProcessingScan.current) return;
        
        if (decodedText.startsWith("WEBRTC|")) {
          isProcessingScan.current = true;
          const remoteId = decodedText.split("|")[1];
          
          if (html5Qrcode) {
            html5Qrcode.stop().catch(console.error);
          }
          
          addLog(`Attempting to connect to ${remoteId}...`);
          const connection = connectToPeer(peerRef.current, remoteId, (c) => {
            addLog('DataChannel Open!');
            setConn(c);
            sendData(c);
          });
          connection.on('error', (err) => { setErrorMsg(err.message || String(err)); addLog(`Conn Error: ${err}`); });
        }
      }).catch(err => {
        console.error("Camera start failed", err);
      });
    }

    return () => {
      if (html5Qrcode && html5Qrcode.isScanning) {
        html5Qrcode.stop().catch(console.error);
      }
    };
  }, [mode, pairingMode, file, conn]);

  useEffect(() => {
    if (isPlaying && chunks.length > 0) {
      timerRef.current = setInterval(() => {
        setCurrentChunkIndex((prev) => (prev + 1) % chunks.length);
      }, 100);
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

  const initiateFastTransfer = (remoteId) => {
    if (!remoteId) return;
    addLog(`Attempting to connect to ${remoteId}...`);
    const connection = connectToPeer(peerRef.current, remoteId, (c) => {
      addLog('DataChannel Open!');
      setConn(c);
      sendData(c);
    });
    connection.on('error', (err) => { setErrorMsg(err.message || String(err)); addLog(`Conn Error: ${err}`); });
  };

  const reset = () => {
    setFile(null);
    setChunks([]);
    setIsPlaying(false);
    setConn(null);
    setTransferProgress(0);
    isProcessingScan.current = false;
  };

  return (
    <div className="glass-panel">
      <div className="header">
        <h2>Send File</h2>
        <p>Choose your transfer mode</p>
      </div>

      <div className="mode-toggle">
        <button 
          className={mode === 'fast' ? 'active' : ''} 
          onClick={() => { setMode('fast'); reset(); }}
        >
          <Zap size={16} style={{marginRight: 4}}/> Fast Mode (WebRTC)
        </button>
        <button 
          className={mode === 'optical' ? 'active' : ''} 
          onClick={() => { setMode('optical'); reset(); }}
        >
          <Eye size={16} style={{marginRight: 4}}/> Optical Mode
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8', margin: '0.5rem 0 1.5rem 0', padding: '0 1rem', lineHeight: '1.4' }}>
        {mode === 'fast' 
          ? "💡 Transfers files instantly. Requires both devices to be connected to the exact same Wi-Fi network." 
          : "💡 Transfers files visually by blinking QR codes. Works 100% offline with zero network connection, but is only suitable for very small files."}
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

      {file && mode === 'fast' && !conn && (
        <div style={{ marginTop: '1rem' }}>
          <div className="mode-toggle" style={{ marginBottom: '1rem' }}>
            <button 
              className={pairingMode === 'show' ? 'active' : ''} 
              onClick={() => { setPairingMode('show'); isProcessingScan.current = false; }}
            >
              <QrCode size={16} style={{marginRight: 4}}/> Show QR
            </button>
            <button 
              className={pairingMode === 'scan' ? 'active' : ''} 
              onClick={() => { setPairingMode('scan'); isProcessingScan.current = false; }}
            >
              <Camera size={16} style={{marginRight: 4}}/> Scan QR
            </button>
            <button 
              className={pairingMode === 'code' ? 'active' : ''} 
              onClick={() => { setPairingMode('code'); isProcessingScan.current = false; }}
            >
              <Keyboard size={16} style={{marginRight: 4}}/> Use Code
            </button>
          </div>
          
          {pairingMode === 'show' && (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
               <div className="badge badge-fast">WebRTC Transfer</div>
               <p style={{ textAlign: 'center', fontSize: '0.9rem' }}>Scan this QR with the receiver device to pair instantly.</p>
               {peerId ? (
                 <div className="qr-container">
                   <QRCodeSVG value={`WEBRTC|${peerId}`} size={200} level="M" />
                 </div>
               ) : (
                 <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <p className="pulse">Generating QR Code...</p>
                 </div>
               )}
               <p className="pulse" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Waiting for connection...</p>
             </div>
          )}

          {pairingMode === 'scan' && (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
               <div className="badge badge-fast">WebRTC Transfer</div>
               <p style={{ textAlign: 'center', fontSize: '0.9rem' }}>Scan the receiver's QR code to send the file.</p>
               <div className="camera-container" style={{ width: '100%' }}>
                 <div id="sender-reader"></div>
               </div>
             </div>
          )}

          {pairingMode === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', width: '100%' }}>
              <div className="mode-toggle" style={{ marginBottom: '1rem', width: '100%' }}>
                <button 
                  className={codeMode === 'generate' ? 'active' : ''} 
                  onClick={() => setCodeMode('generate')}
                  style={{ flex: 1 }}
                >
                  Generate Code
                </button>
                <button 
                  className={codeMode === 'enter' ? 'active' : ''} 
                  onClick={() => setCodeMode('enter')}
                  style={{ flex: 1 }}
                >
                  Enter Code
                </button>
              </div>

              {codeMode === 'generate' && (
                 <div style={{ textAlign: 'center', width: '100%' }}>
                   <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Enter this 6-character code on the receiver device.</p>
                   {peerId ? (
                     <div style={{ background: 'rgba(255,255,255,0.1)', padding: '2rem', borderRadius: '12px', fontSize: '3rem', letterSpacing: '0.5rem', fontWeight: 'bold' }}>
                       {peerId}
                     </div>
                   ) : (
                     <p className="pulse">Generating code...</p>
                   )}
                   <p className="pulse" style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '1rem' }}>Waiting for connection...</p>
                 </div>
              )}

              {codeMode === 'enter' && (
                 <div style={{ textAlign: 'center', width: '100%' }}>
                   <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Type the 6-character code shown on the receiver device.</p>
                   <input 
                     type="text" 
                     maxLength={6}
                     value={enteredCode}
                     onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
                     style={{ 
                       width: '100%', 
                       padding: '1rem', 
                       fontSize: '2rem', 
                       textAlign: 'center', 
                       letterSpacing: '0.5rem', 
                       borderRadius: '8px', 
                       border: '2px solid rgba(255,255,255,0.2)', 
                       background: 'rgba(0,0,0,0.2)', 
                       color: 'white', 
                       textTransform: 'uppercase' 
                     }} 
                     placeholder="------"
                   />
                   <button 
                     className="btn btn-primary" 
                     style={{ marginTop: '1rem', width: '100%' }}
                     disabled={enteredCode.length !== 6 || !peerId}
                     onClick={() => initiateFastTransfer(enteredCode)}
                   >
                     Connect
                   </button>
                 </div>
              )}
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--error-color)', background: 'rgba(255,0,0,0.1)', borderRadius: '8px', marginTop: '1rem' }}>
          <p><strong>Error:</strong> {errorMsg}</p>
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
