// Small synthesized sound effects (Web Audio), so the game needs no audio
// files. Browsers only allow audio after a user gesture, so the runtime calls
// unlock() from its key handler; every effect is silent until then.
export function createSfx() {
  let ac = null;
  let master = null;
  let muted = false;

  function unlock() {
    if (!ac) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ac = new AudioCtx();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume();
  }

  function tone({ freq, to = freq, dur = 0.12, type = "sine", gain = 0.2, delay = 0 }) {
    if (!ac || muted) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Filtered noise burst for soft whooshes and thumps.
  function noise({ dur = 0.12, gain = 0.15, cutoff = 800, delay = 0 }) {
    if (!ac || muted) return;
    const t0 = ac.currentTime + delay;
    const length = Math.ceil(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const amp = ac.createGain();
    amp.gain.value = gain;
    source.connect(filter).connect(amp).connect(master);
    source.start(t0);
  }

  // Notes as semitone steps above a base frequency.
  function arpeggio(base, steps, { type = "square", gain = 0.05, gap = 0.07, dur = 0.14 } = {}) {
    steps.forEach((step, i) => {
      tone({ freq: base * Math.pow(2, step / 12), dur, type, gain, delay: i * gap });
    });
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    // Whoosh plus a low push-off thump.
    jump() {
      noise({ dur: 0.18, gain: 0.08, cutoff: 1800 });
      tone({ freq: 150, to: 70, dur: 0.12, type: "sine", gain: 0.12 });
    },
    land(impact) {
      noise({ dur: 0.1, gain: 0.04 + impact * 0.12, cutoff: 360 });
    },
    // Soft chirp as a mouse peeks out of a hole.
    peep() {
      tone({ freq: 2600, to: 3100, dur: 0.05, type: "triangle", gain: 0.03 });
    },
    squeak() {
      tone({ freq: 2100, to: 2900, dur: 0.07, type: "triangle", gain: 0.05 });
      tone({ freq: 2400, to: 3300, dur: 0.06, type: "triangle", gain: 0.04, delay: 0.09 });
    },
    // A springy "boop", then a happy chirp; longer streaks climb in pitch.
    boop(streak) {
      const lift = Math.pow(2, ((streak - 1) * 2) / 12);
      tone({ freq: 520 * lift, to: 980 * lift, dur: 0.1, type: "sine", gain: 0.16 });
      tone({ freq: 1900 * lift, to: 2500 * lift, dur: 0.06, type: "triangle", gain: 0.04, delay: 0.1 });
      tone({ freq: 2300 * lift, to: 2900 * lift, dur: 0.05, type: "triangle", gain: 0.035, delay: 0.17 });
    },
    // Grasshopper: a springy boing.
    boing() {
      tone({ freq: 260, to: 900, dur: 0.12, type: "sine", gain: 0.14 });
      tone({ freq: 900, to: 520, dur: 0.16, type: "sine", gain: 0.08, delay: 0.12 });
    },
    // Fly: a short dizzy buzz.
    buzz() {
      tone({ freq: 210, to: 150, dur: 0.22, type: "sawtooth", gain: 0.035 });
      tone({ freq: 230, to: 170, dur: 0.22, type: "sawtooth", gain: 0.025, delay: 0.04 });
    },
    // Bird: a happy two-note tweet.
    tweet() {
      tone({ freq: 2700, to: 3500, dur: 0.07, type: "sine", gain: 0.06 });
      tone({ freq: 3000, to: 3900, dur: 0.07, type: "sine", gain: 0.055, delay: 0.1 });
      tone({ freq: 3300, to: 4200, dur: 0.06, type: "sine", gain: 0.05, delay: 0.19 });
    },
    // The hanging lamp's shade knocked by the cat.
    lampTink() {
      tone({ freq: 1320, to: 1250, dur: 0.25, type: "triangle", gain: 0.03 });
    },
    // The scratching post's pompom toy batted by the cat: a little bell.
    jingle() {
      tone({ freq: 2093, to: 2050, dur: 0.18, type: "sine", gain: 0.04 });
      tone({ freq: 2637, to: 2600, dur: 0.16, type: "sine", gain: 0.03, delay: 0.05 });
    },
    // Claws caught in a curtain: a soft fwump of cloth and a surprised mew.
    stuck() {
      noise({ dur: 0.22, gain: 0.08, cutoff: 900 });
      tone({ freq: 760, to: 1180, dur: 0.12, type: "triangle", gain: 0.05, delay: 0.06 });
      tone({ freq: 1180, to: 820, dur: 0.2, type: "triangle", gain: 0.045, delay: 0.18 });
    },
    // Wriggling free: a quick rustle.
    unstuck() {
      noise({ dur: 0.1, gain: 0.06, cutoff: 1600 });
      noise({ dur: 0.08, gain: 0.04, cutoff: 1600, delay: 0.08 });
    },
    // The dog: a gruff, friendly "woof" (a low pitched-down tone with a puff
    // of noise), twice.
    bark() {
      for (const delay of [0, 0.2]) {
        tone({ freq: 330, to: 170, dur: 0.13, type: "sawtooth", gain: 0.07, delay });
        tone({ freq: 520, to: 260, dur: 0.1, type: "square", gain: 0.025, delay });
        noise({ dur: 0.08, gain: 0.06, cutoff: 1200, delay });
      }
    },
    // The dog bowling the cat over: a soft thud and a dizzy wobble.
    bump() {
      noise({ dur: 0.14, gain: 0.12, cutoff: 500 });
      tone({ freq: 600, to: 300, dur: 0.35, type: "triangle", gain: 0.05, delay: 0.05 });
      tone({ freq: 500, to: 700, dur: 0.25, type: "triangle", gain: 0.04, delay: 0.3 });
    },
    // Hopping clean over the dog.
    hopOver() {
      arpeggio(587, [0, 5, 9], { type: "triangle", gain: 0.06, gap: 0.06, dur: 0.12 });
    },
    // Wings taking off.
    flap() {
      noise({ dur: 0.08, gain: 0.05, cutoff: 900 });
      noise({ dur: 0.07, gain: 0.04, cutoff: 900, delay: 0.09 });
    },
    steal() {
      tone({ freq: 392, to: 196, dur: 0.38, type: "sawtooth", gain: 0.05 });
    },
    powerUp() {
      arpeggio(440, [0, 4, 7, 12, 16], { type: "triangle", gain: 0.07, gap: 0.05 });
    },
    waveStart() {
      arpeggio(392, [0, 7], { type: "triangle", gain: 0.07, gap: 0.12, dur: 0.2 });
    },
    waveClear() {
      arpeggio(523, [0, 4, 7, 12], { gain: 0.05, gap: 0.09, dur: 0.18 });
    },
    gameOver() {
      arpeggio(330, [0, -3, -7, -12], { type: "triangle", gain: 0.08, gap: 0.16, dur: 0.3 });
    }
  };
}
