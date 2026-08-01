import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CheckCircle, Download, Camera } from 'lucide-react';
import { reassembleFile } from '../utils/chunking';
import { connectToPeer, initPeer } from '../utils/webrtc';

export const ReceiveDashboard = ({ onBack }) => {
  const [scannerInstance, setScannerInstance] = useState(null);
  const [scannedChunks, setScannedChunks] = useState(new Map());
  const [totalChunks, setTotalChunks] = useState(0);
  const [completedFile, setCompletedFile] = useState(null);
  
  // Fast Mode state
  const [isFastMode, setIsFastMode] = useState(false);
  const [peer, setPeer] = useState(null);
  const [conn, setConn] = useState(null);
  const [fastTransferProgress, setFastTransferProgress] = useState(0);
  const [receivingFileData, setReceivingFileData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const isProcessingScan = useRef(false);
  const [isPeerReady, setIsPeerReady] = useState(false);

  useEffect(() => {
    // Initialize WebRTC Peer for receiving
    setErrorMsg('');
    const p = initPeer(() => setIsPeerReady(true), (err) => setErrorMsg(err));
    setPeer(p);
    return () => p.destroy();
  }, []);

  useEffect(() => {
    let html5Qrcode;
    if (!completedFile && !isFastMode) {
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
  }, [completedFile, isFastMode]);

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
      let isConnected = false;
      const connection = connectToPeer(peer, remoteId, (c) => {
        isConnected = true;
        setConn(c);
        let headerData = null;
        c.on('data', (data) => {
          if (data.type === 'header') {
            headerData = { name: data.name, type: data.fileType };
            setReceivingFileData(headerData);
          } else if (data.type === 'file') {
            setFastTransferProgress(100);
            const blob = new Blob([data.buffer], { type: headerData?.type || 'application/octet-stream' });
            setCompletedFile({ blob, fileName: headerData?.name || 'download' });
          }
        });
      });
      connection.on('error', (err) => setErrorMsg(err.message || String(err)));
      
      setTimeout(() => {
        if (!isConnected) {
          setErrorMsg("Connection timed out. If you are using Brave or an Adblocker, it may be blocking WebRTC. Try turning off Shields or using Chrome/Safari.");
          isProcessingScan.current = false;
        }
      }, 10000);
    };

    if (peer) {
      if (!peer.id) {
         peer.on('open', doConnect);
      } else {
         doConnect();
      }
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
        <p>{isFastMode ? 'WebRTC Fast Transfer Active' : 'Scan the QR Stream'}</p>
      </div>

      {!completedFile && !isFastMode && (
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
    </div>
  );
};
