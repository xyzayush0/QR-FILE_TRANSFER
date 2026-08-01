import Peer from 'peerjs';

export const initPeer = (onOpen) => {
  const peer = new Peer();
  
  peer.on('open', (id) => {
    onOpen(id);
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
