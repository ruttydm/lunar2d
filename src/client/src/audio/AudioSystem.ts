export class AudioSystem {
  private audioContext: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private masterGain: GainNode | null = null;

  enable() {
    if (this.audioContext) {
      void this.audioContext.resume();
      return;
    }
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioCtor();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.55;
    this.masterGain.connect(this.audioContext.destination);
    this.engineGain = this.audioContext.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.masterGain);
    this.engineOsc = this.audioContext.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 48;
    const lowpass = this.audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 190;
    this.engineOsc.connect(lowpass);
    lowpass.connect(this.engineGain);
    this.engineOsc.start();
  }

  updateEngine(throttle: number) {
    if (!this.audioContext || !this.engineGain || !this.engineOsc) return;
    const now = this.audioContext.currentTime;
    this.engineGain.gain.setTargetAtTime(throttle > 0.01 ? 0.035 + throttle * 0.16 : 0.0001, now, 0.035);
    this.engineOsc.frequency.setTargetAtTime(38 + throttle * 72, now, 0.04);
  }

  playBurst(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.18) {
    if (!this.audioContext || !this.masterGain) return;
    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  playLandingTone() {
    this.playBurst(330, 0.12, 'sine', 0.16);
    setTimeout(() => this.playBurst(495, 0.16, 'sine', 0.14), 110);
    setTimeout(() => this.playBurst(660, 0.24, 'sine', 0.12), 240);
  }
}
