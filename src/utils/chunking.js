import * as fflate from 'fflate';

export const CHUNK_SIZE = 250; 

export const prepareChunks = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  const compressed = fflate.compressSync(uint8Array, { level: 6 });
  
  const CHUNK = 8192;
  let binaryString = '';
  for (let i = 0; i < compressed.length; i += CHUNK) {
    binaryString += String.fromCharCode.apply(null, compressed.subarray(i, i + CHUNK));
  }
  const base64Data = btoa(binaryString);
  
  const fileId = Math.random().toString(36).substring(2, 8);
  const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
  
  const chunks = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkData = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    if (i === 0) {
      chunks.push(`QR|${fileId}|${totalChunks}|${i}|${file.name}|${file.type}|${chunkData}`);
    } else {
      chunks.push(`QR|${fileId}|${totalChunks}|${i}|||${chunkData}`);
    }
  }
  return { fileId, chunks, totalChunks };
};

export const reassembleFile = (chunksMap) => {
  const sortedIndices = Array.from(chunksMap.keys()).sort((a, b) => a - b);
  let base64Data = '';
  let fileName = 'downloaded_file';
  let fileType = 'application/octet-stream';
  
  for (const idx of sortedIndices) {
    const chunk = chunksMap.get(idx);
    const parts = chunk.split('|');
    if (idx === 0) {
      fileName = parts[4];
      fileType = parts[5];
    }
    base64Data += parts[6];
  }
  
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
  }
  
  try {
    const decompressed = fflate.decompressSync(bytes);
    const blob = new Blob([decompressed], { type: fileType });
    return { blob, fileName };
  } catch (e) {
    console.error("Decompression failed", e);
    return null;
  }
};
