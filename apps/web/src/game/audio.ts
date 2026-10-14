const IDLE_HERTZ = 52;
const REDLINE_HERTZ = 300;
const SHIFT_SECONDS = 0.12;
const SIREN_LOW = 660;
const SIREN_HIGH = 880;
const SIREN_STEP = 0.28;
const RUSH_SPEED = 75;

export interface Sound {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  drive: (
    speed: number,
    throttle: number,
    revs: number,
    offRoad: boolean
  ) => void;
  shift: () => void;
  thump: (strength: number) => void;
  crash: () => void;
  swing: () => void;
  hit: () => void;
  weaponHit: () => void;
  siren: () => void;
  whoosh: () => void;
  dispose: () => void;
}

export function createSound(): Sound {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let engine: OscillatorNode | undefined;
  let growl: OscillatorNode | undefined;
  let engineGain: GainNode | undefined;
  let engineTone: BiquadFilterNode | undefined;
  let shiftGain: GainNode | undefined;
  let windGain: GainNode | undefined;
  let windTone: BiquadFilterNode | undefined;
  let noise: AudioBuffer | undefined;
  let muted = false;

  const burst = (
    hertz: number,
    seconds: number,
    volume: number,
    sweepTo: number
  ) => {
    if (!context || !master || !noise) {
      return;
    }
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(hertz, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(
      sweepTo,
      context.currentTime + seconds
    );
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + seconds
    );
    source.connect(filter).connect(gain).connect(master);
    source.start();
    source.stop(context.currentTime + seconds);
  };

  const shutDown = () => {
    void context?.close();
    context = undefined;
    master = undefined;
  };

  const build = () => {
    const audio = new AudioContext();
    context = audio;
    master = audio.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(audio.destination);

    noise = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const samples = noise.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.random() * 2 - 1;
    }

    engineTone = audio.createBiquadFilter();
    engineTone.type = "lowpass";
    engineTone.frequency.value = 600;
    engineGain = audio.createGain();
    engineGain.gain.value = 0.07;
    shiftGain = audio.createGain();
    shiftGain.gain.value = 1;
    engine = audio.createOscillator();
    engine.type = "sawtooth";
    growl = audio.createOscillator();
    growl.type = "square";
    const growlGain = audio.createGain();
    growlGain.gain.value = 0.5;
    engine.connect(engineTone);
    growl.connect(growlGain).connect(engineTone);
    engineTone.connect(engineGain).connect(shiftGain).connect(master);
    engine.start();
    growl.start();

    const wind = audio.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    windTone = audio.createBiquadFilter();
    windTone.type = "bandpass";
    windTone.Q.value = 0.5;
    windGain = audio.createGain();
    windGain.gain.value = 0;
    wind.connect(windTone).connect(windGain).connect(master);
    wind.start();
  };

  return {
    crash() {
      burst(900, 0.7, 0.9, 90);
      burst(180, 0.45, 0.8, 50);
    },
    dispose() {
      shutDown();
    },
    drive(speed, throttle, revs, offRoad) {
      if (!context || !engine || !growl || !engineGain || !engineTone) {
        return;
      }
      const now = context.currentTime;
      const hertz = IDLE_HERTZ + (REDLINE_HERTZ - IDLE_HERTZ) * revs ** 1.1;
      engine.frequency.setTargetAtTime(hertz, now, 0.03);
      growl.frequency.setTargetAtTime(hertz / 2, now, 0.03);
      engineGain.gain.setTargetAtTime(
        0.06 + throttle * 0.1 + revs * 0.03,
        now,
        0.06
      );
      engineTone.frequency.setTargetAtTime(
        450 + throttle * 1500 + revs * 1200,
        now,
        0.08
      );
      const rush = Math.min(1, speed / RUSH_SPEED);
      windGain?.gain.setTargetAtTime(
        rush * rush * 0.26 + (offRoad ? 0.12 : 0),
        now,
        0.15
      );
      windTone?.frequency.setTargetAtTime(
        offRoad ? 240 : 500 + rush * 1100,
        now,
        0.15
      );
    },
    hit() {
      burst(260, 0.16, 0.7, 70);
      burst(1200, 0.08, 0.3, 300);
    },
    setMuted(next) {
      muted = next;
      master?.gain.setTargetAtTime(
        muted ? 0 : 0.8,
        context?.currentTime ?? 0,
        0.02
      );
    },
    shift() {
      if (!context || !shiftGain) {
        return;
      }
      const now = context.currentTime;
      shiftGain.gain.cancelScheduledValues(now);
      shiftGain.gain.setValueAtTime(0.25, now);
      shiftGain.gain.linearRampToValueAtTime(1, now + SHIFT_SECONDS);
      burst(1600, 0.05, 0.18, 700);
    },
    siren() {
      if (!context || !master) {
        return;
      }
      const now = context.currentTime;
      const tone = context.createOscillator();
      tone.type = "square";
      for (let step = 0; step < 4; step += 1) {
        tone.frequency.setValueAtTime(
          step % 2 === 0 ? SIREN_LOW : SIREN_HIGH,
          now + step * SIREN_STEP
        );
      }
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2200;
      const gain = context.createGain();
      const end = now + SIREN_STEP * 4;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.05);
      gain.gain.setValueAtTime(0.09, end - 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      tone.connect(filter).connect(gain).connect(master);
      tone.start(now);
      tone.stop(end);
    },
    swing() {
      burst(1800, 0.12, 0.3, 500);
    },
    thump(strength) {
      burst(140, 0.22, Math.min(0.9, 0.25 + strength * 0.5), 60);
    },
    unlock() {
      if (context) {
        void context.resume();
        return;
      }
      try {
        build();
      } catch {
        shutDown();
      }
    },
    weaponHit() {
      burst(120, 0.34, 0.95, 40);
      burst(520, 0.14, 0.55, 140);
      burst(2600, 0.06, 0.25, 900);
    },
    whoosh() {
      burst(1400, 0.35, 0.5, 260);
    },
  };
}
