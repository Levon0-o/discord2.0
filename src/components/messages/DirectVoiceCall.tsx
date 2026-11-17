import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Maximize2, Minimize2, Mic, MicOff, MonitorUp, Phone, PhoneCall, PhoneIncoming, PhoneOff, Volume2, VolumeX, X, Settings2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface DirectVoiceCallProps {
  conversationId: string;
  currentUserId: string;
  otherUserId: string;
  otherName: string;
}

type CallSignal = {
  call_id: string;
  from: string;
  to: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
};

type CallStatus = 'idle' | 'outgoing' | 'connecting' | 'connected' | 'reconnecting';

export function DirectVoiceCall({ conversationId, currentUserId, otherUserId, otherName }: DirectVoiceCallProps) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [incomingCall, setIncomingCall] = useState<CallSignal | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [channelReady, setChannelReady] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const [localPreviewStream, setLocalPreviewStream] = useState<MediaStream | null>(null);
  const [remoteAudioMuted, setRemoteAudioMuted] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState('');
  const [callMinimized, setCallMinimized] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingCallRef = useRef<CallSignal | null>(null);
  const handledInviteCallIdRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef('');
  const statusRef = useRef<CallStatus>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const screenAudioSenderRef = useRef<RTCRtpSender | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const callTimeoutRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isCallerRef = useRef(false);

  const refreshAudioDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');
      const outputs = devices.filter((device) => device.kind === 'audiooutput');
      setAudioInputs(inputs);
      setAudioOutputs(outputs);
      setSelectedInputId((current) => current || inputs[0]?.deviceId || '');
      setSelectedOutputId((current) => current || outputs.find((device) => device.deviceId === 'default')?.deviceId || outputs[0]?.deviceId || '');
    } catch {
      // Device enumeration is optional; the browser may restrict it.
    }
  };

  useEffect(() => {
    void refreshAudioDevices();
    const handleDeviceChange = () => { void refreshAudioDevices(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
  }, []);

  useEffect(() => {
    const audio = audioRef.current as (HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> }) | null;
    if (audio && selectedOutputId && audio.setSinkId) {
      void audio.setSinkId(selectedOutputId).catch(() => setError('Could not switch the audio output device in this browser.'));
    }
  }, [selectedOutputId, remoteVideoStream, status]);

  function setCallStatus(next: CallStatus) {
    statusRef.current = next;
    setStatus(next);
  }

  function stopMedia() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (callTimeoutRef.current !== null) window.clearTimeout(callTimeoutRef.current);
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    reconnectAttemptsRef.current = 0;
    isCallerRef.current = false;
    timerRef.current = null;
    callTimeoutRef.current = null;
    startedAtRef.current = null;
    incomingCallRef.current = null;
    setIncomingCall(null);
    peerRef.current?.close();
    peerRef.current = null;
    pendingIceRef.current = [];
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    videoSenderRef.current = null;
    screenAudioSenderRef.current = null;
    remoteStreamRef.current = null;
    setLocalPreviewStream(null);
    setRemoteAudioMuted(false);
    setRemoteVideoStream(null);
    setCameraEnabled(false);
    setSharingScreen(false);
    setMicrophoneReady(false);
    if (audioRef.current) audioRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setAudioPlaybackBlocked(false);
    setMuted(false);
    setElapsed(0);
    setCallMinimized(false);
    setCallStatus('idle');
    callIdRef.current = '';
  }

  async function send(event: string, payload: CallSignal) {
    const channel = channelRef.current;
    if (!channel) throw new Error('Voice signaling is not connected.');
    const result = await channel.send({ type: 'broadcast', event, payload });
    if (result !== 'ok') throw new Error('Could not send the call signal.');
  }

  function startConnectionTimeout(callId: string) {
    if (callTimeoutRef.current !== null) window.clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = window.setTimeout(() => {
      if (callIdRef.current !== callId || statusRef.current !== 'connecting') return;
      setError('The call could not connect. Check the network and try again.');
      void send('hangup', { call_id: callId, from: currentUserId, to: otherUserId }).catch(() => undefined);
      stopMedia();
      setError('The call could not connect. Check the network and try again.');
    }, 25000);
  }

  async function getMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      throw new Error('Your browser does not support voice calls.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(selectedInputId ? { deviceId: { exact: selectedInputId } } : {}),
        },
        video: false,
      });
      await refreshAudioDevices();
      return stream;
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        throw new Error('Microphone access was blocked. Allow microphone access in your browser settings.');
      }
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        throw new Error('No microphone was found on this device.');
      }
      if (err instanceof DOMException && err.name === 'NotReadableError') {
        throw new Error('The microphone is already being used by another app.');
      }
      throw err;
    }
  }

  function createPeer(callId: string, remoteUserId: string) {
    if (peerRef.current) return peerRef.current;
    const stream = streamRef.current;
    if (!stream) throw new Error('Microphone is not ready.');
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    peerRef.current = peer;
    stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
    videoSenderRef.current = peer.addTransceiver('video', { direction: 'sendrecv' }).sender;
    screenAudioSenderRef.current = peer.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void send('ice', {
          call_id: callId,
          from: currentUserId,
          to: remoteUserId,
          candidate: event.candidate.toJSON(),
        }).catch((err) => setError(err instanceof Error ? err.message : 'Could not send network information.'));
      }
    };
    peer.ontrack = (event) => {
      const remoteStream = remoteStreamRef.current ?? new MediaStream();
      const incomingTracks = event.streams[0]?.getTracks() ?? [event.track];
      for (const track of incomingTracks) {
        if (!remoteStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) remoteStream.addTrack(track);
      }
      remoteStreamRef.current = remoteStream;
      if (audioRef.current) {
        audioRef.current.srcObject = remoteStream;
        audioRef.current.volume = 1;
        void audioRef.current.play().then(() => setAudioPlaybackBlocked(false)).catch(() => {
          setAudioPlaybackBlocked(true);
          setError('Your browser blocked incoming audio. Use Enable audio below.');
        });
      }
      if (event.track.kind === 'video') {
        setRemoteVideoStream(remoteStream);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      }
    };
    const scheduleIceRestart = (delay: number) => {
      if (!isCallerRef.current || callIdRef.current !== callId || peerRef.current !== peer) return;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(async () => {
        reconnectTimerRef.current = null;
        if (callIdRef.current !== callId || peerRef.current !== peer || peer.connectionState === 'connected' || peer.connectionState === 'closed') return;
        if (reconnectAttemptsRef.current >= 3) {
          setError('The network connection could not be restored. End the call and try again.');
          void send('hangup', { call_id: callId, from: currentUserId, to: remoteUserId }).catch(() => undefined);
          stopMedia();
          setError('The network connection could not be restored. End the call and try again.');
          return;
        }
        reconnectAttemptsRef.current += 1;
        try {
          if (peer.signalingState !== 'stable') {
            await peer.setLocalDescription({ type: 'rollback' });
          }
          const offer = await peer.createOffer({ iceRestart: true });
          await peer.setLocalDescription(offer);
          await send('offer', {
            call_id: callId,
            from: currentUserId,
            to: remoteUserId,
            sdp: peer.localDescription ?? offer,
          });
          // If the attempt does not recover, connectionstatechange schedules the next retry.
        } catch {
          scheduleIceRestart(Math.min(2000 * reconnectAttemptsRef.current, 6000));
        }
      }, delay);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
        reconnectAttemptsRef.current = 0;
        if (callTimeoutRef.current !== null) window.clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        setCallStatus('connected');
        if (startedAtRef.current === null) {
          startedAtRef.current = Date.now();
          timerRef.current = window.setInterval(() => {
            if (startedAtRef.current !== null) setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
          }, 1000);
        }
      } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        setCallStatus('reconnecting');
        scheduleIceRestart(peer.connectionState === 'failed' ? 0 : 5000);
      } else if (peer.connectionState === 'closed') {
        if (callIdRef.current === callId) stopMedia();
      }
    };
    return peer;
  }

  useEffect(() => {
    let active = true;
    const channel = supabase.channel('dm-voice:' + conversationId, {
      config: { private: true, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'invite' }, ({ payload }) => {
        const signal = payload as CallSignal;
        if (!active || signal.to !== currentUserId || signal.from !== otherUserId) return;
        if (!signal.call_id) return;
        // Ignore duplicate delivery even after the user accepted the invitation.
        if (handledInviteCallIdRef.current === signal.call_id) return;
        if (incomingCallRef.current?.call_id === signal.call_id) return;
        if (incomingCallRef.current) {
          void send('busy', { ...signal, from: currentUserId, to: signal.from });
          return;
        }

        // Resource state is authoritative. A stale React status without an
        // active microphone/peer must not make this user appear busy forever.
        const hasLiveMicrophone = Boolean(
          streamRef.current?.getAudioTracks().some((track) => track.readyState === 'live')
        );
        const hasLivePeer = Boolean(
          peerRef.current && peerRef.current.connectionState !== 'closed'
        );
        if (hasLiveMicrophone || hasLivePeer) {
          void send('busy', { ...signal, from: currentUserId, to: signal.from });
          return;
        }
        if (statusRef.current !== 'idle') stopMedia();

        setError('');
        setIncomingCall(null);
        callIdRef.current = signal.call_id;
        handledInviteCallIdRef.current = signal.call_id;
        incomingCallRef.current = signal;
        setIncomingCall(signal);
        callTimeoutRef.current = window.setTimeout(() => {
          if (incomingCallRef.current?.call_id !== signal.call_id) return;
          stopMedia();
          setError('Missed call. The invitation expired.');
        }, 30000);
      })
      .on('broadcast', { event: 'accept' }, async ({ payload }) => {
        const signal = payload as CallSignal;
        if (!active || signal.to !== currentUserId || signal.call_id !== callIdRef.current) return;
        try {
          if (callTimeoutRef.current !== null) window.clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          setCallStatus('connecting');
          startConnectionTimeout(signal.call_id);
          isCallerRef.current = true;
          const peer = createPeer(signal.call_id, signal.from);
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await send('offer', {
            call_id: signal.call_id,
            from: currentUserId,
            to: signal.from,
            sdp: peer.localDescription ?? offer,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not start the call.');
          stopMedia();
        }
      })
      .on('broadcast', { event: 'reject' }, ({ payload }) => {
        const signal = payload as CallSignal;
        if (signal.to === currentUserId && signal.call_id === callIdRef.current) {
          setError('The call was declined.');
          stopMedia();
        }
      })
      .on('broadcast', { event: 'busy' }, ({ payload }) => {
        const signal = payload as CallSignal;
        if (signal.to === currentUserId && signal.call_id === callIdRef.current) {
          setError('This person is already in another call.');
          stopMedia();
        }
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        const signal = payload as CallSignal;
        if (!active || signal.to !== currentUserId || signal.call_id !== callIdRef.current || !signal.sdp) return;
        try {
          setCallStatus('connecting');
          const peer = createPeer(signal.call_id, signal.from);
          await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          for (const candidate of pendingIceRef.current) await peer.addIceCandidate(new RTCIceCandidate(candidate));
          pendingIceRef.current = [];
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await send('answer', {
            call_id: signal.call_id,
            from: currentUserId,
            to: signal.from,
            sdp: peer.localDescription ?? answer,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not answer the call.');
          stopMedia();
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        const signal = payload as CallSignal;
        if (!active || signal.to !== currentUserId || signal.call_id !== callIdRef.current || !signal.sdp) return;
        try {
          const peer = peerRef.current;
          if (!peer) return;
          await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          for (const candidate of pendingIceRef.current) await peer.addIceCandidate(new RTCIceCandidate(candidate));
          pendingIceRef.current = [];
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not connect the call.');
          stopMedia();
        }
      })
      .on('broadcast', { event: 'ice' }, async ({ payload }) => {
        const signal = payload as CallSignal;
        if (!active || signal.to !== currentUserId || signal.call_id !== callIdRef.current || !signal.candidate) return;
        try {
          const peer = peerRef.current;
          if (peer?.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
          else pendingIceRef.current.push(signal.candidate);
        } catch {
          // Ignore candidates that arrive after a call has already ended.
        }
      })
      .on('broadcast', { event: 'hangup' }, ({ payload }) => {
        const signal = payload as CallSignal;
        if (signal.to === currentUserId && signal.call_id === callIdRef.current) {
          stopMedia();
          incomingCallRef.current = null;
          setIncomingCall(null);
        }
      })
      .subscribe((channelStatus) => {
        if (channelStatus === 'SUBSCRIBED') setChannelReady(true);
        if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT' || channelStatus === 'CLOSED') {
          setChannelReady(false);
        }
        if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setError('Could not connect to voice signaling. Apply the latest DM voice migration in Supabase.');
        }
      });

    return () => {
      active = false;
      stopMedia();
      incomingCallRef.current = null;
      setIncomingCall(null);
      setChannelReady(false);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
    // The channel owns one subscription for the active conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId, otherUserId]);

  async function startCall() {
    if (statusRef.current !== 'idle' || !channelRef.current || !channelReady) return;
    setError('');
    const callId = crypto.randomUUID();
    callIdRef.current = callId;
    setCallStatus('outgoing');
    try {
      const stream = await getMicrophone();
      if (callIdRef.current !== callId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      isCallerRef.current = true;
      setMicrophoneReady(true);
      await send('invite', { call_id: callId, from: currentUserId, to: otherUserId });
      callTimeoutRef.current = window.setTimeout(() => {
        if (callIdRef.current === callId && statusRef.current === 'outgoing') {
          setError('No answer. The call timed out.');
          void send('hangup', { call_id: callId, from: currentUserId, to: otherUserId }).catch(() => undefined);
          stopMedia();
        }
      }, 30000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the call.');
      stopMedia();
    }
  }

  async function acceptCall() {
    const invite = incomingCallRef.current;
    if (!invite) return;
    if (callTimeoutRef.current !== null) window.clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    setError('');
    setCallStatus('connecting');
    try {
      const stream = await getMicrophone();
      if (callIdRef.current !== invite.call_id) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      isCallerRef.current = false;
      setMicrophoneReady(true);
      incomingCallRef.current = null;
      setIncomingCall(null);
      await send('accept', { call_id: invite.call_id, from: currentUserId, to: invite.from });
      startConnectionTimeout(invite.call_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not access the microphone.';
      setError(message);
      try {
        await send('reject', { call_id: invite.call_id, from: currentUserId, to: invite.from, reason: message });
      } catch {
        // The caller's unanswered-call timeout remains the fallback.
      }
      stopMedia();
      setError(message);
    }
  }

  async function rejectCall() {
    const invite = incomingCallRef.current;
    if (callTimeoutRef.current !== null) window.clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    incomingCallRef.current = null;
    setIncomingCall(null);
    callIdRef.current = '';
    if (invite) {
      try {
        await send('reject', { call_id: invite.call_id, from: currentUserId, to: invite.from });
      } catch {
        // The invitation can expire without a rejection signal.
      }
    }
  }

  async function hangUp() {
    const callId = callIdRef.current;
    // Cancel locally before awaiting the network so a pending microphone
    // permission request cannot revive a call after the user hangs up.
    stopMedia();
    if (callId) {
      try {
        await send('hangup', { call_id: callId, from: currentUserId, to: otherUserId });
      } catch {
        // Local cleanup must still happen if the other client disconnected.
      }
    }
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  async function toggleCamera() {
    if (!peerRef.current || !videoSenderRef.current) return;
    if (cameraEnabled) {
      await videoSenderRef.current.replaceTrack(null);
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setLocalPreviewStream(null);
      setCameraEnabled(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No camera was found.');
      await videoSenderRef.current.replaceTrack(track);
      cameraStreamRef.current?.getTracks().forEach((item) => item.stop());
      cameraStreamRef.current = stream;
      setLocalPreviewStream(stream);
      setCameraEnabled(true);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not access the camera.');
    }
  }

  async function toggleScreenShare() {
    if (!peerRef.current || !videoSenderRef.current) return;
    if (sharingScreen) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
      await videoSenderRef.current.replaceTrack(cameraTrack);
      await screenAudioSenderRef.current?.replaceTrack(null);
      setSharingScreen(false);
      if (localVideoRef.current) localVideoRef.current.srcObject = cameraStreamRef.current;
      return;
    }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is not supported by this browser.');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: true });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No screen source was selected.');
      await videoSenderRef.current.replaceTrack(track);
      await screenAudioSenderRef.current?.replaceTrack(stream.getAudioTracks()[0] ?? null);
      screenStreamRef.current = stream;
      setSharingScreen(true);
      setLocalPreviewStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      track.onended = () => { void (async () => {
        const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
        await videoSenderRef.current?.replaceTrack(cameraTrack);
        await screenAudioSenderRef.current?.replaceTrack(null);
        screenStreamRef.current?.getTracks().forEach((item) => item.stop());
        screenStreamRef.current = null;
        setSharingScreen(false);
        setLocalPreviewStream(cameraStreamRef.current);
        if (localVideoRef.current) localVideoRef.current.srcObject = cameraStreamRef.current;
      })(); };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share your screen.');
    }
  }

  const timeLabel = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;

  function toggleRemoteAudio() {
    const next = !remoteAudioMuted;
    if (audioRef.current) audioRef.current.muted = next;
    setRemoteAudioMuted(next);
  }

  function openFullscreen(element: HTMLVideoElement | null) {
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (element.requestFullscreen) void element.requestFullscreen().catch(() => setError('Fullscreen is not available in this browser.'));
  }

  return (
    <>
      <audio ref={audioRef} autoPlay />
      <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
      <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
      <button
        type="button"
        onClick={() => void startCall()}
        disabled={!channelReady || status !== 'idle' || Boolean(incomingCall)}
        aria-label={`Call ${otherName}`}
        title={`Voice call ${otherName}`}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300 transition hover:bg-emerald-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Phone size={17} />
      </button>
      {status === 'idle' && !incomingCall ? (
        <details className="relative inline-block">
          <summary aria-label="Audio device settings" title="Audio device settings" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-ink-300 hover:bg-white/[0.07]">
            <Settings2 size={16} />
          </summary>
          <div className="absolute right-0 top-12 z-[80] w-64 space-y-3 rounded-xl border border-white/10 bg-ink-900 p-3 shadow-2xl">
            <p className="text-xs font-semibold text-ink-100">Audio devices</p>
            <label className="block space-y-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Microphone
              <select value={selectedInputId} onChange={(event) => setSelectedInputId(event.target.value)} disabled={audioInputs.length === 0} className="w-full rounded-lg border border-white/10 bg-ink-950 px-2.5 py-2 text-xs normal-case tracking-normal text-ink-200 disabled:opacity-50">
                {audioInputs.length === 0 ? <option value="">Default microphone</option> : audioInputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Speaker
              <select value={selectedOutputId} onChange={(event) => setSelectedOutputId(event.target.value)} disabled={audioOutputs.length === 0 || !('setSinkId' in HTMLMediaElement.prototype)} className="w-full rounded-lg border border-white/10 bg-ink-950 px-2.5 py-2 text-xs normal-case tracking-normal text-ink-200 disabled:opacity-50">
                {audioOutputs.length === 0 ? <option value="">Browser default</option> : audioOutputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Speaker ${index + 1}`}</option>)}
              </select>
            </label>
          </div>
        </details>
      ) : null}

      {incomingCall && status === 'idle' ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-label="Incoming voice call" className="w-full max-w-sm rounded-2xl border border-emerald-400/20 bg-ink-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><PhoneIncoming size={26} /></div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-emerald-300">Incoming voice call</p>
            <h2 className="mt-2 text-xl font-bold text-ink-50">{otherName}</h2>
            <p className="mt-1 text-sm text-ink-400">is calling you</p>
            <div className="mt-5 grid gap-2 text-left">
              <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Microphone
                <select value={selectedInputId} onChange={(event) => setSelectedInputId(event.target.value)} disabled={microphoneReady || audioInputs.length === 0} className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs normal-case tracking-normal text-ink-200 disabled:opacity-50">
                  {audioInputs.length === 0 ? <option value="">Default microphone</option> : audioInputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Speaker
                <select value={selectedOutputId} onChange={(event) => setSelectedOutputId(event.target.value)} disabled={audioOutputs.length === 0 || !('setSinkId' in HTMLMediaElement.prototype)} className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs normal-case tracking-normal text-ink-200 disabled:opacity-50">
                  {audioOutputs.length === 0 ? <option value="">Browser default</option> : audioOutputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Speaker ${index + 1}`}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={() => void rejectCall()} className="inline-flex items-center gap-2 rounded-xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/25"><PhoneOff size={16} /> Decline</button>
              <button type="button" onClick={() => void acceptCall()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-400"><PhoneCall size={16} /> Accept</button>
            </div>
          </section>
        </div>
      ) : null}

      {status !== 'idle' ? (
        callMinimized ? (
          <div className="fixed bottom-4 right-4 z-[90] flex w-[min(360px,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-primary-400/25 bg-ink-900/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-200"><PhoneCall size={18} /></div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-ink-100">{otherName}</p>
              <p className="text-xs text-ink-400">{status === 'outgoing' ? 'Calling…' : status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Reconnecting…' : timeLabel}</p>
            </div>
            <button type="button" onClick={() => setCallMinimized(false)} aria-label="Expand call window" title="Expand call window" className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-300 hover:bg-white/[0.08]"><Maximize2 size={16} /></button>
            <button type="button" onClick={toggleMute} disabled={!microphoneReady} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} title={muted ? 'Unmute microphone' : 'Mute microphone'} className={`flex h-9 w-9 items-center justify-center rounded-lg ${muted ? 'bg-red-500/15 text-red-300' : 'text-ink-300 hover:bg-white/[0.08]'} disabled:opacity-40`}>{muted ? <MicOff size={16} /> : <Mic size={16} />}</button>
            <button type="button" onClick={() => void hangUp()} aria-label="End call" title="End call" className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-400"><PhoneOff size={16} /></button>
          </div>
        ) : (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6">
            <section role="dialog" aria-modal="true" aria-label="Voice call" className="flex max-h-[min(900px,94vh)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl">
              <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-ink-900/90 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-200"><PhoneCall size={17} /></div>
                  <div className="min-w-0 text-left">
                    <h2 className="truncate text-sm font-bold text-ink-100">{otherName}</h2>
                    <p className="text-xs text-ink-500">{status === 'outgoing' ? 'Calling…' : status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Reconnecting…' : `Connected · ${timeLabel}`}</p>
                  </div>
                  <span className={`ml-1 hidden rounded-full px-2 py-1 text-[10px] font-semibold sm:inline-flex ${status === 'connected' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>{status === 'connected' ? 'LIVE' : status === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING'}</span>
                </div>
                <button type="button" onClick={() => setCallMinimized(true)} aria-label="Minimize call window" title="Minimize" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-white/[0.08] hover:text-ink-100"><Minimize2 size={17} /></button>
              </header>

              <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:p-5">
                <div className="flex min-h-[240px] flex-col justify-center rounded-xl border border-white/[0.06] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-950/50 via-ink-900 to-ink-950 p-3 sm:min-h-[380px] sm:p-5">
                  {remoteVideoStream || localPreviewStream ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {remoteVideoStream ? <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black"><video ref={(element) => { if (element && element.srcObject !== remoteVideoStream) element.srcObject = remoteVideoStream; }} autoPlay playsInline className="aspect-video max-h-[55vh] w-full object-contain" /><button type="button" onClick={(event) => openFullscreen(event.currentTarget.parentElement?.querySelector('video') ?? null)} className="absolute bottom-2 right-2 rounded-md bg-black/70 p-2 text-white" aria-label="Fullscreen remote video"><Maximize2 size={14} /></button><span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] text-white">{otherName}</span></div> : <div className="flex aspect-video items-center justify-center rounded-xl bg-black/30 text-sm text-ink-500">Camera is off</div>}
                      {localPreviewStream ? <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black"><video ref={(element) => { if (element && element.srcObject !== localPreviewStream) element.srcObject = localPreviewStream; }} autoPlay muted playsInline className="aspect-video max-h-[55vh] w-full object-contain" /><button type="button" onClick={(event) => openFullscreen(event.currentTarget.parentElement?.querySelector('video') ?? null)} className="absolute bottom-2 right-2 rounded-md bg-black/70 p-2 text-white" aria-label="Fullscreen local video"><Maximize2 size={14} /></button><span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] text-white">You {sharingScreen ? '· Sharing screen' : ''}</span></div> : <div className="flex aspect-video items-center justify-center rounded-xl bg-black/30 text-sm text-ink-500">Your camera is off</div>}
                    </div>
                  ) : (
                    <div className="mx-auto flex w-full max-w-sm flex-col items-center text-center">
                      <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-primary-300/20 bg-primary-500/10 text-3xl font-bold text-primary-200 shadow-[0_0_70px_rgba(59,130,246,0.12)]">{otherName.trim().slice(0,1).toUpperCase() || '?'}<span className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-4 border-ink-900 ${status === 'connected' ? 'bg-emerald-400' : status === 'reconnecting' ? 'bg-orange-400' : 'bg-amber-400'}`} /></div>
                      <h3 className="mt-5 text-xl font-bold text-ink-100">{otherName}</h3>
                      <p className="mt-1 text-sm text-ink-400">{status === 'outgoing' ? 'Waiting for them to answer…' : status === 'connecting' ? 'Establishing a secure peer connection…' : status === 'reconnecting' ? 'Restoring the network connection…' : timeLabel}</p>
                      {status === 'connected' ? <p className="mt-4 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1 text-xs text-emerald-300">Voice connected</p> : null}
                    </div>
                  )}
                </div>

                <aside className="flex flex-col gap-3">
                  <div className="rounded-xl border border-white/[0.07] bg-ink-900/70 p-3 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Participants</p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500/15 text-sm font-bold text-primary-200">{otherName.trim().slice(0,1).toUpperCase() || '?'}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-ink-100">{otherName}</p><p className="text-[10px] text-ink-500">Remote participant</p></div>
                      <span className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-emerald-400' : status === 'reconnecting' ? 'bg-orange-400' : 'bg-amber-400'}`} />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-ink-200">You</div>
                      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ink-100">You</p><p className="text-[10px] text-ink-500">{muted ? 'Microphone muted' : microphoneReady ? 'Microphone active' : 'Microphone unavailable'}</p></div>
                      {muted ? <MicOff size={14} className="text-red-300" /> : <Mic size={14} className="text-emerald-300" />}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-ink-900/70 p-3 text-left">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-ink-500">Audio devices</p>
                    <label className="block space-y-1 text-[10px] font-semibold text-ink-400">Microphone
                      <select value={selectedInputId} onChange={(event) => setSelectedInputId(event.target.value)} disabled={microphoneReady || audioInputs.length === 0} className="w-full rounded-lg border border-white/10 bg-ink-950 px-2 py-2 text-xs text-ink-200 disabled:opacity-50">
                        {audioInputs.length === 0 ? <option value="">Default microphone</option> : audioInputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
                      </select>
                    </label>
                    <label className="mt-3 block space-y-1 text-[10px] font-semibold text-ink-400">Speaker
                      <select value={selectedOutputId} onChange={(event) => setSelectedOutputId(event.target.value)} disabled={audioOutputs.length === 0 || !('setSinkId' in HTMLMediaElement.prototype)} className="w-full rounded-lg border border-white/10 bg-ink-950 px-2 py-2 text-xs text-ink-200 disabled:opacity-50">
                        {audioOutputs.length === 0 ? <option value="">Browser default</option> : audioOutputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Speaker ${index + 1}`}</option>)}
                      </select>
                    </label>
                  </div>
                </aside>
              </div>

              {error ? <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-400/10 p-2 text-xs text-red-300 sm:mx-5">{error}</p> : null}
              {audioPlaybackBlocked ? <button type="button" onClick={() => { const audio = audioRef.current; if (!audio) return; void audio.play().then(() => { setAudioPlaybackBlocked(false); setError(''); }).catch(() => setError('Audio is still blocked. Check your browser sound permissions.')); }} className="mx-4 mb-2 rounded-lg border border-primary-400/30 bg-primary-500/10 px-3 py-2 text-xs font-semibold text-primary-200 sm:mx-5">Enable audio</button> : null}

              <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/[0.08] bg-ink-900/90 px-3 py-4 sm:gap-3">
                <button type="button" onClick={toggleRemoteAudio} aria-label={remoteAudioMuted ? 'Unmute remote audio' : 'Mute remote audio'} title={remoteAudioMuted ? 'Unmute remote audio' : 'Mute remote audio'} className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 ${remoteAudioMuted ? 'bg-red-500/15 text-red-300' : 'text-ink-200 hover:bg-white/[0.06]'}`}>{remoteAudioMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                <button type="button" onClick={toggleMute} disabled={!microphoneReady} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} title={muted ? 'Unmute microphone' : 'Mute microphone'} className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 ${muted ? 'bg-red-500/15 text-red-300' : 'text-ink-200 hover:bg-white/[0.06]'} disabled:opacity-40`}>{muted ? <MicOff size={18} /> : <Mic size={18} />}</button>
                <button type="button" onClick={() => void toggleCamera()} disabled={status !== 'connected' || sharingScreen} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'} title={cameraEnabled ? 'Turn camera off' : 'Turn camera on'} className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 ${cameraEnabled ? 'bg-primary-500/15 text-primary-200' : 'text-ink-200 hover:bg-white/[0.06]'} disabled:opacity-40`}>{cameraEnabled ? <CameraOff size={18} /> : <Camera size={18} />}</button>
                <button type="button" onClick={() => void toggleScreenShare()} disabled={status !== 'connected'} aria-label={sharingScreen ? 'Stop screen sharing' : 'Share screen'} title={sharingScreen ? 'Stop screen sharing' : 'Share screen'} className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 ${sharingScreen ? 'bg-primary-500/15 text-primary-200' : 'text-ink-200 hover:bg-white/[0.06]'} disabled:opacity-40`}>{sharingScreen ? <MonitorUp size={18} /> : <MonitorUp size={18} />}</button>
                <button type="button" onClick={() => void hangUp()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-semibold text-white transition hover:bg-red-400"><PhoneOff size={17} /> End call</button>
              </footer>
            </section>
          </div>
        )
      ) : null}
      {error && status === 'idle' && !incomingCall ? <div role="status" className="fixed bottom-5 right-5 z-[95] max-w-sm rounded-xl border border-red-400/20 bg-ink-900 px-4 py-3 text-xs text-red-300 shadow-xl"><div className="flex items-start gap-2"><X size={14} className="mt-0.5 shrink-0" /><span>{error}</span></div></div> : null}
    </>
  );
}
