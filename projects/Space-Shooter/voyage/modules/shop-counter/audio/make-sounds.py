#!/usr/bin/env python3
"""Synthesises the shop counter's eight sound effects with the standard library only (seeded, repeatable), then
encodes ogg and mp3 with ffmpeg. Run from this folder:  python3 make-sounds.py
Nothing here is sampled: shutter, lift, knock, coins, till, glass, broke, stamp are all built from sines, decaying
partials and filtered noise. They are placeholders good enough to play; a sound designer can replace the files
with the same names."""
import math, random, struct, subprocess, wave, os

SR = 44100
def t_axis(d): return [i / SR for i in range(int(d * SR))]

def env_exp(t, tau): return math.exp(-t / tau)

def lowpass(xs, a):
    y, out = 0.0, []
    for x in xs:
        y += a * (x - y); out.append(y)
    return out

def highpass(xs, a):
    lp = lowpass(xs, a)
    return [x - l for x, l in zip(xs, lp)]

def noise(n, rng): return [rng.uniform(-1, 1) for _ in range(n)]

def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for tr in tracks:
        for i, v in enumerate(tr): out[i] += v
    return out

def place(sig, at, total):
    pad = int(at * SR)
    return ([0.0] * pad + sig + [0.0] * total)[:total]

def partial(freq, dur, tau, amp, phase=0.0, vib=0.0):
    return [amp * math.sin(2 * math.pi * freq * (1 + vib * math.sin(40 * t)) * t + phase) * env_exp(t, tau) for t in t_axis(dur)]

def fade(sig, a=0.004, b=0.01):
    n = len(sig); na, nb = int(a * SR), int(b * SR)
    return [v * min(1.0, i / max(1, na)) * min(1.0, (n - i) / max(1, nb)) for i, v in enumerate(sig)]

def norm(sig, peak=0.8):
    m = max(abs(v) for v in sig) or 1.0
    return [v * peak / m for v in sig]

def write(name, sig):
    path = f'{name}.wav'
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v)) * 32767)) for v in sig))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-c:a', 'libvorbis', '-q:a', '4', f'{name}.ogg'], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-c:a', 'libmp3lame', '-q:a', '4', f'{name}.mp3'], check=True)
    os.remove(path)

def shutter(rng):
    d = 1.25; n = int(d * SR)
    base = lowpass(noise(n, rng), 0.18)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = 18 + 16 * (t / d)               # the slats clatter faster as it rolls
        phase += 2 * math.pi * f / SR
        am = 0.55 + 0.45 * max(0.0, math.sin(phase)) ** 2
        e = min(1.0, t / 0.08) * min(1.0, (d - t) / 0.25) * 0.8
        out.append(base[i] * am * e * 2.2)
    rumble = [0.25 * math.sin(2 * math.pi * (52 + 8 * t) * t) * min(1.0, t / 0.1) * min(1.0, (d - t) / 0.3) for t in t_axis(d)]
    clunk = place(partial(70, 0.3, 0.07, 0.9) + [], 1.0, n)
    click = place([v * 0.6 * env_exp(i / SR, 0.01) for i, v in enumerate(noise(int(0.05 * SR), rng))], 1.0, n)
    return norm(fade(mix(out, rumble, clunk, click)), 0.8)

def lift(rng):
    d = 0.24; ts = t_axis(d)
    sweep, ph = [], 0.0
    for t in ts:
        ph += 2 * math.pi * (260 + 520 * (t / d)) / SR
        sweep.append(math.sin(ph) * math.sin(math.pi * t / d) * 0.5)
    air = [v * math.sin(math.pi * i / (d * SR)) * 0.25 for i, v in enumerate(highpass(noise(len(ts), rng), 0.25))]
    return norm(fade(mix(sweep, air)), 0.55)

def knock(rng):
    d = 0.18
    body = mix(partial(110, d, 0.04, 1.0), partial(220, d, 0.025, 0.4), partial(330, d, 0.015, 0.15))
    tick = [v * 0.5 * env_exp(i / SR, 0.004) for i, v in enumerate(lowpass(noise(int(d * SR), rng), 0.4))]
    return norm(fade(mix(body, tick), 0.001, 0.02), 0.75)

def coins(rng):
    total = int(0.9 * SR)
    tracks = []
    t0 = 0.0
    for k in range(7):
        t0 += rng.uniform(0.05, 0.11)
        f = rng.choice([2093, 2349, 2637, 3136, 2794])
        ping = mix(partial(f, 0.35, 0.09, 0.6), partial(f * 2.76, 0.2, 0.04, 0.3), partial(f * 5.4, 0.12, 0.02, 0.15))
        tracks.append(place([v * (0.6 + 0.4 * rng.random()) for v in ping], t0, total))
    return norm(fade(mix(*tracks), 0.002, 0.05), 0.6)

def till(rng):
    total = int(0.8 * SR)
    click = place([v * 0.7 * env_exp(i / SR, 0.012) for i, v in enumerate(highpass(noise(int(0.08 * SR), rng), 0.3))], 0.0, total)
    slide = place([v * 0.25 * math.sin(math.pi * i / int(0.12 * SR)) for i, v in enumerate(lowpass(noise(int(0.12 * SR), rng), 0.3))], 0.06, total)
    bell = place(mix(partial(1568, 0.6, 0.16, 0.7), partial(2093, 0.6, 0.2, 0.5), partial(3136, 0.4, 0.1, 0.25), partial(4186, 0.3, 0.06, 0.12)), 0.15, total)
    return norm(fade(mix(click, slide, bell), 0.002, 0.08), 0.65)

def glass(rng):
    d = 0.3
    return norm(fade(mix(partial(3136, d, 0.05, 0.8), partial(4699, d, 0.035, 0.45), partial(7459, d, 0.02, 0.25), partial(1568, d, 0.07, 0.25)), 0.001, 0.05), 0.5)

def broke(rng):
    d = 0.5; out = []; ph = 0.0
    for t in t_axis(d):
        f = 196 if t < 0.2 else 147
        ph += 2 * math.pi * f / SR
        sq = math.sin(ph) + 0.35 * math.sin(3 * ph) + 0.15 * math.sin(5 * ph)
        gate = min(1.0, (t % 0.2) / 0.01) * (1 - min(1.0, max(0.0, (t % 0.2 - 0.14) / 0.06)))
        out.append(sq * gate * (1 - t / d) * 0.6)
    return norm(fade(lowpass(out, 0.35), 0.003, 0.05), 0.6)

def stamp(rng):
    d = 0.3
    thud = mix(partial(80, d, 0.06, 1.0), partial(160, d, 0.03, 0.4))
    slap = [v * 0.7 * env_exp(i / SR, 0.015) for i, v in enumerate(lowpass(noise(int(d * SR), rng), 0.5))]
    return norm(fade(mix(thud, slap), 0.001, 0.04), 0.85)

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__)); os.chdir(here)
    for name, fn, seed in [('shutter', shutter, 1), ('lift', lift, 2), ('knock', knock, 3), ('coins', coins, 4), ('till', till, 5), ('glass', glass, 6), ('broke', broke, 7), ('stamp', stamp, 8)]:
        write(name, fn(random.Random(seed)))
        print('made', name)
