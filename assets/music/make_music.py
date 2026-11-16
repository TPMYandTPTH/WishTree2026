# An original instrumental arrangement of two public-domain Christmas melodies:
#   "Jingle Bells" (James Lord Pierpont, 1857) and "We Wish You a Merry Christmas" (traditional English carol).
# Everything is synthesised here (no recordings are used), so the result is free to play anywhere.
import numpy as np
from scipy.signal import fftconvolve

SR = 44100
rng = np.random.default_rng(7)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

def env_ad(n, attack, decay):
    t = np.arange(n) / SR
    e = np.exp(-t / decay)
    a = int(attack * SR)
    if a > 0: e[:a] *= np.linspace(0, 1, a)
    return e

def bell(m, dur, vel):
    f = hz(m); n = int((dur + 1.6) * SR); t = np.arange(n) / SR
    parts = [(1, 1.0, 1.8), (2, 0.35, 0.9), (3, 0.16, 0.5), (4.07, 0.10, 0.3), (5.43, 0.05, 0.2)]
    out = np.zeros(n)
    for k, a, d in parts:
        if f * k > 16000: continue
        out += a * np.sin(2 * np.pi * f * k * t) * env_ad(n, 0.002, d)
    return vel * out

def keys(m, dur, vel):  # soft electric-piano-like tone
    f = hz(m); n = int((dur + 0.9) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 7):
        if f * k > 15000: break
        out += (1 / k ** 1.4) * np.sin(2 * np.pi * f * k * t + 0.3 * k) * env_ad(n, 0.004, 1.4 / k ** 0.7)
    rel = np.ones(n); s = int(dur * SR); rel[s:] = np.exp(-np.arange(n - s) / (0.25 * SR))
    return vel * out * rel

def pad(m, dur, vel):
    f = hz(m); n = int((dur + 0.5) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.12, 0.0, 0.12):
        ff = f * 2 ** (det / 12)
        out += np.sin(2 * np.pi * ff * t) + 0.25 * np.sin(2 * np.pi * 2 * ff * t) + 0.08 * np.sin(2 * np.pi * 3 * ff * t)
    e = np.ones(n); a = int(0.12 * SR); e[:a] = np.linspace(0, 1, a)
    s = int(dur * SR); e[s:] = np.exp(-np.arange(n - s) / (0.18 * SR))
    return vel * out * e / 3

def bass(m, dur, vel):
    f = hz(m); n = int((dur + 0.3) * SR); t = np.arange(n) / SR
    out = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    return vel * out * env_ad(n, 0.005, 0.7)

def sleigh(dur, vel):
    n = int(0.18 * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for f in rng.uniform(5500, 9500, 6):
        out += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28))
    noise = np.diff(rng.standard_normal(n + 1))  # bright noise
    out = (0.5 * out / 6 + 0.35 * noise) * env_ad(n, 0.001, 0.035)
    return vel * out

INST = {'bell': bell, 'keys': keys, 'pad': pad, 'bass': bass}
PAN = {'bell': 0.35, 'keys': -0.15, 'pad': 0.0, 'bass': 0.0, 'sleigh': 0.45}

class Track:
    def __init__(self, seconds):
        self.L = np.zeros(int(seconds * SR)); self.R = np.zeros(int(seconds * SR))
    def add(self, start_s, wave, pan):
        i = int(start_s * SR); j = min(len(self.L), i + len(wave)); w = wave[: j - i]
        self.L[i:j] += w * np.sqrt((1 - pan) / 2); self.R[i:j] += w * np.sqrt((1 + pan) / 2)

G, A, B, C5, D5, E5, Fs5 = 67, 69, 71, 72, 74, 76, 78
D4, E4, Fs4, G4, A4, B4 = 62, 64, 66, 67, 69, 71
CH = {  # chord tones (root first) around middle C
    'G': [43, 55, 59, 62], 'C': [48, 55, 60, 64], 'D7': [50, 54, 57, 60], 'A7': [45, 55, 61, 64],
    'Em': [40, 55, 59, 64], 'B7': [47, 54, 57, 63], 'Am': [45, 57, 60, 64], 'D': [50, 54, 57, 62],
}

# Jingle Bells, in G, 4/4: (beats, midi) per bar, then the chord of each bar.
JB_VERSE = [
    [(1, D4), (1, B4), (1, A4), (1, G4)], [(3, D4), (.5, D4), (.5, D4)], [(1, D4), (1, B4), (1, A4), (1, G4)], [(4, E4)],
    [(1, E4), (1, C5), (1, B4), (1, A4)], [(4, Fs4)], [(1, D5), (1, D5), (1, C5), (1, A4)], [(4, B4)],
    [(1, D4), (1, B4), (1, A4), (1, G4)], [(4, D4)], [(1, D4), (1, B4), (1, A4), (1, G4)], [(3, E4), (1, E4)],
    [(1, E4), (1, C5), (1, B4), (1, A4)], [(1, D5), (1, D5), (1, D5), (1, D5)], [(1, E5), (1, D5), (1, C5), (1, A4)], [(2, G4), (2, D5)],
]
JB_VERSE_CH = ['G', 'G', 'G', 'C', 'C', 'D7', 'D7', 'G', 'G', 'G', 'G', 'C', 'C', 'D7', 'D7', 'G']
JB_CHORUS = [
    [(1, B4), (1, B4), (2, B4)], [(1, B4), (1, B4), (2, B4)], [(1, B4), (1, D5), (1.5, G4), (.5, A4)], [(4, B4)],
    [(1, C5), (1, C5), (1.5, C5), (.5, C5)], [(1, C5), (1, B4), (1, B4), (.5, B4), (.5, B4)], [(1, B4), (1, A4), (1, A4), (1, B4)], [(2, A4), (2, D5)],
    [(1, B4), (1, B4), (2, B4)], [(1, B4), (1, B4), (2, B4)], [(1, B4), (1, D5), (1.5, G4), (.5, A4)], [(4, B4)],
    [(1, C5), (1, C5), (1.5, C5), (.5, C5)], [(1, C5), (1, B4), (1, B4), (.5, B4), (.5, B4)], [(1, D5), (1, D5), (1, C5), (1, A4)], [(4, G4)],
]
JB_CHORUS_CH = ['G', 'G', 'G', 'G', 'C', 'G', 'A7', 'D7', 'G', 'G', 'G', 'G', 'C', 'G', 'D7', 'G']

# We Wish You a Merry Christmas, in G, 3/4 (the first beat of the first bar is the pickup note)
WW = [
    [(2, None), (1, D4)], [(1, G4), (.5, G4), (.5, A4), (.5, G4), (.5, Fs4)], [(1, E4), (1, E4), (1, E4)],
    [(1, A4), (.5, A4), (.5, B4), (.5, A4), (.5, G4)], [(1, Fs4), (1, D4), (1, D4)],
    [(1, B4), (.5, B4), (.5, C5), (.5, B4), (.5, A4)], [(1, G4), (1, E4), (.5, D4), (.5, D4)],
    [(1, E4), (1, A4), (1, Fs4)], [(3, G4)],
]
WW_CH = [None, 'G', 'C', 'A7', 'D', 'B7', 'Em', 'D7', 'G']

def place(track, t0, bpm, bars, chords, beats_per_bar, lead, oct_shift=0, vel=0.32, bells=False, waltz=False):
    spb = 60.0 / bpm
    t = t0
    for bar, ch in zip(bars, chords):
        bt = t
        for beats, m in bar:
            if m is not None:
                track.add(bt, INST[lead](m + oct_shift, beats * spb * 0.95, vel), PAN[lead])
                if lead == 'bell':  # a quiet octave above for sparkle
                    track.add(bt, bell(m + oct_shift + 12, beats * spb * 0.9, vel * 0.18), 0.6)
            bt += beats * spb
        if ch:
            notes = CH[ch]
            bar_len = beats_per_bar * spb
            track.add(t, bass(notes[0], spb * 1.5, 0.19), 0)
            if waltz:
                for k in (1, 2):
                    for nn in notes[1:]:
                        track.add(t + k * spb, keys(nn, spb * 0.8, 0.07), PAN['keys'])
            else:
                track.add(t + 2 * spb, bass(notes[0] + 7 if notes[0] + 7 < 56 else notes[0] - 5, spb * 1.5, 0.14), 0)
                for nn in notes[1:]:
                    track.add(t, pad(nn, bar_len * 0.98, 0.045), PAN['pad'])
        if bells:
            for k in range(beats_per_bar * 2):
                track.add(t + k * spb / 2, sleigh(0.1, 0.10 if k % 2 == 0 else 0.06), PAN['sleigh'])
        t += beats_per_bar * spb
    return t

def jingle(track, t, bpm, lead, oct_shift, bells):
    t = place(track, t, bpm, JB_VERSE, JB_VERSE_CH, 4, lead, oct_shift, bells=bells)
    return place(track, t, bpm, JB_CHORUS, JB_CHORUS_CH, 4, lead, oct_shift, bells=bells)

total = 200
tr = Track(total)
t = 0.4
t = jingle(tr, t, 132, 'bell', 12, False)    # music box, an octave up
t = jingle(tr, t, 132, 'keys', 0, True)      # keys with sleigh bells
t += 0.6
for i, (lead, sh) in enumerate([('bell', 12), ('keys', 0), ('bell', 12)]):
    t = place(tr, t, 132, WW if i == 0 else WW[1:], WW_CH if i == 0 else WW_CH[1:], 3, lead, sh, waltz=True)
end = t + 2.5
L, R = tr.L[: int(end * SR)], tr.R[: int(end * SR)]

# a soft room: exponentially decaying noise as the impulse response
n = int(1.8 * SR); tt = np.arange(n) / SR
ir_l = rng.standard_normal(n) * np.exp(-tt / 0.45); ir_r = rng.standard_normal(n) * np.exp(-tt / 0.45)
ir_l /= np.sqrt((ir_l ** 2).sum()); ir_r /= np.sqrt((ir_r ** 2).sum())
wetL = fftconvolve(L, ir_l)[: len(L)]; wetR = fftconvolve(R, ir_r)[: len(R)]
L = L + 0.28 * wetL; R = R + 0.28 * wetR
# gentle fade at the very end so the loop restarts cleanly
f = int(1.5 * SR); L[-f:] *= np.linspace(1, 0, f); R[-f:] *= np.linspace(1, 0, f)
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.85, R / peak * 0.85
pcm = (np.stack([L, R], 1) * 32767).astype('<i2')
import wave
with wave.open('christmas.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('seconds', round(len(L) / SR, 1), 'rms', round(float(np.sqrt((L ** 2).mean())), 3))
