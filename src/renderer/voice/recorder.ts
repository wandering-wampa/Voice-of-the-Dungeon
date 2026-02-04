type RecorderState = 'idle' | 'recording';

export class VoiceRecorder {
  private state: RecorderState = 'idle';
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private inputSampleRate = 48000;

  getState() {
    return this.state;
  }

  async start() {
    if (this.state === 'recording') {
      return;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext();
    this.inputSampleRate = this.audioContext.sampleRate;

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0;
    this.chunks = [];

    this.processorNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(input));
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.state = 'recording';
  }

  async stop(): Promise<ArrayBuffer> {
    if (this.state !== 'recording') {
      return new ArrayBuffer(0);
    }

    this.state = 'idle';

    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    this.gainNode?.disconnect();

    this.stream?.getTracks().forEach((track) => track.stop());
    await this.audioContext?.close();

    const merged = mergeBuffers(this.chunks);
    const resampled = resampleBuffer(merged, this.inputSampleRate, 16000);
    return encodeWav(resampled, 16000);
  }
}

function mergeBuffers(chunks: Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function resampleBuffer(input: Float32Array, inputRate: number, targetRate: number) {
  if (inputRate === targetRate) {
    return input;
  }

  const ratio = inputRate / targetRate;
  const newLength = Math.round(input.length / ratio);
  const output = new Float32Array(newLength);

  for (let i = 0; i < newLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const nextIndex = Math.min(index + 1, input.length - 1);
    const fraction = position - index;
    output[i] = input[index] + (input[nextIndex] - input[index]) * fraction;
  }

  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);
  return buffer;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array) {
  let outputOffset = offset;
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(outputOffset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    outputOffset += 2;
  }
}
