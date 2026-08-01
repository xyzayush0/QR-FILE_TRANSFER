# QRStream - Optical File Transfer

QRStream is a modern, offline-capable Progressive Web App (PWA) that allows you to seamlessly transfer files between devices without requiring an internet connection or a shared Wi-Fi network. It utilizes WebRTC for direct peer-to-peer data transfer, which you can easily initiate by scanning a QR code or entering a connection ID.

## 🚀 Features

- **Peer-to-Peer Transfer:** Uses WebRTC to send files directly from device to device. No servers store your files.
- **Offline First:** Fully functional without the internet once installed. Acts as a Progressive Web App (PWA) so you can "Add to Home Screen".
- **Optical Connection:** Start transfers instantly by scanning a QR code with the receiver's device camera.
- **Large File Support:** Automatically chunks large files for reliable, high-speed transfer.
- **Cross-Platform:** Works on any modern browser (iOS, Android, Windows, Mac, Linux).
- **Secure:** Files never leave your local network or the direct device-to-device connection.

## 🔗 Live Demo

Access the live app hosted on GitHub Pages:
**[https://xyzayush0.github.io/QR-FILE_TRANSFER/](https://xyzayush0.github.io/QR-FILE_TRANSFER/)**

## 📱 How to Use Offline (PWA)

1. Open the [live demo](https://xyzayush0.github.io/QR-FILE_TRANSFER/) on your phone or desktop.
2. When prompted, select **"Install App"** or **"Add to Home Screen"**.
3. Launch the app from your home screen.
4. You can now use it to transfer files even when you have no internet access!

## 🛠️ Tech Stack

- **React 19**
- **Vite**
- **Tailwind CSS** / **Lucide React** (for modern, dynamic UI)
- **PeerJS** (WebRTC abstraction)
- **html5-qrcode** (QR code scanning)
- **vite-plugin-pwa** (Service Workers and Offline Support)

## 💻 Development

### Prerequisites
- Node.js (v16 or higher)

### Setup
```bash
git clone https://github.com/xyzayush0/QR-FILE_TRANSFER.git
cd QR-FILE_TRANSFER
npm install
npm run dev
```

### Build & Deploy
To build for production:
```bash
npm run build
```

To deploy to GitHub Pages:
```bash
npm run deploy
```
