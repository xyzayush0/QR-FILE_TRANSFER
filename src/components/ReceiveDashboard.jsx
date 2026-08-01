import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeSVG } from 'qrcode.react';
import { Download, CheckCircle, Camera, QrCode } from 'lucide-react';
import { reassembleFile } from '../utils/optical';
import { initPeer, connectToPeer } from '../utils/webrtc';

export const ReceiveDashboard = ({ onBack }) => {
  const [scannerInstance, setScannerInstance] = useState(null);
  const [scannedChunks, setScannedChunks] = useState(new Map());
  const [totalChunks, setTotalChunks] = useState(0);
  const [completedFile, setCompletedFile] = useState(null);
  
  const [isFastMode, setIsFastMode] = useState(false);
  const [peer, setPeer] = useState(null);
  const [conn, setConn] = useState(null);
  const [fastTransferProgress, setFastTransferProgress] = useState(0);
  const [receivingFileData, setReceivingFileData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [logs, setLogs] = useState([]);
  
  // New Pairing Mode: 'scan' or 'show'
  const [pairingMode, setPairingMode] = useState('scan');
  const pairingModeRef = useRef('scan');

  const addLog = (msg) => { console.log(msg); setLogs(prev => [...prev.slice(-4), msg]); };
  const isProcessingScan = useRef(false);
  const peerRef = useRef(null);
  const chunksRef = useRef({});
  const expectedChunksRef = useRef(0);
  const [isPeerReady, setIsPeerReady] = useState(false);

  const setupDataListener = (c) => {
    let headerData = null;
    c.on('data', (data) => {
      if (data.type === 'header') {
        addLog(`Received header: ${data.name} (${data.totalChunks} chunks)`);
        headerData = { name: data.name, type: data.fileType, totalChunks: data.totalChunks };
        setReceivingFileData(headerData);
        chunksRef.current = {};
        expectedChunksRef.current = data.totalChunks;
      } else if (data.type === 'chunk') {
        chunksRef.current[data.index] = data.buffer;
        const receivedCount = Object.keys(chunksRef.current).length;
        setFastTransferProgress(Math.round((receivedCount / expectedChunksRef.current) * 100));
        
        if (receivedCount === expectedChunksRef.current) {
           addLog('All chunks received, reconstructing file...');
           const orderedChunks = [];
           for(let i=0; i<expectedChunksRef.current; i++) {
             orderedChunks.push(chunksRef.current[i]);
           }
           const blob = new Blob(orderedChunks, { type: headerData?.type || 'application/octet-stream' });
           setCompletedFile({ blob, fileName: headerData?.name || 'download' });
           chunksRef.current = {};
        }
      }
    });
    c.on('error', (err) => { setErrorMsg(err.message || String(err)); addLog(`Conn Error: ${err.message || err}`); });
  };

  useEffect(() => {
    pairingModeRef.current = pairingMode;
  }, [pairingMode]);

  useEffect(() => {
    setErrorMsg('');
    addLog('Initializing PeerJS...');
    const p = initPeer(
       () => { setIsPeerReady(true); addLog('PeerJS Open.'); }, 
       (err) => { setErrorMsg(err); addLog(`PeerJS Error: ${err}`); }
    );
    setPeer(p);
    peerRef.current = p;

    p.on('connection', (c) => {
      if (pairingModeRef.current === 'show') {
         addLog('Incoming connection received.');
         setIsFastMode(true);
         setConn(c);
         setupDataListener(c);
      }
    });

    return () => { p.destroy(); peerRef.current = null; };
  }, []);

  useEffect(() => {
    let html5Qrcode;
    if (!completedFile && !isFastMode && pairingMode === 'scan') {
      html5Qrcode = new Html5Qrcode("reader");
      setScannerInstance(html5Qrcode);
      
      const config = { fps: 15, qrbox: { width: 250, height: 250 } };
      
      html5Qrcode.start({ facingMode: "environment" }, config, (decodedText) => {
        handleScan(decodedText);
      }).catch(err => {
        console.error("Camera start failed", err);
      });
    }

    return () => {
      if (html5Qrcode && html5Qrcode.isScanning) {
        html5Qrcode.stop().catch(console.error);
      }
    };
  }, [completedFile, isFastMode, pairingMode]);

  const handleScan = (text) => {
    if (isProcessingScan.current) return;
    
    if (text.startsWith("WEBRTC|")) {
      isProcessingScan.current = true;
      const remoteId = text.split("|")[1];
      initiateFastTransfer(remoteId);
      return;
    }

    if (text.startsWith("QR|")) {
      const parts = text.split("|");
      const tChunks = parseInt(parts[2], 10);
      const index = parseInt(parts[3], 10);
      
      if (totalChunks === 0) setTotalChunks(tChunks);
      
      setScannedChunks(prev => {
        if (prev.has(index)) return prev;
        const next = new Map(prev);
        next.set(index, text);
        
        if (next.size === tChunks) {
          if (scannerInstance) scannerInstance.stop();
          const fileResult = reassembleFile(next);
          if (fileResult) {
            setCompletedFile(fileResult);
          }
        }
        return next;
      });
    }
  };

  const initiateFastTransfer = (remoteId) => {
    if (scannerInstance) {
      scannerInstance.stop().catch(console.error);
    }
    setIsFastMode(true);
    
    const doConnect = () => {
      addLog(`Attempting to connect to ${remoteId}...`);
      let isConnected = false;
      const connection = connectToPeer(peerRef.current, remoteId, (c) => {
        addLog('DataChannel Open!');
        isConnected = true;
        setConn(c);
        setupDataListener(c);
      });
      connection.on('error', (err) => { setErrorMsg(err.message || String(err)); addLog(`Conn Error: ${err.message || err}`); });
      
      setTimeout(() => {
        if (!isConnected) {
          setErrorMsg("Connection timed out. If you are using Brave or an Adblocker, it may be blocking WebRTC. Try turning off Shields or using Chrome/Safari.");
          addLog("Connection timeout");
          isProcessingScan.current = false;
        }
      }, 10000);
    };

    const activePeer = peerRef.current;
    if (activePeer) {
      if (!activePeer.id) {
         addLog('Waiting for peer to be ready...');
         activePeer.on('open', doConnect);
      } else {
         doConnect();
      }
    } else {
      addLog('Error: Peer instance is null!');
    }
  };

  const handleDownload = () => {
    if (completedFile) {
      const url = URL.createObjectURL(completedFile.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = completedFile.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="glass-panel">
      <div className="header">
        <h2>Receive File</h2>
        <p>{isFastMode ? 'WebRTC Fast Transfer Active' : 'Waiting for Sender'}</p>
      </div>

      {!completedFile && !isFastMode && (
        <div className="mode-toggle" style={{ marginBottom: '1rem' }}>
          <button 
            className={pairingMode === 'scan' ? 'active' : ''} 
            onClick={() => setPairingMode('scan')}
          >
            <Camera size={16} style={{marginRight: 4}}/> Scan QR
          </button>
          <button 
            className={pairingMode === 'show' ? 'active' : ''} 
            onClick={() => setPairingMode('show')}
          >
            <QrCode size={16} style={{marginRight: 4}}/> Show QR
          </button>
        </div>
      )}

      {!completedFile && !isFastMode && pairingMode === 'scan' && (
        <>
          <div className="camera-container">
            <div id="reader"></div>
          </div>
          
          {totalChunks > 0 && (
            <div style={{ marginTop: '1rem', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                <span>Optical Assembly</span>
                <span>{scannedChunks.size} / {totalChunks} chunks</span>
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${(scannedChunks.size / totalChunks) * 100}%` }}></div>
              </div>
            </div>
          )}
        </>
      )}

      {!completedFile && !isFastMode && pairingMode === 'show' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          <p style={{ textAlign: 'center', fontSize: '0.9rem' }}>Scan this QR with the sender device to pair instantly.</p>
          {isPeerReady ? (
            <div className="qr-container">
              <QRCodeSVG value={`WEBRTC|${peerRef.current?.id}`} size={200} level="M" />
            </div>
          ) : (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p className="pulse">Generating QR Code...</p>
            </div>
          )}
          <p className="pulse" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Waiting for connection...</p>
        </div>
      )}

      {isFastMode && !conn && !completedFile && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="pulse">Connecting to sender...</p>
        </div>
      )}

      {isFastMode && conn && !completedFile && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="badge badge-fast" style={{ marginBottom: '1rem' }}>WebRTC Connected</div>
          <p className="pulse">Receiving file data...</p>
          <div className="progress-bar-container" style={{ marginTop: '1rem' }}>
             <div className="progress-bar" style={{ width: `${fastTransferProgress}%` }}></div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--error-color)', background: 'rgba(255,0,0,0.1)', borderRadius: '8px', marginTop: '1rem' }}>
          <p><strong>Connection Error:</strong> {errorMsg}</p>
        </div>
      )}

      {completedFile && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <CheckCircle size={64} color="var(--success-color)" style={{ margin: '0 auto 1rem' }} />
          <h3>Transfer Complete!</h3>
          <p style={{ margin: '1rem 0' }}>{completedFile.fileName}</p>
          <button className="btn btn-primary" onClick={handleDownload}>
            <Download size={18} /> Download File
          </button>
        </div>
      )}

      <button className="btn" onClick={() => { isProcessingScan.current = false; onBack(); }} style={{ marginTop: '1rem' }}>Back</button>

      {logs.length > 0 && (
        <div style={{ marginTop: '2rem', padding: '1rem', background: '#000', color: '#0f0', fontFamily: 'monospace', fontSize: '12px', borderRadius: '8px', textAlign: 'left' }}>
          <strong>Debug Logs:</strong><br/>
          {logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
};
