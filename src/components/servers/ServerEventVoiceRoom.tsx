import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Headphones, Maximize2, Mic, MicOff, MonitorUp, PhoneOff, Users, Volume2, VolumeX, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { SharedListening } from '@/components/shared/SharedListening';

interface ServerEventVoiceRoomProps {
  eventId: string;
  eventTitle: string;
  userId: string;
  members: Array<{ user_id: string; profile?: { display_name?: string | null; username?: string | null } | null }>;
  onClose: () => void;
  roomType?: 'event' | 'channel' | 'conversation';
}

type VoiceSignal = {
  from: string;
  to: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export function ServerEventVoiceRoom({ eventId, eventTitle, userId, members, onClose, roomType = 'event' }: ServerEventVoiceRoomProps) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [error, setError] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [localPreviewStream, setLocalPreviewStream] = useState<MediaStream | null>(null);
  const [mutedParticipants, setMutedParticipants] = useState<Record<string, boolean>>({});
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoInputId, setSelectedVideoInputId] = useState('');
  const [cameraQuality, setCameraQuality] = useState<'480p' | '720p' | '1080p'>('720p');
  const [selectedInputId, setSelectedInputId] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState('');
  const [stageLayout, setStageLayout] = useState<'grid' | 'focus'>('grid');
  const [focusedParticipantId, setFocusedParticipantId] = useState('');
  const [speakingParticipants, setSpeakingParticipants] = useState<Record<string, boolean>>({});
  const [reconnectingParticipants, setReconnectingParticipants] = useState<Record<string, boolean>>({});
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());
  const videoSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const screenAudioSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false);

  const refreshAudioDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');
      const outputs = devices.filter((device) => device.kind === 'audiooutput');
      const cameras = devices.filter((device) => device.kind === 'videoinput');
      setAudioInputs(inputs);
      setAudioOutputs(outputs);
      setVideoInputs(cameras);
      setSelectedVideoInputId((current) => current || cameras[0]?.deviceId || '');
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
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, []);

  useEffect(() => {
    if (!joined) {
      setSpeakingParticipants({});
      return;
    }
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    let context: AudioContext;
    try {
      context = new AudioContextConstructor();
    } catch {
      return;
    }
    void context.resume().catch(() => undefined);

    const analysers = new Map<string, AnalyserNode>();
    const sources = new Map<string, MediaStreamAudioSourceNode>();
    const buffers = new Map<string, Uint8Array>();
    const lastActive = new Map<string, number>();
    let frame = 0;
    let lastCheck = 0;

    const streams: Array<[string, MediaStream]> = [];
    if (localStreamRef.current) streams.push([userId, localStreamRef.current]);
    Object.entries(remoteStreams).forEach(([id, stream]) => streams.push([id, stream]));

    for (const [id, stream] of streams) {
      if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) continue;
      try {
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        sources.set(id, source);
        analysers.set(id, analyser);
        buffers.set(id, new Uint8Array(analyser.fftSize));
      } catch {
        // A stream may become unavailable while the room is reconnecting.
      }
    }

    const checkLevels = (timestamp: number) => {
      if (timestamp - lastCheck >= 90) {
        lastCheck = timestamp;
        const next: Record<string, boolean> = {};
        analysers.forEach((analyser, id) => {
          const buffer = buffers.get(id);
          if (!buffer) return;
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let index = 0; index < buffer.length; index += 1) {
            const sample = (buffer[index] - 128) / 128;
            sum += sample * sample;
          }
          const rms = Math.sqrt(sum / buffer.length);
          const localUnavailable = id === userId && (muted || !localStreamRef.current?.getAudioTracks().some((track) => track.enabled && track.readyState === 'live'));
          const active = !localUnavailable && rms > 0.035;
          if (active) lastActive.set(id, timestamp);
          const isSpeaking = active || timestamp - (lastActive.get(id) ?? 0) < 320;
          if (isSpeaking) next[id] = true;
        });
        setSpeakingParticipants((current) => {
          const currentIds = Object.keys(current).filter((id) => current[id]);
          const nextIds = Object.keys(next);
          if (currentIds.length === nextIds.length && currentIds.every((id) => next[id])) return current;
          return next;
        });
      }
      frame = window.requestAnimationFrame(checkLevels);
    };

    frame = window.requestAnimationFrame(checkLevels);
    return () => {
      window.cancelAnimationFrame(frame);
      sources.forEach((source) => { try { source.disconnect(); } catch { /* already disconnected */ } });
      analysers.forEach((analyser) => { try { analyser.disconnect(); } catch { /* already disconnected */ } });
      void context.close().catch(() => undefined);
    };
  }, [joined, remoteStreams, muted, userId]);

  useEffect(() => {
    audioElementsRef.current.forEach((element) => {
      const sinkElement = element as HTMLMediaElement & { setSinkId?: (deviceId: string) => Promise<void> };
      if (selectedOutputId && sinkElement.setSinkId) {
        void sinkElement.setSinkId(selectedOutputId).catch(() => {
          setError('Could not switch the audio output device in this browser.');
        });
      }
    });
  }, [selectedOutputId, remoteStreams]);

  useEffect(() => {
    return () => {
      joinedRef.current = false;
      reconnectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      reconnectTimersRef.current.clear();
      reconnectAttemptsRef.current.clear();
      peersRef.current.forEach((peer) => peer.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
    };
  }, []);

  async function joinRoom() {
    if (connecting || joinedRef.current) return;
    setConnecting(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        throw new Error('This browser does not support WebRTC voice rooms.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(selectedInputId ? { deviceId: { exact: selectedInputId } } : {}),
        },
        video: false,
      });
      localStreamRef.current = stream;
      await refreshAudioDevices();
      const topicPrefix = roomType === 'channel' ? 'server-channel-voice:' : roomType === 'conversation' ? 'dm-group-voice:' : 'server-event-voice:';
      const channel = supabase.channel(topicPrefix + eventId, {
        config: { private: true, broadcast: { self: false }, presence: { key: userId } },
      });
      channelRef.current = channel;

      const sendSignal = async (event: string, payload: VoiceSignal) => {
        await channel.send({ type: 'broadcast', event, payload });
      };

      const makePeer = (peerId: string) => {
        const existing = peersRef.current.get(peerId);
        if (existing) return existing;
        const peer = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
        });
        peersRef.current.set(peerId, peer);
        stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
        const videoTransceiver = peer.addTransceiver('video', { direction: 'sendrecv' });
        videoSendersRef.current.set(peerId, videoTransceiver.sender);
        const screenAudioTransceiver = peer.addTransceiver('audio', { direction: 'sendrecv' });
        screenAudioSendersRef.current.set(peerId, screenAudioTransceiver.sender);
        const activeVideoTrack = screenStreamRef.current?.getVideoTracks()[0] ?? cameraStreamRef.current?.getVideoTracks()[0];
        if (activeVideoTrack) void videoTransceiver.sender.replaceTrack(activeVideoTrack);
        peer.onicecandidate = (event) => {
          if (event.candidate) void sendSignal('ice', { from: userId, to: peerId, candidate: event.candidate.toJSON() });
        };
        peer.ontrack = (event) => {
          const remote = remoteStreamsRef.current.get(peerId) ?? new MediaStream();
          const incomingTracks = event.streams[0]?.getTracks() ?? [event.track];
          for (const track of incomingTracks) {
            if (!remote.getTracks().some((existingTrack) => existingTrack.id === track.id)) remote.addTrack(track);
          }
          remoteStreamsRef.current.set(peerId, remote);
          setRemoteStreams((current) => ({ ...current, [peerId]: remote }));
        };
        peer.onconnectionstatechange = () => {
          const connectionState = peer.connectionState;
          if (connectionState === 'connected') {
            const timer = reconnectTimersRef.current.get(peerId);
            if (timer) window.clearTimeout(timer);
            reconnectTimersRef.current.delete(peerId);
            reconnectAttemptsRef.current.delete(peerId);
            setReconnectingParticipants((current) => {
              if (!current[peerId]) return current;
              const next = { ...current };
              delete next[peerId];
              return next;
            });
            return;
          }
          if (connectionState === 'closed') return;
          if (connectionState !== 'failed' && connectionState !== 'disconnected') return;

          setReconnectingParticipants((current) => ({ ...current, [peerId]: true }));
          if (reconnectTimersRef.current.has(peerId)) return;
          const attempt = reconnectAttemptsRef.current.get(peerId) ?? 0;
          if (attempt >= 3) {
            setReconnectingParticipants((current) => {
              const next = { ...current };
              delete next[peerId];
              return next;
            });
            setError('A participant connection could not recover. They may need to rejoin the voice room.');
            return;
          }
          const delay = connectionState === 'failed' ? 0 : 5000;
          const timer = window.setTimeout(() => {
            reconnectTimersRef.current.delete(peerId);
            if (!joinedRef.current || peersRef.current.get(peerId) !== peer || peer.connectionState === 'connected' || peer.connectionState === 'closed') return;
            const nextAttempt = (reconnectAttemptsRef.current.get(peerId) ?? 0) + 1;
            reconnectAttemptsRef.current.set(peerId, nextAttempt);
            // The lexicographically first participant owns renegotiation to avoid offer collisions.
            if (userId < peerId) {
              void (async () => {
                try {
                  if (peer.signalingState !== 'stable') {
                    await peer.setLocalDescription({ type: 'rollback' });
                  }
                  const offer = await peer.createOffer({ iceRestart: true });
                  await peer.setLocalDescription(offer);
                  await sendSignal('offer', { from: userId, to: peerId, sdp: peer.localDescription ?? offer });
                } catch {
                  if (nextAttempt >= 3) {
                    setReconnectingParticipants((current) => {
                      const next = { ...current };
                      delete next[peerId];
                      return next;
                    });
                    setError('A participant connection could not recover. They may need to rejoin the voice room.');
                  }
                }
              })();
            }
            if (nextAttempt < 3 && peer.connectionState !== 'connected') {
              const retryDelay = Math.min(5000 * nextAttempt, 10000);
              const retryTimer = window.setTimeout(() => {
                reconnectTimersRef.current.delete(peerId);
                if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
                  peer.dispatchEvent(new Event('connectionstatechange'));
                }
              }, retryDelay);
              reconnectTimersRef.current.set(peerId, retryTimer);
            }
          }, delay);
          reconnectTimersRef.current.set(peerId, timer);
        };
        return peer;
      };

      channel
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          const signal = payload as VoiceSignal;
          if (signal.to !== userId || !signal.sdp) return;
          try {
            const peer = makePeer(signal.from);
            await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const queued = pendingIceRef.current.get(signal.from) ?? [];
            for (const candidate of queued) await peer.addIceCandidate(new RTCIceCandidate(candidate));
            pendingIceRef.current.delete(signal.from);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await sendSignal('answer', { from: userId, to: signal.from, sdp: peer.localDescription ?? answer });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not establish a voice connection.');
          }
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          const signal = payload as VoiceSignal;
          if (signal.to !== userId || !signal.sdp) return;
          const peer = peersRef.current.get(signal.from);
          if (!peer) return;
          try {
            await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const queued = pendingIceRef.current.get(signal.from) ?? [];
            for (const candidate of queued) await peer.addIceCandidate(new RTCIceCandidate(candidate));
            pendingIceRef.current.delete(signal.from);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not finish the voice connection.');
          }
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          const signal = payload as VoiceSignal;
          if (signal.to !== userId || !signal.candidate) return;
          const peer = peersRef.current.get(signal.from);
          if (!peer || !peer.remoteDescription) {
            const queued = pendingIceRef.current.get(signal.from) ?? [];
            queued.push(signal.candidate);
            pendingIceRef.current.set(signal.from, queued);
            return;
          }
          try {
            await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch {
            // A stale ICE candidate can safely be ignored after a peer reconnects.
          }
        })
        .on('presence', { event: 'sync' }, async () => {
          const state = channel.presenceState<{ user_id: string }>();
          const ids = [...new Set(Object.values(state).flat().map((entry) => entry.user_id).filter((id) => id && id !== userId))];
          setParticipants(ids);
          for (const peerId of ids) {
            if (userId < peerId && !peersRef.current.has(peerId)) {
              try {
                const peer = makePeer(peerId);
                const offer = await peer.createOffer();
                await peer.setLocalDescription(offer);
                await sendSignal('offer', { from: userId, to: peerId, sdp: peer.localDescription ?? offer });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not start a voice connection.');
              }
            }
          }
          for (const peerId of [...peersRef.current.keys()]) {
            if (!ids.includes(peerId)) {
              peersRef.current.get(peerId)?.close();
              const reconnectTimer = reconnectTimersRef.current.get(peerId);
              if (reconnectTimer) window.clearTimeout(reconnectTimer);
              reconnectTimersRef.current.delete(peerId);
              reconnectAttemptsRef.current.delete(peerId);
              setReconnectingParticipants((current) => {
                const next = { ...current };
                delete next[peerId];
                return next;
              });
              peersRef.current.delete(peerId);
              videoSendersRef.current.delete(peerId);
              screenAudioSendersRef.current.delete(peerId);
              remoteStreamsRef.current.delete(peerId);
              setRemoteStreams((current) => {
                const next = { ...current };
                delete next[peerId];
                return next;
              });
            }
          }
        });

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Voice room connection timed out.')), 12000);
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            window.clearTimeout(timeout);
            try {
              await channel.track({ user_id: userId, joined_at: new Date().toISOString() });
              joinedRef.current = true;
              setJoined(true);
              resolve();
            } catch (err) {
              window.clearTimeout(timeout);
              reject(err);
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            window.clearTimeout(timeout);
            reject(new Error('Could not connect to the voice room. Check that the voice-room migration has been applied and you are a member of this conversation or channel.'));
          }
        });
      });
    } catch (err) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setError(err instanceof Error ? err.message : 'Could not join the voice room.');
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    } finally {
      setConnecting(false);
    }
  }

  async function leaveRoom() {
    joinedRef.current = false;
    reconnectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    reconnectTimersRef.current.clear();
    reconnectAttemptsRef.current.clear();
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    videoSendersRef.current.clear();
    screenAudioSendersRef.current.clear();
    remoteStreamsRef.current.clear();
    pendingIceRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setLocalPreviewStream(null);
    setCameraEnabled(false);
    setSharingScreen(false);
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setJoined(false);
    setMuted(false);
    setParticipants([]);
    setRemoteStreams({});
    setMutedParticipants({});
    setReconnectingParticipants({});
  }

  function toggleMute() {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  function toggleParticipantAudio(participantId: string) {
    setMutedParticipants((current) => ({ ...current, [participantId]: !current[participantId] }));
  }

  function openFullscreen(element: HTMLVideoElement | null) {
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (element.requestFullscreen) void element.requestFullscreen().catch(() => setError('Fullscreen is not available in this browser.'));
  }

  async function toggleCamera() {
    if (!joinedRef.current) return;
    const senders = [...videoSendersRef.current.values()];
    if (cameraEnabled) {
      await Promise.all(senders.map((sender) => sender.replaceTrack(null)));
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setLocalPreviewStream(null);
      setCameraEnabled(false);
      return;
    }
    try {
      const quality = cameraQuality === '480p' ? { width: 854, height: 480 } : cameraQuality === '1080p' ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(selectedVideoInputId ? { deviceId: { exact: selectedVideoInputId } } : {}),
          width: { ideal: quality.width },
          height: { ideal: quality.height },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No camera was found.');
      await Promise.all(senders.map((sender) => sender.replaceTrack(track)));
      cameraStreamRef.current?.getTracks().forEach((item) => item.stop());
      cameraStreamRef.current = stream;
      setLocalPreviewStream(stream);
      setCameraEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not access the camera.');
    }
  }

  async function toggleScreenShare() {
    if (!joinedRef.current) return;
    const senders = [...videoSendersRef.current.values()];
    if (sharingScreen) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
      await Promise.all(senders.map((sender) => sender.replaceTrack(cameraTrack)));
      await Promise.all([...screenAudioSendersRef.current.values()].map((sender) => sender.replaceTrack(null)));
      setSharingScreen(false);
      setLocalPreviewStream(cameraStreamRef.current);
      return;
    }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is not supported by this browser.');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: true });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No screen source was selected.');
      await Promise.all(senders.map((sender) => sender.replaceTrack(track)));
      const screenAudioTrack = stream.getAudioTracks()[0] ?? null;
      await Promise.all([...screenAudioSendersRef.current.values()].map((sender) => sender.replaceTrack(screenAudioTrack)));
      screenStreamRef.current = stream;
      setLocalPreviewStream(stream);
      setSharingScreen(true);
      track.onended = () => { void (async () => {
        const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
        await Promise.all([...videoSendersRef.current.values()].map((sender) => sender.replaceTrack(cameraTrack)));
        await Promise.all([...screenAudioSendersRef.current.values()].map((sender) => sender.replaceTrack(null)));
        screenStreamRef.current?.getTracks().forEach((item) => item.stop());
        screenStreamRef.current = null;
        setSharingScreen(false);
        setLocalPreviewStream(cameraStreamRef.current);
      })(); };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share your screen.');
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-primary-400/20 bg-ink-900/80">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Headphones size={15} className="shrink-0 text-primary-300" />
          <div className="min-w-0"><p className="text-xs font-semibold text-ink-100">{roomType === 'channel' ? 'Voice channel' : roomType === 'conversation' ? 'Group voice call' : 'Event voice room'}</p><p className="truncate text-[10px] text-ink-500">{eventTitle}</p></div>
        </div>
        <button type="button" onClick={() => { void leaveRoom(); onClose(); }} className="rounded-md p-1.5 text-ink-500 hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close voice room"><X size={14} /></button>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/10 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-ink-300"><Users size={14} className="text-primary-300" /> {joined ? participants.length + 1 : 0} connected</div>
          <span className={'text-[10px] font-semibold ' + (joined ? 'text-emerald-300' : 'text-ink-500')}>{joined ? 'Connected' : 'Not connected'}</span>
        </div>
        {joined ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[userId, ...participants].map((id) => {
              const member = members.find((entry) => entry.user_id === id);
              const label = id === userId ? 'You' : member?.profile?.display_name || member?.profile?.username || 'Server member';
              return <div key={id} className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-[10px] font-bold text-primary-200">{label.slice(0, 1).toUpperCase()}</span>
                <span className="truncate text-[11px] text-ink-200">{label}</span>
                {id !== userId && reconnectingParticipants[id] ? <span className="ml-auto rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">Reconnecting</span> : id === userId && muted ? <MicOff size={12} className="ml-auto text-amber-300" /> : speakingParticipants[id] ? <span className="ml-auto rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">Speaking</span> : <Mic size={12} className="ml-auto text-ink-500" />}
              </div>;
            })}
          </div>
        ) : <p className="text-center text-xs text-ink-500">Join to talk with other server members. Your microphone is requested only after you press Join.</p>}
        {joined ? <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-ink-400"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Live room · {participants.length + 1} connected</div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-white/[0.08] bg-black/20 p-1">
                <button type="button" onClick={() => setStageLayout('grid')} className={'rounded-md px-3 py-1.5 text-[10px] font-semibold ' + (stageLayout === 'grid' ? 'bg-primary-500/20 text-primary-200' : 'text-ink-500 hover:text-ink-200')}>Grid</button>
                <button type="button" onClick={() => setStageLayout('focus')} className={'rounded-md px-3 py-1.5 text-[10px] font-semibold ' + (stageLayout === 'focus' ? 'bg-primary-500/20 text-primary-200' : 'text-ink-500 hover:text-ink-200')}>Focus</button>
              </div>
              {stageLayout === 'focus' ? <select aria-label="Focused participant" value={focusedParticipantId || userId} onChange={(event) => setFocusedParticipantId(event.target.value)} className="max-w-40 rounded-lg border border-white/10 bg-ink-950 px-2 py-1.5 text-[10px] text-ink-200">{[<option key={userId} value={userId}>You</option>, ...participants.map((id) => { const member = members.find((entry) => entry.user_id === id); return <option key={id} value={id}>{member?.profile?.display_name || member?.profile?.username || 'Server member'}</option>; })]}</select> : null}
            </div>
          </div>
          <div className={stageLayout === 'focus' ? 'grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)]' : 'grid grid-cols-1 gap-2 sm:grid-cols-2'}>
            {localPreviewStream ? <div className={'relative overflow-hidden rounded-xl border border-white/[0.08] bg-black ' + (stageLayout === 'focus' && (focusedParticipantId || userId) === userId ? 'sm:row-span-2' : '')}><video autoPlay muted playsInline ref={(element) => { if (element && element.srcObject !== localPreviewStream) element.srcObject = localPreviewStream; }} className={'w-full bg-black object-contain ' + (stageLayout === 'focus' && (focusedParticipantId || userId) === userId ? 'aspect-video h-full min-h-[240px]' : 'aspect-video')} /><span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] text-white">You · {sharingScreen ? 'Sharing screen' : cameraEnabled ? 'Camera on' : 'Preview'}</span><button type="button" onClick={(event) => { const video = event.currentTarget.parentElement?.querySelector('video') ?? null; openFullscreen(video); }} className="absolute bottom-2 right-2 rounded-md bg-black/70 p-2 text-white" aria-label="Fullscreen preview"><Maximize2 size={14} /></button></div> : null}
            {Object.entries(remoteStreams).sort(([a], [b]) => { const focus = focusedParticipantId || userId; return a === focus ? -1 : b === focus ? 1 : 0; }).map(([id, remoteStream]) => <div key={id} className={'relative overflow-hidden rounded-xl border bg-black transition-colors ' + (speakingParticipants[id] ? 'border-emerald-400/80 ring-1 ring-emerald-400/40' : 'border-white/[0.08]') + ' ' + (stageLayout === 'focus' && id === focusedParticipantId ? 'sm:row-span-2' : '')}>{remoteStream.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled) ? <video autoPlay playsInline ref={(element) => { if (element && element.srcObject !== remoteStream) element.srcObject = remoteStream; }} className={'w-full bg-black object-contain ' + (stageLayout === 'focus' && id === focusedParticipantId ? 'aspect-video h-full min-h-[240px]' : 'aspect-video')} /> : <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-black"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-400/10 text-xl font-semibold text-primary-100">{(members.find((entry) => entry.user_id === id)?.profile?.display_name || members.find((entry) => entry.user_id === id)?.profile?.username || 'P').slice(0, 1).toUpperCase()}</span><span className="text-[10px] text-ink-500">Camera is off</span></div>}<audio autoPlay ref={(element) => { if (element) { audioElementsRef.current.set(id, element); if (element.srcObject !== remoteStream) element.srcObject = remoteStream; element.muted = Boolean(mutedParticipants[id]); const sinkElement = element as HTMLMediaElement & { setSinkId?: (deviceId: string) => Promise<void> }; if (selectedOutputId && sinkElement.setSinkId) void sinkElement.setSinkId(selectedOutputId).catch(() => setError('Could not switch the audio output device.')); } else { audioElementsRef.current.delete(id); } }} /><span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/75 px-2 py-1 text-[10px] text-white">{members.find((entry) => entry.user_id === id)?.profile?.display_name || members.find((entry) => entry.user_id === id)?.profile?.username || 'Participant'}{reconnectingParticipants[id] ? <span className="font-semibold text-amber-300">· Reconnecting</span> : speakingParticipants[id] ? <span className="font-semibold text-emerald-300">· Speaking</span> : null}</span><div className="absolute bottom-2 right-2 flex gap-1"><button type="button" onClick={(event) => { const video = event.currentTarget.parentElement?.parentElement?.querySelector('video') ?? null; openFullscreen(video); }} className="rounded-md bg-black/70 p-2 text-white" aria-label="Fullscreen video"><Maximize2 size={14} /></button><button type="button" onClick={() => toggleParticipantAudio(id)} className="rounded-md bg-black/70 p-2 text-white" aria-label={mutedParticipants[id] ? 'Unmute participant audio' : 'Mute participant audio'}>{mutedParticipants[id] ? <VolumeX size={14} /> : <Volume2 size={14} />}</button></div></div>)}
            {!localPreviewStream && Object.keys(remoteStreams).length === 0 ? <div className="rounded-xl border border-dashed border-white/10 bg-black/10 p-8 text-center text-xs text-ink-500 sm:col-span-2">You're connected. Participant video tiles will appear here when cameras are enabled.</div> : null}
          </div>
        </> : null}
        <div className="grid gap-2 rounded-lg border border-white/[0.06] bg-black/10 p-3 sm:grid-cols-2">
          <label className="min-w-0 space-y-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-500">Microphone</span>
            <select value={selectedInputId} onChange={(event) => setSelectedInputId(event.target.value)} disabled={joined || connecting || audioInputs.length === 0} className="w-full rounded-lg border border-white/10 bg-ink-950 px-2.5 py-2 text-xs text-ink-200 outline-none focus:border-primary-400 disabled:opacity-50">
              {audioInputs.length === 0 ? <option value="">Default microphone</option> : audioInputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-500">Speaker</span>
            <select value={selectedOutputId} onChange={(event) => setSelectedOutputId(event.target.value)} disabled={audioOutputs.length === 0} className="w-full rounded-lg border border-white/10 bg-ink-950 px-2.5 py-2 text-xs text-ink-200 outline-none focus:border-primary-400 disabled:opacity-50">
              {audioOutputs.length === 0 ? <option value="">Browser default</option> : audioOutputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Speaker ${index + 1}`}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-500">Camera</span>
            <select value={selectedVideoInputId} onChange={(event) => setSelectedVideoInputId(event.target.value)} disabled={cameraEnabled || videoInputs.length === 0} className="w-full rounded-lg border border-white/10 bg-ink-950 px-2.5 py-2 text-xs text-ink-200 outline-none focus:border-primary-400 disabled:opacity-50">
              {videoInputs.length === 0 ? <option value="">Default camera</option> : videoInputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-500">Camera quality</span>
            <select value={cameraQuality} onChange={(event) => setCameraQuality(event.target.value as '480p' | '720p' | '1080p')} disabled={cameraEnabled} className="w-full rounded-lg border border-white/10 bg-ink-950 px-2.5 py-2 text-xs text-ink-200 outline-none focus:border-primary-400 disabled:opacity-50">
              <option value="480p">480p · Data saver</option>
              <option value="720p">720p · Balanced</option>
              <option value="1080p">1080p · High quality</option>
            </select>
          </label>
          <p className="text-[10px] text-ink-500 sm:col-span-2">Microphone selection is applied when you join. Camera and quality settings apply when you turn your camera on. Available resolutions depend on your camera and connection.</p>
        </div>
        {error ? <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-[10px] text-red-300">{error}</p> : null}
        <div className="flex justify-center gap-2">
          {!joined ? <button type="button" onClick={() => void joinRoom()} disabled={connecting} className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-400 disabled:opacity-50"><Headphones size={14} />{connecting ? 'Connecting…' : 'Join voice'}</button> : <>
            <button type="button" onClick={toggleMute} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-ink-200 hover:bg-white/[0.06]">{muted ? <MicOff size={14} /> : <Mic size={14} />}{muted ? 'Unmute' : 'Mute'}</button>
            <button type="button" onClick={() => void toggleCamera()} disabled={sharingScreen} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-ink-200 hover:bg-white/[0.06] disabled:opacity-40">{cameraEnabled ? <CameraOff size={14} /> : <Camera size={14} />}{cameraEnabled ? 'Camera off' : 'Camera on'}</button>
            <button type="button" onClick={() => void toggleScreenShare()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-ink-200 hover:bg-white/[0.06]"><MonitorUp size={14} />{sharingScreen ? 'Stop sharing' : 'Share screen'}</button>
            <button type="button" onClick={() => void leaveRoom()} className="inline-flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/25"><PhoneOff size={14} />Leave</button>
          </>}
        </div>
      </div>
      {roomType === 'channel' ? <SharedListening roomType="channel" roomId={eventId} /> : null}
    </section>
  );
}
