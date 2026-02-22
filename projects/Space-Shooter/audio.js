/**
 * @fileoverview Manages all audio playback for the game.
 * Paths are relative to the Space-Shooter directory for static hosting.
 */
import { state } from './state.js';

const AUDIO_BASE = '../../assets/audio';

let backgroundMusic = null;
let masterMusicVolume = 1.0;
let masterSfxVolume = 1.0;
let audioUnlocked = false;

const soundCache = new Map();
const warnOnce = new Set();
const sfxCooldowns = new Map();

const soundSources = {
    background: `${AUDIO_BASE}/background.mp3`,
    boss: `${AUDIO_BASE}/bossfight.mp3`,
    voice: `${AUDIO_BASE}/bossvoiceline.wav`,
    boss_theme: `${AUDIO_BASE}/bossfight.mp3`,
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
    function unlock() {
        audioUnlocked = true;
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
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
    masterMusicVolume = vol;
    if (backgroundMusic) {
        const relativeVolume = 0.4;
        backgroundMusic.volume = relativeVolume * masterMusicVolume;
    }
}

export function setSfxVolume(vol) {
    masterSfxVolume = vol;
}

export function playMusic(track, options = {}) {
    const src = soundSources[track];
    if (!src) return;

    if (backgroundMusic && backgroundMusic.src.endsWith(src.split('/').pop()) && !backgroundMusic.paused) {
        return;
    }

    if (backgroundMusic) {
        backgroundMusic.pause();
    }

    if (!soundCache.has(src)) {
        soundCache.set(src, createAudioWithSources(src));
    }
    backgroundMusic = soundCache.get(src);

    backgroundMusic.loop = options.loop !== false;
    const relativeVolume = options.volume ?? 0.4;
    backgroundMusic.volume = relativeVolume * masterMusicVolume;
    backgroundMusic.currentTime = 0;
    const p = backgroundMusic.play();
    if (p && p.catch) {
        p.catch(e => { if (e?.name !== 'AbortError') console.warn('Music play failed:', e?.name || e); });
    }
}

export function stopMusic() {
    if (backgroundMusic) {
        backgroundMusic.pause();
        backgroundMusic = null;
    }
}

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
