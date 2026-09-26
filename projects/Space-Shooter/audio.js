/**
 * @fileoverview Manages all audio playback for the game.
 * Paths are relative to the Space-Shooter directory for static hosting.
 */
import { createMusicPlayer } from './systems/music.js';

const AUDIO_BASE = '../../assets/audio';

let masterSfxVolume = 1.0;
let audioUnlocked = false;
let unlockInitialized = false;
let motifContext = null;

const music = createMusicPlayer({
    createAudio(src) {
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.src = src;
        return audio;
    },
    onError(error, track) {
        const key = `music:${track}:${error?.name || 'error'}`;
        if (error?.name !== 'AbortError' && !warnOnce.has(key)) {
            warnOnce.add(key);
            console.warn(`Music could not play (${track}):`, error?.name || 'unsupported media');
        }
    },
});

// Exact pitches are authored in code; a generated soundtrack never carries the only clue.
export function playGateMotif(reverse = false) {
    if (!audioUnlocked || masterSfxVolume <= 0) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        motifContext ||= new AudioContext();
        motifContext.resume().catch(() => {});
        const notes = reverse ? [659.255, 523.251, 440] : [440, 523.251, 659.255];
        const t = motifContext.currentTime;
        notes.forEach((frequency, i) => {
            const voice = motifContext.createOscillator();
            const gain = motifContext.createGain();
            const start = t + i * 0.24;
            voice.type = 'sine'; voice.frequency.value = frequency;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(masterSfxVolume * 0.09, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
            voice.connect(gain); gain.connect(motifContext.destination);
            voice.start(start); voice.stop(start + 0.4);
            voice.onended = () => { voice.disconnect(); gain.disconnect(); };
        });
    } catch { /* Audio support cannot block play. */ }
}

const soundCache = new Map();
const warnOnce = new Set();
const sfxCooldowns = new Map();

const soundSources = {
    voice: `${AUDIO_BASE}/bossvoiceline.wav`,
    boss_intro: `${AUDIO_BASE}/bossvoiceline.wav`,
    laser: `${AUDIO_BASE}/laser.wav`,
    explosion: `${AUDIO_BASE}/explosion.mp3`,
    hit: `${AUDIO_BASE}/explosion.mp3`,
    shield_hit: `${AUDIO_BASE}/laser.wav`,
    shield_down: `${AUDIO_BASE}/explosion.mp3`,
    player_hit: `${AUDIO_BASE}/explosion.mp3`,
    boss_hit: `${AUDIO_BASE}/explosion.mp3`,
    shard_pickup: `${AUDIO_BASE}/laser.wav`,
    shard_deposit: `${AUDIO_BASE}/laser.wav`,
};

export function initAudioUnlock() {
    if (unlockInitialized) return;
    unlockInitialized = true;
    function unlock() {
        audioUnlocked = true;
        // Later gestures also retry a track if the browser rejected playback.
        music.unlock();
    }
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
}

function createAudioWithSources(srcBase) {
    const m = /\.(mp3|wav|ogg)$/i.exec(srcBase);
    const origExt = m ? m[1].toLowerCase() : 'mp3';
    const base = srcBase.replace(/\.(mp3|wav|ogg)$/i, '');
    const order = [origExt, ...['mp3', 'ogg', 'wav'].filter(e => e !== origExt)];
    const el = document.createElement('audio');
    el.preload = 'auto';
    for (const ext of order) {
        const s = document.createElement('source');
        s.src = `${base}.${ext}`;
        s.type = ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`;
        el.appendChild(s);
    }
    return el;
}

function getOrCreateAudio(key, src) {
    if (!src) return null;
    if (soundCache.has(key)) return soundCache.get(key);
    const el = createAudioWithSources(src);
    el.onerror = () => {
        const k = `missing:${key}`;
        if (!warnOnce.has(k)) {
            warnOnce.add(k);
            console.warn(`Audio missing or unsupported: ${src}`);
        }
    };
    soundCache.set(key, el);
    return el;
}


export function setMusicVolume(vol) {
    music.setVolume(vol);
}

export function setSfxVolume(vol) {
    masterSfxVolume = vol;
}

export function playMusic(track, options = {}) {
    music.play(track, options);
}

export function stopMusic() { music.stop(); }
export function getMusicStatus() { return music.status(); }

export function playSoundEffect(sound, volume = 0.5) {
    const src = soundSources[sound];
    if (!src) return;
    if (!audioUnlocked) return;

    const audio = getOrCreateAudio(sound, src);
    if (!audio) {
        const k = `missing:${sound}`;
        if (!warnOnce.has(k)) { warnOnce.add(k); console.warn(`SFX missing: ${sound} -> ${src}`); }
        return;
    }

    if (sound === 'boss_intro') volume = 0.45;

    audio.volume = volume * masterSfxVolume;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && p.catch) {
        p.catch(e => {
            const key = `${sound}:${e?.name || 'err'}`;
            if (e?.name !== 'AbortError' && !warnOnce.has(key)) {
                warnOnce.add(key);
                console.warn('SFX play failed:', e?.name || e);
            }
        });
    }
}

export function playSoundEffectThrottled(sound, volume = 0.5, cooldownMs = 120) {
    const now = performance.now();
    const next = sfxCooldowns.get(sound) || 0;
    if (now < next) return;
    sfxCooldowns.set(sound, now + cooldownMs);
    playSoundEffect(sound, volume);
}

export function playSfxThrottled(key, src, volume = 0.5, cooldownMs = 120) {
    if (!audioUnlocked) return;
    if (!src) {
        const k = `missing:${key}`;
        if (!warnOnce.has(k)) { warnOnce.add(k); console.warn(`SFX missing: ${key}`); }
        return;
    }
    const now = performance.now();
    const next = sfxCooldowns.get(key) || 0;
    if (now < next) return;
    sfxCooldowns.set(key, now + cooldownMs);

    const audio = getOrCreateAudio(key, src);
    if (!audio) return;
    audio.volume = volume * masterSfxVolume;
    try {
        audio.currentTime = 0;
        const p = audio.play();
        if (p && p.catch) {
            p.catch(e => {
                const w = `${key}:${e?.name || 'err'}`;
                if (e?.name !== 'AbortError' && !warnOnce.has(w)) {
                    warnOnce.add(w);
                    console.warn('SFX play failed:', e?.name || e);
                }
            });
        }
    } catch (e) {
        const w = `${key}:${e?.name || 'err'}`;
        if (e?.name !== 'AbortError' && !warnOnce.has(w)) {
            warnOnce.add(w);
            console.warn('SFX play threw:', e?.name || e);
        }
    }
}
