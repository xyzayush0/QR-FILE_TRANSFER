import Peer from 'peerjs';

export const initPeer = (customId, onOpen, onError) => {
  const config = {
    config: {
      'iceServers': [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    },
    debug: 2
  };

  const peer = customId ? new Peer(customId, config) : new Peer(config);
  
  peer.on('open', (id) => {
    onOpen(id);
  });

  peer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    if (onError) onError(err.type || err.message || String(err));
  });
  
  return peer;
};

export const connectToPeer = (peer, remoteId, onConnection) => {
  const conn = peer.connect(remoteId, {
    reliable: true
  });
  
  conn.on('open', () => {
    onConnection(conn);
  });
  
  return conn;
};
