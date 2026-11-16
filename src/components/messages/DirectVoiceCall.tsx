import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneCall, PhoneIncoming, PhoneOff, X } from 'lucide-react';
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingCallRef = useRef<CallSignal | null>(null);
  const handledInviteCallIdRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef('');
  const statusRef = useRef<CallStatus>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const callTimeoutRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

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
    if (audioRef.current) audioRef.current.srcObject = null;
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

  async function getMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      throw new Error('Your browser does not support voice calls.');
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
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
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
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
      if (!audioRef.current) return;
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      audioRef.current.srcObject = remoteStream;
      audioRef.current.volume = 1;
      void audioRef.current.play().catch(() => setError('Your browser blocked call audio. Click the page, then try again.'));
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
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
    try {
      streamRef.current = await getMicrophone();
      setCallStatus('outgoing');
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
    try {
      streamRef.current = await getMicrophone();
      incomingCallRef.current = null;
      setIncomingCall(null);
      setCallStatus('connecting');
      await send('accept', { call_id: invite.call_id, from: currentUserId, to: invite.from });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not access the microphone.');
      stopMedia();
    }
  }

  async function rejectCall() {
    const invite = incomingCallRef.current;
    if (callTimeoutRef.current !== null) window.clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    incomingCallRef.current = null;
    setIncomingCall(null);
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
    if (callId) {
      try {
        await send('hangup', { call_id: callId, from: currentUserId, to: otherUserId });
      } catch {
        // Local cleanup must still happen if the other client disconnected.
      }
    }
    incomingCallRef.current = null;
    setIncomingCall(null);
    stopMedia();
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  const timeLabel = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;

  return (
    <>
      <audio ref={audioRef} autoPlay />
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
            {error ? <p role="alert" className="mt-3 rounded-lg bg-red-400/10 p-2 text-xs text-red-300">{error}</p> : null}
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={toggleMute} disabled={!streamRef.current} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-ink-200 hover:bg-white/[0.06] disabled:opacity-40">{muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? 'Unmute' : 'Mute'}</button>
              <button type="button" onClick={() => void hangUp()} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white hover:bg-red-400"><PhoneOff size={16} /> End call</button>
            </div>
          </section>
        </div>
      ) : null}
      {error && status === 'idle' && !incomingCall ? <div role="status" className="fixed bottom-5 right-5 z-[95] max-w-sm rounded-xl border border-red-400/20 bg-ink-900 px-4 py-3 text-xs text-red-300 shadow-xl"><div className="flex items-start gap-2"><X size={14} className="mt-0.5 shrink-0" /><span>{error}</span></div></div> : null}
    </>
  );
}
