import { useRef, useState, useEffect, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/**
 * Manages WebRTC peer connections for voice streaming.
 * - Singer: captures mic, sends audio to all peers via RTCPeerConnection.
 * - Listener: receives audio tracks and plays them in hidden <audio> elements.
 */
export function useWebRTC({ socketRef, users, singerVolume = 1 }) {
  const pcRef        = useRef({});       // { [socketId]: RTCPeerConnection }
  const localStream  = useRef(null);
  const mutedRef     = useRef({});
  const [isSinging, setIsSinging] = useState(false);

  // Keep singer volume in sync with all active audio elements
  useEffect(() => {
    Object.keys(pcRef.current).forEach((id) => {
      const el = document.getElementById(`rk-audio-${id}`);
      if (el) el.volume = singerVolume;
    });
  }, [singerVolume]);

  // Register WebRTC signaling handlers when socket is available
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleOffer = async ({ from, offer }) => {
      const pc = getOrCreatePC(from, socket);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { target: from, answer });
    };

    const handleAnswer = async ({ from, answer }) => {
      await pcRef.current[from]?.setRemoteDescription(new RTCSessionDescription(answer));
    };

    const handleCandidate = async ({ from, candidate }) => {
      try {
        await pcRef.current[from]?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    };

    const handleCleanup = ({ socketId }) => teardownPeer(socketId);

    socket.on('webrtc-offer',             handleOffer);
    socket.on('webrtc-answer',            handleAnswer);
    socket.on('webrtc-ice-candidate',     handleCandidate);
    socket.on('user-left-webrtc-cleanup', handleCleanup);

    return () => {
      socket.off('webrtc-offer',             handleOffer);
      socket.off('webrtc-answer',            handleAnswer);
      socket.off('webrtc-ice-candidate',     handleCandidate);
      socket.off('user-left-webrtc-cleanup', handleCleanup);
    };
  // Re-register when socket becomes available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketRef.current]);

  function getOrCreatePC(targetId, socket) {
    if (pcRef.current[targetId]) return pcRef.current[targetId];

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current[targetId] = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit('webrtc-ice-candidate', { target: targetId, candidate: e.candidate });
    };

    pc.ontrack = (event) => {
      let el = document.getElementById(`rk-audio-${targetId}`);
      if (!el) {
        el = document.createElement('audio');
        el.id = `rk-audio-${targetId}`;
        el.autoplay = true;
        el.style.display = 'none';
        document.body.appendChild(el);
      }
      el.srcObject = event.streams[0];
      el.volume = singerVolume;
      el.muted = mutedRef.current[targetId] ?? false;
    };

    // Add local tracks if we are currently singing
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => pc.addTrack(t, localStream.current));
    }

    return pc;
  }

  function teardownPeer(socketId) {
    pcRef.current[socketId]?.close();
    delete pcRef.current[socketId];
    const el = document.getElementById(`rk-audio-${socketId}`);
    el?.remove();
  }

  const startSinging = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) throw new Error('Not connected');

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStream.current = stream;
    setIsSinging(true);

    // Create offers to all current peers
    const myId = socket.id;
    for (const user of users) {
      if (user.id === myId) continue;
      const pc = getOrCreatePC(user.id, socket);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', { target: user.id, offer });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, socketRef]);

  const stopSinging = useCallback(() => {
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    Object.keys(pcRef.current).forEach(teardownPeer);
    setIsSinging(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMuteSinger = useCallback((socketId) => {
    const el = document.getElementById(`rk-audio-${socketId}`);
    if (!el) return;
    el.muted = !el.muted;
    mutedRef.current[socketId] = el.muted;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopSinging(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isSinging, startSinging, stopSinging, toggleMuteSinger };
}
