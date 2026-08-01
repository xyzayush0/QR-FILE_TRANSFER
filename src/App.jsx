import React, { useState } from 'react';
import { SendDashboard } from './components/SendDashboard';
import { ReceiveDashboard } from './components/ReceiveDashboard';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';

function App() {
  const [mode, setMode] = useState(null); // 'send' or 'receive'

  return (
    <div className="app-container">
      {!mode ? (
        <div className="glass-panel" style={{ textAlign: 'center' }}>
          <div className="header">
            <h1>QRStream</h1>
            <p>Transfer files using only your screen and camera.</p>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
            <button 
              className="btn btn-primary" 
              onClick={() => setMode('send')}
              style={{ flex: 1, padding: '1.5rem', flexDirection: 'column', gap: '1rem' }}
            >
              <ArrowUpRight size={32} />
              <span style={{ fontSize: '1.2rem' }}>Send File</span>
            </button>
            
            <button 
              className="btn" 
              onClick={() => setMode('receive')}
              style={{ flex: 1, padding: '1.5rem', flexDirection: 'column', gap: '1rem' }}
            >
              <ArrowDownLeft size={32} />
              <span style={{ fontSize: '1.2rem' }}>Receive File</span>
            </button>
          </div>
          
          <div className="stats-grid" style={{ marginTop: '3rem' }}>
             <div className="stat-item">
               <span className="stat-label">Privacy</span>
               <span className="stat-value">End-to-End</span>
             </div>
             <div className="stat-item">
               <span className="stat-label">Storage</span>
               <span className="stat-value">Zero</span>
             </div>
          </div>
        </div>
      ) : mode === 'send' ? (
        <SendDashboard onBack={() => setMode(null)} />
      ) : (
        <ReceiveDashboard onBack={() => setMode(null)} />
      )}
    </div>
  );
}

export default App;
