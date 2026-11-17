import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Headphones, Mic, MicOff, MonitorUp, PhoneOff, Users, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import type { MemberWithProfile } from '@/types/servers';

interface ServerEventVoiceRoomProps {
  eventId: string;
  eventTitle: string;
  userId: string;
  members: MemberWithProfile[];
  onClose: () => void;
  roomType?: 'event' | 'channel';
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const videoSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    return () => {
      joinedRef.current = false;
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      localStreamRef.current = stream;
      const channel = supabase.channel((roomType === 'channel' ? 'server-channel-voice:' : 'server-event-voice:') + eventId, {
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
          if (peer.connectionState === 'failed' || peer.connectionState === 'closed' || peer.connectionState === 'disconnected') {
            if (peer.connectionState !== 'disconnected') {
              peer.close();
              peersRef.current.delete(peerId);
              videoSendersRef.current.delete(peerId);
              remoteStreamsRef.current.delete(peerId);
              setRemoteStreams((current) => {
                const next = { ...current };
                delete next[peerId];
                return next;
              });
            }
          }
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
              peersRef.current.delete(peerId);
              videoSendersRef.current.delete(peerId);
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
            reject(new Error('Could not connect to the voice room. Check that the event voice migration has been applied.'));
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
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    videoSendersRef.current.clear();
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
  }

  function toggleMute() {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: false });
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
      setSharingScreen(false);
      setLocalPreviewStream(cameraStreamRef.current);
      return;
    }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is not supported by this browser.');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No screen source was selected.');
      await Promise.all(senders.map((sender) => sender.replaceTrack(track)));
      screenStreamRef.current = stream;
      setLocalPreviewStream(stream);
      setSharingScreen(true);
      track.onended = () => { void (async () => {
        const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
        await Promise.all([...videoSendersRef.current.values()].map((sender) => sender.replaceTrack(cameraTrack)));
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
          <div className="min-w-0"><p className="text-xs font-semibold text-ink-100">{roomType === 'channel' ? 'Voice channel' : 'Event voice room'}</p><p className="truncate text-[10px] text-ink-500">{eventTitle}</p></div>
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
                {id === userId && muted ? <MicOff size={12} className="ml-auto text-amber-300" /> : <Mic size={12} className="ml-auto text-emerald-300" />}
              </div>;
            })}
          </div>
        ) : <p className="text-center text-xs text-ink-500">Join to talk with other server members. Your microphone is requested only after you press Join.</p>}
        {joined ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {localPreviewStream ? <video autoPlay muted playsInline ref={(element) => { if (element && element.srcObject !== localPreviewStream) element.srcObject = localPreviewStream; }} className="aspect-video w-full rounded-lg bg-black object-cover" /> : null}
          {Object.entries(remoteStreams).map(([id, remoteStream]) => <video key={id} autoPlay playsInline ref={(element) => { if (element && element.srcObject !== remoteStream) element.srcObject = remoteStream; }} className="aspect-video w-full rounded-lg bg-black object-cover" />)}
        </div> : null}
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
    </section>
  );
}
