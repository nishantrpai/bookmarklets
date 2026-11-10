
// ==UserScript==
// @name         Hyperliquid Adaptive Orchestra
// @namespace    market-orchestra
// @version      8.0
// @description  Live market-price music with configurable instruments, drums and effects
// @match        https://app.hyperliquid.xyz/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const CONFIG = {
    bpm: 80,
    beatVolume: 0.16,
    kickVolume: 0.75,
    snareVolume: 0.42,
    hatVolume: 0.15,
    kickOffset: 0,
    snareOffset: 0,
    hatOffset: 0,
    hatSubdivision: 2,

    delayTime: 0.24,
    delayFeedback: 0.22,
    delayWet: 0.18,

    melodyVolume: 0.24,
    chordVolume: 0.045,
    melodyInstrument: 'piano',
    chordInstrument: 'warm',
    scale: 'pentatonic',
    startingKey: 0,
    keyShiftDelay: 30,
    adaptiveKey: true,

    // One semitone per this many basis points of price movement.
    priceSensitivity: 25,
    priceVolume: 0.12
  };

  const SCALES = {
    pentatonic: [0, 2, 4, 7, 9],
    major: [0, 2, 4, 5, 7, 9, 11]
  };

  const INSTRUMENTS = {
    piano: {
      waves: ['triangle', 'sine'],
      mix: [0.8, 0.2],
      attack: 0.008,
      release: 0.7,
      cutoff: 3200,
      transient: 1.5
    },
    warm: {
      waves: ['triangle', 'sine'],
      mix: [0.45, 0.55],
      attack: 0.08,
      release: 1.3,
      cutoff: 1500,
      transient: 0.8
    },
    electric: {
      waves: ['sine', 'triangle'],
      mix: [0.65, 0.35],
      attack: 0.015,
      release: 1.1,
      cutoff: 2600,
      transient: 1.1
    },
    organ: {
      waves: ['sine', 'sine', 'sine'],
      mix: [0.55, 0.3, 0.15],
      attack: 0.025,
      release: 0.35,
      cutoff: 4000,
      transient: 0.7,
      detune: [0, 1200, 1900]
    },
    strings: {
      waves: ['sawtooth', 'triangle'],
      mix: [0.2, 0.8],
      attack: 0.22,
      release: 1.8,
      cutoff: 1300,
      transient: 0.5
    },
    flute: {
      waves: ['sine', 'triangle'],
      mix: [0.85, 0.15],
      attack: 0.12,
      release: 0.8,
      cutoff: 2200,
      transient: 0.5
    },
    pluck: {
      waves: ['triangle', 'sine'],
      mix: [0.7, 0.3],
      attack: 0.003,
      release: 0.28,
      cutoff: 3500,
      transient: 1.8
    }
  };

  let audio, master, delayNode, delayFeedback, delayWet;
  let melodyGain, drumGain;
  let bookObserver, markObserver, waitingObserver;
  let beatTimer = null;
  let nextBeatTime = 0;
  let nextHatTime = 0;
  let beatNumber = 0;
  let running = false;
  let rootShift = 0;
  let lastKeyShift = 0;
  let previousBook = new Map();
  let marketTimer = null;
  let markPrice = null;
  let previousMarkPrice = null;
  let anchorPrice = null;
  let lastPriceSound = 0;

  // ---------- User interface ----------

  const panel = document.createElement('div');
  panel.id = 'market-orchestra-panel';

  panel.innerHTML = `
    <div class="mo-head">
      <b>Market Orchestra v8</b>
      <button id="mo-toggle">START</button>
      <button id="mo-stop">STOP</button>
    </div>

    <div class="mo-section">
      <b>Beat</b>
      <label>BPM <span id="mo-bpm-val"></span>
        <input id="mo-bpm" type="range" min="40" max="180" value="${CONFIG.bpm}">
      </label>
      <label>Beat volume <span id="mo-beat-val"></span>
        <input id="mo-beat" type="range" min="0" max="100" value="${CONFIG.beatVolume * 100}">
      </label>
      <label>Kick volume <span id="mo-kick-val"></span>
        <input id="mo-kick" type="range" min="0" max="100" value="${CONFIG.kickVolume * 100}">
      </label>
      <label>Snare volume <span id="mo-snare-val"></span>
        <input id="mo-snare" type="range" min="0" max="100" value="${CONFIG.snareVolume * 100}">
      </label>
      <label>Hi-hat volume <span id="mo-hat-val"></span>
        <input id="mo-hat" type="range" min="0" max="100" value="${CONFIG.hatVolume * 100}">
      </label>
    </div>

    <div class="mo-section">
      <b>Beat timing</b>
      <label>Kick offset <span id="mo-kick-offset-val"></span>
        <input id="mo-kick-offset" type="range" min="-100" max="100" value="${CONFIG.kickOffset}">
      </label>
      <label>Snare offset <span id="mo-snare-offset-val"></span>
        <input id="mo-snare-offset" type="range" min="-100" max="100" value="${CONFIG.snareOffset}">
      </label>
      <label>Hi-hat offset <span id="mo-hat-offset-val"></span>
        <input id="mo-hat-offset" type="range" min="-100" max="100" value="${CONFIG.hatOffset}">
      </label>
      <label>Hi-hat interval
        <select id="mo-hat-sub">
          <option value="1">Every beat</option>
          <option value="2" selected>Every eighth note</option>
          <option value="4">Every sixteenth note</option>
        </select>
      </label>
    </div>

    <div class="mo-section">
      <b>Audio delay / echo</b>
      <label>Delay time <span id="mo-delay-time-val"></span>
        <input id="mo-delay-time" type="range" min="50" max="1000" value="${CONFIG.delayTime * 1000}">
      </label>
      <label>Feedback <span id="mo-feedback-val"></span>
        <input id="mo-feedback" type="range" min="0" max="85" value="${CONFIG.delayFeedback * 100}">
      </label>
      <label>Wet level <span id="mo-wet-val"></span>
        <input id="mo-wet" type="range" min="0" max="100" value="${CONFIG.delayWet * 100}">
      </label>
    </div>

    <div class="mo-section">
      <b>Instruments</b>
      <label>Melody instrument
        <select id="mo-melody-instrument">
          <option value="piano">Piano</option>
          <option value="warm">Warm keys</option>
          <option value="electric">Electric piano</option>
          <option value="organ">Organ</option>
          <option value="strings">Strings</option>
          <option value="flute">Flute</option>
          <option value="pluck">Pluck</option>
        </select>
      </label>
      <label>Chord instrument
        <select id="mo-chord-instrument">
          <option value="piano">Piano</option>
          <option value="warm" selected>Warm keys</option>
          <option value="electric">Electric piano</option>
          <option value="organ">Organ</option>
          <option value="strings">Strings</option>
          <option value="flute">Flute</option>
          <option value="pluck">Pluck</option>
        </select>
      </label>
      <label>Melody volume <span id="mo-melody-val"></span>
        <input id="mo-melody" type="range" min="0" max="100" value="${CONFIG.melodyVolume * 100}">
      </label>
      <label>Chord volume <span id="mo-chord-val"></span>
        <input id="mo-chord" type="range" min="0" max="100" value="${CONFIG.chordVolume * 100}">
      </label>
    </div>

    <div class="mo-section">
      <b>Market price music</b>
      <div id="mo-mark-price">Mark price: waiting...</div>
      <label>Price sensitivity <span id="mo-sensitivity-val"></span>
        <input id="mo-sensitivity" type="range" min="5" max="100" value="${CONFIG.priceSensitivity}">
      </label>
      <label>Price response volume <span id="mo-price-volume-val"></span>
        <input id="mo-price-volume" type="range" min="0" max="100" value="${CONFIG.priceVolume * 100}">
      </label>
    </div>

    <div class="mo-section">
      <b>Music settings</b>
      <label>Scale
        <select id="mo-scale">
          <option value="pentatonic">Pentatonic</option>
          <option value="major">Major</option>
        </select>
      </label>
      <label>Starting key
        <select id="mo-key">
          ${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
            .map((k, i) => `<option value="${i}">${k}</option>`).join('')}
        </select>
      </label>
      <label>Key shift interval <span id="mo-key-delay-val"></span>
        <input id="mo-key-delay" type="range" min="5" max="180" value="${CONFIG.keyShiftDelay}">
      </label>
      <label class="mo-check">
        <input id="mo-adaptive" type="checkbox" checked> Adaptive key
      </label>
    </div>

    <div id="mo-status">Stopped</div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #market-orchestra-panel {
      position:fixed; z-index:999999; top:90px; right:18px;
      width:270px; max-height:82vh; overflow:auto;
      padding:12px; border-radius:9px;
      background:#17191f; color:#eee;
      font:12px Arial,sans-serif; box-shadow:0 3px 18px #0009;
    }
    #market-orchestra-panel * { box-sizing:border-box; }
    #market-orchestra-panel .mo-head {
      display:flex; align-items:center; gap:6px; margin-bottom:10px;
    }
    #market-orchestra-panel .mo-head b { flex:1; font-size:14px; }
    #market-orchestra-panel button {
      background:#343a46; color:white; border:0;
      border-radius:4px; padding:6px 9px; cursor:pointer;
    }
    #market-orchestra-panel .mo-section {
      border-top:1px solid #393d48; padding:9px 0;
    }
    #market-orchestra-panel .mo-section > b {
      display:block; margin-bottom:8px; color:#aebbd0;
    }
    #market-orchestra-panel label { display:block; margin:8px 0; }
    #market-orchestra-panel label span {
      float:right; color:#9eb9e8;
    }
    #market-orchestra-panel input[type=range] {
      display:block; width:100%; margin-top:5px;
    }
    #market-orchestra-panel select {
      display:block; width:100%; margin-top:5px;
      padding:4px; background:#292e38; color:white;
      border:1px solid #555; border-radius:4px;
    }
    #market-orchestra-panel .mo-check { display:flex; gap:7px; }
    #mo-status,#mo-mark-price { color:#9eb9e8; padding-top:7px; }
  `;

  document.head.appendChild(style);
  document.body.appendChild(panel);

  const $ = id => document.getElementById('mo-' + id);

  function bindRange(id, key, divisor = 1, suffix = '') {
    const input = $(id);
    const output = $(id + '-val');

    const update = () => {
      CONFIG[key] = Number(input.value) / divisor;
      output.textContent = input.value + suffix;
      updateAudioSettings();
    };

    input.addEventListener('input', update);
    update();
  }

  bindRange('bpm', 'bpm');
  bindRange('beat', 'beatVolume', 100, '%');
  bindRange('kick', 'kickVolume', 100, '%');
  bindRange('snare', 'snareVolume', 100, '%');
  bindRange('hat', 'hatVolume', 100, '%');
  bindRange('kick-offset', 'kickOffset', 1, ' ms');
  bindRange('snare-offset', 'snareOffset', 1, ' ms');
  bindRange('hat-offset', 'hatOffset', 1, ' ms');
  bindRange('delay-time', 'delayTime', 1000, ' ms');
  bindRange('feedback', 'delayFeedback', 100, '%');
  bindRange('wet', 'delayWet', 100, '%');
  bindRange('melody', 'melodyVolume', 100, '%');
  bindRange('chord', 'chordVolume', 100, '%');
  bindRange('key-delay', 'keyShiftDelay', 1, ' sec');
  bindRange('sensitivity', 'priceSensitivity', 1, ' bps');
  bindRange('price-volume', 'priceVolume', 100, '%');

  $('hat-sub').addEventListener('change', e => {
    CONFIG.hatSubdivision = Number(e.target.value);
  });

  $('melody-instrument').value = CONFIG.melodyInstrument;
  $('melody-instrument').addEventListener('change', e => {
    CONFIG.melodyInstrument = e.target.value;
  });

  $('chord-instrument').value = CONFIG.chordInstrument;
  $('chord-instrument').addEventListener('change', e => {
    CONFIG.chordInstrument = e.target.value;
  });

  $('scale').value = CONFIG.scale;
  $('scale').addEventListener('change', e => {
    CONFIG.scale = e.target.value;
  });

  $('key').value = CONFIG.startingKey;
  $('key').addEventListener('change', e => {
    CONFIG.startingKey = Number(e.target.value);
    rootShift = 0;
    anchorPrice = markPrice;
  });

  $('adaptive').addEventListener('change', e => {
    CONFIG.adaptiveKey = e.target.checked;
  });

  // ---------- Audio engine ----------

  function initializeAudio() {
    if (audio) {
      if (audio.state === 'suspended') audio.resume();
      master.gain.setTargetAtTime(1, audio.currentTime, 0.03);
      delayWet.gain.setTargetAtTime(CONFIG.delayWet, audio.currentTime, 0.03);
      return;
    }

    audio = new (window.AudioContext || window.webkitAudioContext)();

    master = audio.createGain();
    melodyGain = audio.createGain();
    drumGain = audio.createGain();

    melodyGain.gain.value = CONFIG.melodyVolume;
    drumGain.gain.value = CONFIG.beatVolume;

    delayNode = audio.createDelay(2);
    delayFeedback = audio.createGain();
    delayWet = audio.createGain();

    delayNode.delayTime.value = CONFIG.delayTime;
    delayFeedback.gain.value = CONFIG.delayFeedback;
    delayWet.gain.value = CONFIG.delayWet;

    melodyGain.connect(master);
    drumGain.connect(master);
    master.connect(audio.destination);
    master.connect(delayNode);

    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayWet);
    delayWet.connect(audio.destination);
  }

  function updateAudioSettings() {
    if (!audio) return;
    const now = audio.currentTime;

    melodyGain.gain.setTargetAtTime(CONFIG.melodyVolume, now, 0.03);
    drumGain.gain.setTargetAtTime(CONFIG.beatVolume, now, 0.03);
    delayNode.delayTime.setTargetAtTime(CONFIG.delayTime, now, 0.03);
    delayFeedback.gain.setTargetAtTime(CONFIG.delayFeedback, now, 0.03);
    delayWet.gain.setTargetAtTime(CONFIG.delayWet, now, 0.03);
  }

  // ---------- Instrument synthesis ----------

  function playNote(midi, duration = 0.5, volume = 0.1, instrumentName = 'piano') {
    if (!audio || !running || volume <= 0) return;

    const profile = INSTRUMENTS[instrumentName] || INSTRUMENTS.piano;
    const now = audio.currentTime;
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);

    const filter = audio.createBiquadFilter();
    const envelope = audio.createGain();

    filter.type = 'lowpass';
    filter.frequency.value = profile.cutoff;

    const attack = profile.attack;
    const end = now + Math.max(duration, attack + 0.08);

    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(
      Math.max(0.0002, volume), now + attack
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    filter.connect(envelope);
    envelope.connect(melodyGain);

    profile.waves.forEach((wave, index) => {
      const osc = audio.createOscillator();
      const oscGain = audio.createGain();

      osc.type = wave;
      osc.frequency.value = frequency;

      if (profile.detune) {
        osc.detune.value = profile.detune[index] || 0;
      }

      oscGain.gain.value = profile.mix[index];
      osc.connect(oscGain);
      oscGain.connect(filter);

      osc.start(now);
      osc.stop(end + 0.04);
    });

    // Short attack transient gives piano and pluck sounds more definition.
    if (profile.transient > 1) {
      const transient = audio.createOscillator();
      const transientGain = audio.createGain();

      transient.type = 'sine';
      transient.frequency.value = frequency * 2;
      transientGain.gain.setValueAtTime(volume * 0.18, now);
      transientGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      transient.connect(transientGain);
      transientGain.connect(melodyGain);
      transient.start(now);
      transient.stop(now + 0.05);
    }
  }

  function playChord(degree, volume = CONFIG.chordVolume) {
    const scale = SCALES[CONFIG.scale];
    const notes = [degree, degree + 2, degree + 4];

    notes.forEach((d, i) => {
      playNote(
        scaleMidi(d, i === 2 ? 1 : 0),
        1.8,
        volume,
        CONFIG.chordInstrument
      );
    });
  }

  // ---------- Drum synthesis ----------

  function drumEnvelope(gain, time, peak, duration) {
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peak), time + 0.005
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  }

  function playKick(time) {
    if (!audio || CONFIG.kickVolume <= 0) return;

    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.13);

    drumEnvelope(gain, time, CONFIG.kickVolume, 0.24);
    osc.connect(gain);
    gain.connect(drumGain);
    osc.start(time);
    osc.stop(time + 0.26);
  }

  function playSnare(time) {
    if (!audio || CONFIG.snareVolume <= 0) return;

    const length = Math.floor(audio.sampleRate * 0.19);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const noiseGain = audio.createGain();

    noise.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 1200;

    drumEnvelope(noiseGain, time, CONFIG.snareVolume, 0.17);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(drumGain);
    noise.start(time);

    const body = audio.createOscillator();
    const bodyGain = audio.createGain();

    body.type = 'triangle';
    body.frequency.value = 180;

    drumEnvelope(bodyGain, time, CONFIG.snareVolume * 0.3, 0.12);
    body.connect(bodyGain);
    bodyGain.connect(drumGain);
    body.start(time);
    body.stop(time + 0.14);
  }

  function playHat(time) {
    if (!audio || CONFIG.hatVolume <= 0) return;

    const length = Math.floor(audio.sampleRate * 0.045);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();

    noise.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 6500;

    drumEnvelope(gain, time, CONFIG.hatVolume, 0.045);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(drumGain);
    noise.start(time);
  }

  // ---------- Clock scheduler ----------

  function scheduleBeat() {
    if (!running || !audio) return;

    const now = audio.currentTime;
    const secondsPerBeat = 60 / CONFIG.bpm;
    const lookAhead = 0.12;

    while (nextBeatTime < now + lookAhead) {
      const beat = beatNumber % 4;
      const offset = beat === 0 || beat === 2
        ? CONFIG.kickOffset
        : CONFIG.snareOffset;

      const hitTime = Math.max(
        now + 0.005,
        nextBeatTime + offset / 1000
      );

      if (beat === 0 || beat === 2) playKick(hitTime);
      else playSnare(hitTime);

      nextBeatTime += secondsPerBeat;
      beatNumber++;
    }

    const hatInterval = secondsPerBeat / CONFIG.hatSubdivision;

    while (nextHatTime < now + lookAhead) {
      playHat(Math.max(
        now + 0.005,
        nextHatTime + CONFIG.hatOffset / 1000
      ));
      nextHatTime += hatInterval;
    }
  }

  function startBeat() {
    stopBeat();

    const now = audio.currentTime;
    nextBeatTime = now + 0.08;
    nextHatTime = now + 0.08;
    beatNumber = 0;
    running = true;

    beatTimer = setInterval(scheduleBeat, 25);
    scheduleBeat();
  }

  function stopBeat() {
    running = false;
    if (beatTimer) clearInterval(beatTimer);
    beatTimer = null;
  }

  // ---------- Price-driven music ----------

  function currentRoot() {
    return (CONFIG.startingKey + rootShift + 12) % 12;
  }

  function scaleMidi(degree, octave = 0) {
    const scale = SCALES[CONFIG.scale];
    const index = ((degree % scale.length) + scale.length) % scale.length;
    const extraOctaves = Math.floor(degree / scale.length);

    return 48 + currentRoot() + scale[index] +
      (octave + extraOctaves) * 12;
  }

  function updateTonalCentre() {
    if (!CONFIG.adaptiveKey) return;

    const now = Date.now();
    if (now - lastKeyShift < CONFIG.keyShiftDelay * 1000) return;

    lastKeyShift = now;
    rootShift = (rootShift + 2) % 12;
  }

  function processMarkPrice(price) {
    if (!Number.isFinite(price) || price <= 0) return;

    markPrice = price;
    $('mark-price').textContent = 'Mark price: ' + price.toLocaleString();

    if (anchorPrice === null) {
      anchorPrice = price;
      previousMarkPrice = price;
      return;
    }

    if (previousMarkPrice === price) return;

    const oldPrice = previousMarkPrice;
    previousMarkPrice = price;

    if (!running || !audio) return;

    const now = Date.now();
    if (now - lastPriceSound < 100) return;
    lastPriceSound = now;

    updateTonalCentre();

    // Relative movement from the anchor determines pitch displacement.
    const basisPoints = 10000 * Math.log(price / anchorPrice);
    const semitoneShift = Math.max(-12, Math.min(12,
      Math.round(basisPoints / CONFIG.priceSensitivity)
    ));

    const direction = price > oldPrice ? 1 : -1;
    const scale = SCALES[CONFIG.scale];

    // Price level selects a scale degree; price movement shifts the octave/register.
    const degree = ((Math.abs(semitoneShift) % scale.length) +
      scale.length) % scale.length;

    const midi = scaleMidi(degree) + semitoneShift;
    const movement = Math.abs(10000 * Math.log(price / oldPrice));

    const volume = Math.min(
      0.4,
      CONFIG.priceVolume * (0.35 + movement / 8)
    );

    playNote(
      midi,
      0.55,
      volume,
      CONFIG.melodyInstrument
    );

    // Stronger price moves create a chord response.
    if (movement > 0.15) {
      const chordDegree = direction > 0
        ? degree
        : (degree + 2) % scale.length;

      playChord(chordDegree);
    }
  }

  // ---------- Order-book music ----------

  function processMarketChange(changes) {
    if (!changes.length || !running) return;

    updateTonalCentre();

    const scale = SCALES[CONFIG.scale];

    const strongest = changes
      .sort((a, b) => b.size - a.size)
      .slice(0, 3);

    strongest.forEach((change, index) => {
      const degree = Math.abs(Math.round(change.price * 10)) % scale.length;
      const volume = Math.min(
        0.35,
        0.06 + Math.log1p(change.size) * 0.035
      );

      playNote(
        scaleMidi(degree, index === 0 ? 1 : 0),
        0.45,
        volume,
        CONFIG.melodyInstrument
      );
    });

    const imbalance = changes.reduce((sum, c) =>
      sum + (c.side === 'bid' ? c.size : -c.size), 0);

    const chordDegree = Math.abs(Math.round(imbalance)) % scale.length;
    playChord(chordDegree);
  }

  // ---------- Order-book reader ----------

  function parseNumber(value) {
    if (!value) return 0;
    const number = Number(value.replace(/[$,\s]/g, ''));
    return Number.isFinite(number) ? number : 0;
  }

  function parseBook() {
    const rows = document.querySelectorAll(
      '#marketDataContent [data-order-book-row="true"]'
    );

    const book = new Map();

    rows.forEach(row => {
      const cells = row.querySelectorAll('.monospaced');
      if (cells.length < 2) return;

      const price = parseNumber(cells[0].textContent);
      const size = parseNumber(cells[1].textContent);
      if (!price || !size) return;

      const style = row.getAttribute('style') || '';
      const side = style.includes('237') ? 'ask' : 'bid';

      book.set(side + ':' + price, { price, size, side });
    });

    return book;
  }

  function processBook() {
    const currentBook = parseBook();
    if (!currentBook.size) return;

    const changes = [];

    currentBook.forEach((item, key) => {
      const previous = previousBook.get(key);

      if (!previous || previous.size !== item.size) {
        changes.push({
          ...item,
          size: Math.abs(item.size - (previous ? previous.size : 0))
        });
      }
    });

    previousBook = currentBook;

    if (changes.length) {
      clearTimeout(marketTimer);
      marketTimer = setTimeout(
        () => processMarketChange(changes),
        70
      );
    }
  }

  // ---------- Mark price reader ----------

  function findMarkElement() {
    const candidates = document.querySelectorAll(
      '#marketDataContent .sc-idXgbr, body .sc-idXgbr'
    );

    for (const label of candidates) {
      if (label.textContent.trim() !== 'Mark') continue;

      const card = label.closest('.sc-bjfHbI');
      if (!card) continue;

      const value = card.querySelector('.monospaced');
      if (!value) continue;

      const price = parseNumber(value.textContent);
      if (price > 0) return { element: value, price };
    }

    return null;
  }

  function attachMarkObserver() {
    const found = findMarkElement();
    if (!found) return false;

    if (markObserver) markObserver.disconnect();

    processMarkPrice(found.price);

    markObserver = new MutationObserver(() => {
      const price = parseNumber(found.element.textContent);
      if (price > 0) processMarkPrice(price);
    });

    markObserver.observe(found.element, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return true;
  }

  // ---------- Observers ----------

  function attachToBook() {
    const target = document.querySelector('#marketDataContent');
    if (!target) return false;

    if (bookObserver) bookObserver.disconnect();

    bookObserver = new MutationObserver(processBook);
    bookObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    previousBook = parseBook();
    $('status').textContent = 'Connected to order book';

    attachMarkObserver();
    return true;
  }

  function waitForBook() {
    if (attachToBook()) return;

    $('status').textContent = 'Waiting for order book...';

    if (waitingObserver) waitingObserver.disconnect();

    waitingObserver = new MutationObserver(() => {
      const bookReady = attachToBook();
      const markReady = attachMarkObserver();

      if (bookReady && markReady) waitingObserver.disconnect();
    });

    waitingObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ---------- Start / Stop ----------

  async function start() {
    initializeAudio();
    await audio.resume();

    updateAudioSettings();
    startBeat();
    waitForBook();

    $('toggle').textContent = 'RUNNING';
    $('status').textContent = 'Beat running';
  }

  function stop() {
    stopBeat();

    if (bookObserver) bookObserver.disconnect();
    if (markObserver) markObserver.disconnect();
    if (waitingObserver) waitingObserver.disconnect();

    clearTimeout(marketTimer);
    previousBook.clear();

    if (master && audio) {
      master.gain.cancelScheduledValues(audio.currentTime);
      master.gain.setValueAtTime(0, audio.currentTime);

      delayWet.gain.cancelScheduledValues(audio.currentTime);
      delayWet.gain.setValueAtTime(0, audio.currentTime);
    }

    $('toggle').textContent = 'START';
    $('status').textContent = 'Stopped';
  }

  $('toggle').addEventListener('click', start);
  $('stop').addEventListener('click', stop);

})();
