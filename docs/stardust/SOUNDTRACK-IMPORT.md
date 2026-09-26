# Stardust soundtrack import evidence

Imported 2026-09-26 from `C:\Users\Laptop\Downloads\StarDustBeats\`. The ten source MP3s were copied unchanged into the runtime destinations below; the source files remain in place. All ten filenames match the cue titles in [SUNO-PROMPTS.md](SUNO-PROMPTS.md). Source and runtime SHA-256 hashes match for all ten tracks. No re-encoding or audio edits were performed.

## Technical findings

All ten files have ID3v2.4.0 title and artist tags. Embedded Suno source comments contain a Suno song ID for every file. MPEG header/frame scanning found continuous MPEG-1 Layer III frames in all ten, each 48 kHz stereo with variable bitrate; observed frame bitrates span 32–320 kb/s. Durations below are sums of MPEG frame sample counts, so encoder delay/padding may make them differ slightly from audible duration.

| Cue | Embedded title | Duration | Source bytes | Runtime file |
| --- | --- | ---: | ---: | --- |
| `ST-MENU` | Stardust: Quiet Orbit | 153.648 s | 3,464,631 | `assets/audio/stardust/menu.mp3` |
| `ST-L1` | Alpha Relay: Open Thrust | 59.616 s | 1,403,226 | `assets/audio/stardust/alpha-relay.mp3` |
| `ST-L2` | Beacon Prime: Gravity Well | 69.024 s | 1,655,187 | `assets/audio/stardust/beacon-prime.mp3` |
| `ST-L3` | Dustfall Station: Narrow Drift | 89.448 s | 2,091,519 | `assets/audio/stardust/dustfall-station.mp3` |
| `ST-L4` | Nether Crossing: Predictive Fire | 60.048 s | 1,541,129 | `assets/audio/stardust/nether-crossing.mp3` |
| `ST-L5` | Iron Veil: The Exam | 61.176 s | 1,457,344 | `assets/audio/stardust/iron-veil.mp3` |
| `ST-SECRET` | Reverse Gate: The Other Side | 69.648 s | 1,530,681 | `assets/audio/stardust/reverse-gate.mp3` |
| `ST-WARDEN` | Warden: Mirrored Gravity | 60.024 s | 1,447,927 | `assets/audio/stardust/warden.mp3` |
| `ST-RIDDLE` | Anomalous Seal: Four Echoes | 74.448 s | 1,606,634 | `assets/audio/stardust/seal-riddle.mp3` |
| `ST-WIN` | Warden Down: Safe Passage | 59.736 s | 1,405,331 | `assets/audio/stardust/victory.mp3` |

The menu file is about 2:34 by frame count; the riddle file is about 1:14, shorter than its two-minute puzzle timer. The riddle repeats until the seal is solved or expires. Menu, sector, secret and Warden tracks also repeat; victory plays once. Cue transitions crossfade over 800 ms with at most two active music elements, respecting the music slider and mute. Music starts on user input and retries after browser playback interruptions on a fresh gesture.

All ten complete files decoded to finite, non-silent PCM through Edge's WebAudio decoder, and every media playhead advanced in the browser. Source peaks range from -6.05 to -2.72 dBFS, with no decoded samples over full scale. At a -60 dBFS threshold, Alpha ends with about 0.53 seconds of near-silence, Beacon with 1.03 seconds and Warden with 0.21 seconds. **Full-track repetition is implemented; seamless musical loops and subjective mix quality are not verified.** A listening pass should decide final loop cuts and relative balance. Detailed measurements are in [audio-browser.json](evidence/audio-browser.json); RMS measurements are not LUFS loudness.

## Integrity limits and rights record

`ffmpeg`, `ffprobe`, `MediaInfo`, Mutagen, and a PCM decoder were not available in this frame-scan environment. This inspection verified file size, SHA-256, ID3 fields, and MP3 frame-header continuity; **that frame scan is not a full decode**. Full-file browser decoding and decoded peak/RMS/silence measurements are tracked separately in [audio-browser.json](evidence/audio-browser.json) by the parent task. Do not treat a clean frame scan as listening QA or loop verification.

The user attested on 2026-09-26 that all ten songs were both created and downloaded while a paid Suno plan was active. This is recorded as a user attestation only; subscription receipts/account records were not independently inspected. Per [MUSIC-LICENSE-CHECKLIST.md](MUSIC-LICENSE-CHECKLIST.md), this supports proceeding with local integration while retaining the distinction between attestation and independent evidence.

Exact source filenames, byte counts, SHA-256 hashes, song IDs, tag values, frame counts, and measurement limitations are machine-readable in [audio-inspection.json](evidence/audio-inspection.json). No subjective musical QC is claimed here.
