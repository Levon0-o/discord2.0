import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Maximize2, Mic, MicOff, MonitorUp, Phone, PhoneCall, PhoneIncoming, PhoneOff, Volume2, VolumeX, X } from 'lucide-react';
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

type CallStatus = 'idle' | 'outgoing' | 'connecting' | 'connected';

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
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        if (callTimeoutRef.current !== null) window.clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        setCallStatus('connected');
        if (startedAtRef.current === null) {
          startedAtRef.current = Date.now();
          timerRef.current = window.setInterval(() => {
            if (startedAtRef.current !== null) setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
          }, 1000);
        }
      } else if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
        if (peer.connectionState === 'failed') setError('The network connection failed. Try calling again.');
        stopMedia();
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-label="Voice call" className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-500/15 text-primary-200"><PhoneCall size={25} /></div>
            <h2 className="mt-4 text-xl font-bold text-ink-50">{otherName}</h2>
            <p className="mt-1 text-sm text-ink-400">{status === 'outgoing' ? 'Calling…' : status === 'connecting' ? 'Connecting…' : timeLabel}</p>
            <div className="mt-4 grid gap-2 text-left sm:grid-cols-2">
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
            {error ? <p role="alert" className="mt-3 rounded-lg bg-red-400/10 p-2 text-xs text-red-300">{error}</p> : null}
            {audioPlaybackBlocked ? (
              <button
                type="button"
                onClick={() => {
                  const audio = audioRef.current;
                  if (!audio) return;
                  void audio.play().then(() => {
                    setAudioPlaybackBlocked(false);
                    setError('');
                  }).catch(() => setError('Audio is still blocked. Check your browser sound permissions.'));
                }}
                className="mt-3 rounded-lg border border-primary-400/30 bg-primary-500/10 px-3 py-2 text-xs font-semibold text-primary-200 hover:bg-primary-500/20"
              >
                Enable audio
              </button>
            ) : null}
            {remoteVideoStream || localPreviewStream ? <div className="mt-4 grid grid-cols-2 gap-2">
              {remoteVideoStream ? <div className="relative"><video ref={(element) => { if (element && element.srcObject !== remoteVideoStream) element.srcObject = remoteVideoStream; }} autoPlay playsInline className="aspect-video w-full rounded-lg bg-black object-cover" /><button type="button" onClick={(event) => openFullscreen(event.currentTarget.parentElement?.querySelector('video') ?? null)} className="absolute bottom-2 right-2 rounded-md bg-black/70 p-2 text-white" aria-label="Fullscreen remote video"><Maximize2 size={14} /></button></div> : <div className="flex aspect-video items-center justify-center rounded-lg bg-black/30 text-xs text-ink-500">Camera off</div>}
              {localPreviewStream ? <div className="relative"><video ref={(element) => { if (element && element.srcObject !== localPreviewStream) element.srcObject = localPreviewStream; }} autoPlay muted playsInline className="aspect-video w-full rounded-lg bg-black object-cover" /><button type="button" onClick={(event) => openFullscreen(event.currentTarget.parentElement?.querySelector('video') ?? null)} className="absolute bottom-2 right-2 rounded-md bg-black/70 p-2 text-white" aria-label="Fullscreen local video"><Maximize2 size={14} /></button></div> : <div className="flex aspect-video items-center justify-center rounded-lg bg-black/30 text-xs text-ink-500">Your camera is off</div>}
            </div> : null}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={toggleRemoteAudio} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-3 text-sm font-semibold text-ink-200 hover:bg-white/[0.06]">{remoteAudioMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}{remoteAudioMuted ? 'Unmute audio' : 'Mute audio'}</button>
              <button type="button" onClick={toggleMute} disabled={!microphoneReady} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-ink-200 hover:bg-white/[0.06] disabled:opacity-40">{muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? 'Unmute' : 'Mute'}</button>
              <button type="button" onClick={() => void toggleCamera()} disabled={status !== 'connected' || sharingScreen} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-3 text-sm font-semibold text-ink-200 hover:bg-white/[0.06] disabled:opacity-40">{cameraEnabled ? <CameraOff size={16} /> : <Camera size={16} />}{cameraEnabled ? 'Camera off' : 'Camera on'}</button>
              <button type="button" onClick={() => void toggleScreenShare()} disabled={status !== 'connected'} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-3 text-sm font-semibold text-ink-200 hover:bg-white/[0.06] disabled:opacity-40"><MonitorUp size={16} />{sharingScreen ? 'Stop sharing' : 'Share screen'}</button>
              <button type="button" onClick={() => void hangUp()} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white hover:bg-red-400"><PhoneOff size={16} /> End call</button>
            </div>
          </section>
        </div>
      ) : null}
      {error && status === 'idle' && !incomingCall ? <div role="status" className="fixed bottom-5 right-5 z-[95] max-w-sm rounded-xl border border-red-400/20 bg-ink-900 px-4 py-3 text-xs text-red-300 shadow-xl"><div className="flex items-start gap-2"><X size={14} className="mt-0.5 shrink-0" /><span>{error}</span></div></div> : null}
    </>
  );
}
