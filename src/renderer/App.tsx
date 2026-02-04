import { useEffect, useRef, useState } from 'react';
import { VoiceRecorder } from './voice/recorder';

type SttStatus = {
  state: 'idle' | 'downloading' | 'starting' | 'running' | 'error';
  message?: string;
  progress?: number;
};

export default function App() {
  const recorderRef = useRef(new VoiceRecorder());
  const [status, setStatus] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [sttStatus, setSttStatus] = useState<SttStatus>({ state: 'idle' });

  useEffect(() => {
    let mounted = true;
    window.vod.stt.getStatus().then((current) => {
      if (mounted) {
        setSttStatus(current as SttStatus);
      }
    });

    const unsubscribe = window.vod.stt.onStatus((next) => {
      setSttStatus(next as SttStatus);
    });

    window.vod.stt.ensureReady().catch(() => {
      // Status updates will reflect errors.
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const sttReady = sttStatus.state === 'running';

  const handlePress = async () => {
    if (status !== 'idle') {
      return;
    }

    if (!sttReady) {
      setError('Speech engine is starting. Please wait...');
      return;
    }

    setError('');
    setTranscript('');
    setStatus('listening');

    try {
      await recorderRef.current.start();
    } catch (err) {
      setError('Microphone access denied or unavailable.');
      setStatus('idle');
    }
  };

  const handleRelease = async () => {
    if (status !== 'listening') {
      return;
    }

    setStatus('transcribing');

    try {
      const audioBuffer = await recorderRef.current.stop();
      const result = await window.vod.stt.transcribe(audioBuffer);

      if (result.error) {
        if (result.error === 'stt_unavailable') {
          setError('Speech engine is not ready yet.');
        } else {
          setError(`STT error: ${result.error}`);
        }
      } else {
        setTranscript(result.text || '(no speech detected)');
      }
    } catch (err) {
      setError('STT request failed.');
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Voice of the Dungeon</h1>
        <p>Push-to-talk demo wired for local faster-whisper.</p>
      </header>

      <section className="panel">
        <div className="status">
          Mic: {status} | STT: {sttStatus.state}
          {sttStatus.progress !== undefined
            ? ` (${Math.round(sttStatus.progress * 100)}%)`
            : ''}
        </div>
        {sttStatus.message ? <div className="stt-message">{sttStatus.message}</div> : null}
        <button
          className="ptt"
          onPointerDown={handlePress}
          onPointerUp={handleRelease}
          onPointerLeave={handleRelease}
          disabled={status === 'transcribing' || !sttReady}
        >
          {status === 'listening' ? 'Release to Send' : 'Hold to Talk'}
        </button>
        {transcript ? <div className="transcript">Transcript: {transcript}</div> : null}
        {error ? <div className="error">{error}</div> : null}
      </section>
    </div>
  );
}
