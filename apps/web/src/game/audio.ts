const GEAR_TOPS = [15, 25, 35, 45, 54, 80];
const IDLE_HERTZ = 58;
const REDLINE_HERTZ = 235;

export interface Sound {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  drive: (speed: number, throttle: number, offRoad: boolean) => void;
  thump: (strength: number) => void;
  crash: () => void;
  whoosh: () => void;
  dispose: () => void;
}

function revs(speed: number): number {
  for (const top of GEAR_TOPS) {
    if (speed < top) {
      return Math.max(0.3, speed / top);
    }
  }
  return 1;
}

export function createSound(): Sound {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let engine: OscillatorNode | undefined;
  let growl: OscillatorNode | undefined;
  let engineGain: GainNode | undefined;
  let engineTone: BiquadFilterNode | undefined;
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

  return {
    crash() {
      burst(900, 0.7, 0.9, 90);
      burst(180, 0.45, 0.8, 50);
    },
    dispose() {
      void context?.close();
      context = undefined;
    },
    drive(speed, throttle, offRoad) {
      if (!context || !engine || !growl || !engineGain || !engineTone) {
        return;
      }
      const now = context.currentTime;
      const hertz =
        IDLE_HERTZ + (REDLINE_HERTZ - IDLE_HERTZ) * revs(speed) ** 1.25;
      engine.frequency.setTargetAtTime(hertz, now, 0.04);
      growl.frequency.setTargetAtTime(hertz / 2, now, 0.04);
      engineGain.gain.setTargetAtTime(0.07 + throttle * 0.11, now, 0.06);
      engineTone.frequency.setTargetAtTime(
        500 + throttle * 1700 + speed * 14,
        now,
        0.08
      );
      const rush = Math.min(1, speed / 60);
      windGain?.gain.setTargetAtTime(
        rush * rush * 0.22 + (offRoad ? 0.12 : 0),
        now,
        0.15
      );
      windTone?.frequency.setTargetAtTime(
        offRoad ? 240 : 500 + rush * 900,
        now,
        0.15
      );
    },
    setMuted(next) {
      muted = next;
      master?.gain.setTargetAtTime(
        muted ? 0 : 0.8,
        context?.currentTime ?? 0,
        0.02
      );
    },
    thump(strength) {
      burst(140, 0.22, Math.min(0.9, 0.25 + strength * 0.5), 60);
    },
    unlock() {
      if (context) {
        void context.resume();
        return;
      }
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(context.destination);

      noise = context.createBuffer(
        1,
        context.sampleRate * 2,
        context.sampleRate
      );
      const samples = noise.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = Math.random() * 2 - 1;
      }

      engineTone = context.createBiquadFilter();
      engineTone.type = "lowpass";
      engineTone.frequency.value = 600;
      engineGain = context.createGain();
      engineGain.gain.value = 0.07;
      engine = context.createOscillator();
      engine.type = "sawtooth";
      growl = context.createOscillator();
      growl.type = "square";
      const growlGain = context.createGain();
      growlGain.gain.value = 0.5;
      engine.connect(engineTone);
      growl.connect(growlGain).connect(engineTone);
      engineTone.connect(engineGain).connect(master);
      engine.start();
      growl.start();

      const wind = context.createBufferSource();
      wind.buffer = noise;
      wind.loop = true;
      windTone = context.createBiquadFilter();
      windTone.type = "bandpass";
      windTone.Q.value = 0.5;
      windGain = context.createGain();
      windGain.gain.value = 0;
      wind.connect(windTone).connect(windGain).connect(master);
      wind.start();
    },
    whoosh() {
      burst(1400, 0.35, 0.5, 260);
    },
  };
}
