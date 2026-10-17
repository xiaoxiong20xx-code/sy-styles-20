"""Procedural score + SFX for the style reel. 120 BPM, A minor / C major.
Every style section gets its own sound world; cuts land on bar lines.
usage: python3 synth.py plan.json out.wav
plan = {"sections":[{"kind":"intro"|"01"|"08"|"10"|"outro"|..., "start":sec, "dur":sec, "cues":[{"t":..,"sfx":..}]}]}
"""
import json, sys
import numpy as np
from scipy import signal

SR = 48000
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def nm(s):  # 'A4' -> midi
    name, octv = s[:-1], int(s[-1])
    return 12 * (octv + 1) + NOTE[name]


def t2n(t):
    return int(round(t * SR))


# ---------------- oscillators / envelopes ----------------
def sine(f, n, ph=0.0):
    f = np.broadcast_to(np.asarray(f, float), (n,))
    return np.sin(2 * np.pi * np.cumsum(f) / SR + ph)


def polyblep_saw(f, n):
    f = np.broadcast_to(np.asarray(f, float), (n,))
    dt = f / SR
    ph = np.cumsum(dt) % 1.0
    y = 2 * ph - 1
    # polyBLEP correction
    m = ph < dt
    t = ph[m] / dt[m]; y[m] -= t + t - t * t - 1
    m = ph > 1 - dt
    t = (ph[m] - 1) / dt[m]; y[m] -= t * t + t + t + 1
    return y


def expenv(n, dec):
    return np.exp(-np.arange(n) / SR / dec)


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, hold=None):
    hold = n / SR - r if hold is None else hold
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), np.where(t < a + d, 1 - (1 - s) * (t - a) / d, s))
    rel = t > hold
    e[rel] = s * np.exp(-(t[rel] - hold) / (r / 4))
    return e


def lp(x, fc, order=2):
    sos = signal.butter(order, min(fc, SR / 2 * 0.95), 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR / 2 * 0.95)], 'band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def svf_lp(x, fc_arr, q=0.7):
    """time-varying state variable lowpass (per-sample python loop; use on short sounds)."""
    y = np.zeros_like(x); lo = bd = 0.0
    fc_arr = np.broadcast_to(fc_arr, x.shape)
    for i in range(len(x)):
        f = 2 * np.sin(np.pi * min(fc_arr[i], SR / 6) / SR)
        hi = x[i] - lo - q * bd
        bd += f * hi; lo += f * bd
        y[i] = lo
    return y


def svf_bp(x, fc_arr, q=0.5):
    y = np.zeros_like(x); lo = bd = 0.0
    fc_arr = np.broadcast_to(fc_arr, x.shape)
    for i in range(len(x)):
        f = 2 * np.sin(np.pi * min(fc_arr[i], SR / 6) / SR)
        hi = x[i] - lo - q * bd
        bd += f * hi; lo += f * bd
        y[i] = bd
    return y


def noise(n):
    return rng.standard_normal(n)


# ---------------- instruments ----------------
def kick(n_len=0.45, f0=155, f1=46, drive=1.4, click=0.25):
    n = t2n(n_len)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    y = sine(f, n) * expenv(n, 0.22)
    y += click * hp(noise(n), 2500) * expenv(n, 0.004)
    return np.tanh(y * drive) / np.tanh(drive)


def soft_kick():
    return kick(0.35, 120, 50, 1.0, 0.08) * 0.8


def clap():
    n = t2n(0.35)
    e = np.zeros(n)
    for d in (0, 0.011, 0.022):
        k = t2n(d); e[k:] += expenv(n - k, 0.008 if d < 0.02 else 0.12)
    return bp(noise(n), 900, 4000) * e * 0.9


def snap():
    n = t2n(0.12)
    return bp(noise(n), 1800, 6000) * expenv(n, 0.018) * 0.8 + sine(1800, n) * expenv(n, 0.006) * 0.2


def hat(open_=False):
    n = t2n(0.3 if open_ else 0.06)
    return hp(noise(n), 7000, 4) * expenv(n, 0.09 if open_ else 0.018)


def shaker():
    n = t2n(0.09)
    t = np.arange(n) / SR
    e = (t / 0.02).clip(0, 1) * expenv(n, 0.03)
    return bp(noise(n), 4500, 11000) * e * 0.7


def marimba(m, dur=0.6):
    n = t2n(dur); f = mtof(m)
    y = sine(f, n) * expenv(n, 0.38) + 0.35 * sine(f * 4, n) * expenv(n, 0.05) + 0.12 * sine(f * 9.9, n) * expenv(n, 0.015)
    return y * (1 - np.exp(-np.arange(n) / SR / 0.001))


def bell(m, dur=1.6, bright=1.0):
    n = t2n(dur); f = mtof(m); t = np.arange(n) / SR
    I = bright * 3.2 * np.exp(-t / 0.35)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * I
    y = np.sin(2 * np.pi * f * t + mod) * expenv(n, 0.7)
    y += 0.25 * np.sin(2 * np.pi * f * 2 * t) * expenv(n, 0.3)
    return y * (1 - np.exp(-t / 0.002))


def pluck_saw(m, dur=0.25, cut=2600, res=0.35):
    n = t2n(dur); f = mtof(m)
    x = polyblep_saw(f, n) * 0.6 + polyblep_saw(f * 1.006, n) * 0.4
    fc = 300 + cut * np.exp(-np.arange(n) / SR / 0.06)
    return svf_lp(x, fc, res) * adsr(n, 0.002, 0.08, 0.5, 0.05)


def bass_saw(m, dur, cut=900):
    n = t2n(dur); f = mtof(m)
    x = polyblep_saw(f, n) * 0.7 + sine(f / 2, n) * 0.6
    fc = 180 + cut * np.exp(-np.arange(n) / SR / 0.08)
    return svf_lp(x, fc, 0.6) * adsr(n, 0.003, 0.05, 0.8, 0.03)


def sub(m, dur):
    n = t2n(dur); f = mtof(m)
    return sine(f, n) * adsr(n, 0.004, 0.1, 0.85, 0.06)


def pad(ms, dur, cut=1800, det=0.012):
    n = t2n(dur)
    y = np.zeros(n)
    for m in ms:
        f = mtof(m)
        for d in (-det, 0, det):
            y += polyblep_saw(f * (1 + d), n) * 0.33
    y = lp(y, cut, 2) / max(1, len(ms))
    return y * adsr(n, 0.35, 0.3, 0.8, 0.6)


def upright(m, dur):
    n = t2n(dur); f = mtof(m)
    y = sine(f, n) * 0.9 + 0.3 * sine(2 * f, n) * expenv(n, 0.12) + 0.15 * lp(polyblep_saw(f, n), 900)
    return y * adsr(n, 0.006, 0.2, 0.55, 0.08)


# ---------------- SFX ----------------
def whoosh(dur=0.6, up=True, lo=300, hi=6000, amp=0.8):
    n = t2n(dur); t = np.arange(n) / SR / dur
    fc = lo * (hi / lo) ** (t if up else 1 - t)
    e = np.sin(np.pi * t) ** 2
    if up: e = t ** 1.5 * np.exp(-((t - 0.85) ** 2) / 0.05)
    return svf_bp(noise(n), fc, 0.6) * e * amp


def riser(dur=2.0):
    n = t2n(dur); t = np.arange(n) / SR / dur
    y = svf_bp(noise(n), 200 * (40 ** t), 0.4) * t ** 2 * 0.7
    y += sine(200 * (8 ** t), n) * t ** 3 * 0.18
    return y


def impact(amp=1.0, tail=1.2):
    n = t2n(tail)
    t = np.arange(n) / SR
    y = sine(38 + 60 * np.exp(-t / 0.05), n) * expenv(n, 0.45) * 1.0
    y += lp(noise(n), 3000) * expenv(n, 0.06) * 0.6
    y += hp(noise(n), 4000) * expenv(n, 0.35) * 0.1
    return np.tanh(y * 1.5) * amp


def tick(f=3200, amp=0.5):
    n = t2n(0.03)
    return sine(f, n) * expenv(n, 0.006) * amp


def pop(f=700):
    n = t2n(0.12); t = np.arange(n) / SR
    return sine(f * (1 + 1.5 * np.exp(-t / 0.01)), n) * expenv(n, 0.04) * 0.8


def pencil(dur=1.0):
    n = t2n(dur); t = np.arange(n) / SR
    am = 0.5 + 0.5 * np.sin(2 * np.pi * 9 * t + 2 * np.sin(2 * np.pi * 2.3 * t))
    return bp(noise(n), 2500, 9000) * am * 0.22 * adsr(n, 0.05, 0.1, 0.9, 0.2)


def scribble(dur=0.6):
    n = t2n(dur); t = np.arange(n) / SR
    am = (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 14 * t))) * (0.6 + 0.4 * np.sin(2 * np.pi * 3 * t))
    return lp(bp(noise(n), 1500, 7000) * am, 6000) * 0.28 * adsr(n, 0.02, 0.1, 0.9, 0.1)


def glitch(dur=0.25):
    n = t2n(dur)
    y = noise(n) * 0.5 + polyblep_saw(110, n) * 0.4
    hold = 40
    y = np.repeat(y[::hold], hold)[:n]  # sample-hold crush
    gate = (np.floor(np.arange(n) / t2n(0.018)) % 2)
    return lp(y * gate, 7000) * 0.5


def beep(f=1760, dur=0.08):
    n = t2n(dur)
    return np.sign(sine(f, n)) * 0.15 * adsr(n, 0.002, 0.01, 0.9, 0.01)


def boot():
    out = np.zeros(t2n(0.6))
    for i, f in enumerate([660, 990, 1320, 1980]):
        b = beep(f, 0.06); k = t2n(i * 0.07); out[k:k + len(b)] += b
    return out


def lock():
    out = np.zeros(t2n(0.5))
    for i in range(3):
        b = beep(2200, 0.05); k = t2n(i * 0.07); out[k:k + len(b)] += b
    out += impact(0.35, 0.5)[:len(out)]
    return out


def swell(dur=1.5):
    n = t2n(dur); t = np.arange(n) / SR / dur
    return pad([nm('A4'), nm('C5'), nm('E5'), nm('B5')], dur, 3000) * np.sin(np.pi * t) * 0.9


def glass_clink(m=nm('E7')):
    return bell(m, 0.8, 0.6) * 0.35


def sparkle():
    out = np.zeros(t2n(1.0))
    for i, m in enumerate([nm('E7'), nm('B7'), nm('G#7'), nm('E8')]):
        b = bell(m, 0.6, 0.4) * 0.12; k = t2n(i * 0.06); out[k:k + len(b)] += b
    return out


def chime():
    out = np.zeros(t2n(1.8))
    for i, m in enumerate([nm('A5'), nm('E6'), nm('A6')]):
        b = bell(m, 1.5, 0.8) * 0.18; k = t2n(i * 0.05); out[k:k + len(b)] += b
    return out


def over(*parts):
    n = max(len(p) for p in parts); y = np.zeros(n)
    for p in parts: y[:len(p)] += p
    return y


def ding():
    return over(bell(nm('E6'), 1.6, 1.2) * 0.35, bell(nm('B6'), 1.2, 0.6) * 0.12)


def click():
    n = t2n(0.04)
    return hp(noise(n), 2000) * expenv(n, 0.004) * 0.6 + sine(1200, n) * expenv(n, 0.008) * 0.3


def ticks():
    out = np.zeros(t2n(1.6))
    for i in range(15):
        b = tick(2400 + i * 90, 0.35); k = t2n(i * (1.45 / 15)); out[k:k + len(b)] += b
    return out


def tail():
    return pad([nm('A3'), nm('E4'), nm('C5')], 2.5, 1200) * 0.5


def suck():
    n = t2n(0.32); t = np.arange(n) / SR
    y = sine(900 * np.exp(-t / 0.12) + 120, n) * expenv(n, 0.14) * 0.35
    y += svf_bp(noise(n), 3000 * np.exp(-t / 0.1) + 300, 0.7) * (1 - np.exp(-t / 0.03)) * expenv(n, 0.12) * 0.25
    return y


def boing(m=nm('C5')):
    n = t2n(0.22); t = np.arange(n) / SR; f = mtof(m)
    fr = f * (1 + 0.6 * np.exp(-t / 0.02)) * (1 + 0.03 * np.sin(2 * np.pi * 28 * t))
    return sine(fr, n) * expenv(n, 0.08) * 0.45 + sine(fr * 2, n) * expenv(n, 0.03) * 0.12


def land():
    n = t2n(0.4); t = np.arange(n) / SR
    y = sine(70 + 90 * np.exp(-t / 0.03), n) * expenv(n, 0.12) * 0.7
    y += lp(noise(n), 2500) * expenv(n, 0.015) * 0.35
    return y


def expand():
    return whoosh(0.5, True, 600, 9000, 0.45)


def data():
    out = np.zeros(t2n(0.9))
    for i in range(10):
        b = beep(1200 + (i * 373) % 1600, 0.035); k = t2n(i * 0.08); out[k:k + len(b)] += b * 0.7
    return out


SFX = {
    'whoosh': lambda: whoosh(0.55, True), 'whoosh_up': lambda: whoosh(0.5, True, 400, 8000, 0.6),
    'riser_short': lambda: riser(1.9), 'impact': lambda: impact(0.9), 'impact_soft': lambda: impact(0.45, 1.0),
    'ticks': ticks, 'pencil': lambda: pencil(1.1), 'click': click, 'ding': ding, 'pop': lambda: pop(760),
    'scribble': lambda: scribble(0.6), 'boot': boot, 'lock': lock, 'beep': lambda: beep(1760, 0.1),
    'zoom': lambda: whoosh(0.9, True, 150, 3000, 0.7), 'glitch': lambda: glitch(0.25), 'swell': lambda: swell(1.6),
    'glass': glass_clink, 'chime': chime, 'sparkle': sparkle, 'tail': tail,
    'suck': suck, 'boing': boing, 'boing2': lambda: boing(nm('G5')), 'land': land, 'expand': expand, 'data': data,
}

# ---------------- music per section ----------------
PROG = [  # chord per bar (root midi, tones)
    ('Am', nm('A2'), [nm('A3'), nm('C4'), nm('E4')]),
    ('F', nm('F2'), [nm('F3'), nm('A3'), nm('C4')]),
    ('C', nm('C3'), [nm('C4'), nm('E4'), nm('G4')]),
    ('G', nm('G2'), [nm('G3'), nm('B3'), nm('D4')]),
]


class Mix:
    def __init__(self, dur, off=0.0):
        self.n = t2n(dur) + SR * 3
        self.off = off      # time offset (local measuring mixes)
        self.gain = 1.0     # per-section gain applied to music/drums
        self.bus = {k: np.zeros((self.n, 2)) for k in ('drums', 'music', 'sfx', 'verb')}
        self.duck = np.ones(self.n)

    def add(self, bus, x, t, gain=1.0, pan=0.0, send=0.0):
        k = t2n(t - self.off)
        if k < 0 or k >= self.n: return
        if bus in ('drums', 'music'): gain *= self.gain
        x = x[: self.n - k] * gain
        L, R = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.bus[bus][k:k + len(x), 0] += x * L * 1.414
        self.bus[bus][k:k + len(x), 1] += x * R * 1.414
        if send:
            self.bus['verb'][k:k + len(x), 0] += x * L * send
            self.bus['verb'][k:k + len(x), 1] += x * R * send

    def sidechain(self, t, depth=0.55, rel=0.18):
        k = t2n(t - self.off); n = t2n(0.4)
        if k < 0 or k >= self.n: return
        e = 1 - depth * np.exp(-np.arange(n) / SR / rel)
        seg = self.duck[k:k + n]
        self.duck[k:k + n] = np.minimum(seg, e[: len(seg)])


# ================= extra instruments / sfx / music (styles 02-20) =================


# ======================= more instruments =======================
def ks(m, dur=0.9, bright=0.5, damp=0.996):
    """Karplus-Strong plucked string."""
    f = mtof(m); n = t2n(dur); N = max(2, int(SR / f))
    buf = lp(noise(N), 1200 + 6000 * bright)[:N] if N > 8 else noise(N)
    buf = np.array(buf, dtype=float); out = np.zeros(n); idx = 0; prev = 0.0
    for i in range(n):
        v = buf[idx]; out[i] = v
        nv = damp * 0.5 * (v + prev); prev = v; buf[idx] = nv; idx = (idx + 1) % N
    return out * adsr(n, 0.001, 0.05, 1.0, 0.08) * 0.8


def epiano(m, dur=1.2):
    n = t2n(dur); f = mtof(m); t = np.arange(n) / SR
    I = 1.8 * np.exp(-t / 0.25)
    y = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * t)) * expenv(n, 0.9)
    y += 0.2 * np.sin(2 * np.pi * f * 14 * t) * expenv(n, 0.02)
    return y * 0.6


def square(f, n, duty=0.5):
    f = np.broadcast_to(np.asarray(f, float), (n,))
    ph = np.cumsum(f) / SR % 1.0
    return np.where(ph < duty, 1.0, -1.0)


def chip(m, dur, duty=0.5, vol=0.25):
    n = t2n(dur)
    return square(mtof(m), n, duty) * vol * adsr(n, 0.002, 0.05, 0.7, 0.02)


def tri_bass(m, dur):
    n = t2n(dur); f = mtof(m); t = np.arange(n) / SR
    y = 2 * np.abs(2 * ((f * t) % 1.0) - 1) - 1
    return y * 0.5 * adsr(n, 0.002, 0.05, 0.9, 0.02)


def piano(m, dur=1.4):
    n = t2n(dur); f = mtof(m); t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (1.2 + k * 0.9)) for k, a in [(1, 1), (2, .45), (3, .22), (4, .12), (5, .06)])
    return y * (1 - np.exp(-t / 0.002)) * 0.5


def toy(m, dur=0.9):
    n = t2n(dur); f = mtof(m); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t + 1.2 * np.exp(-t / 0.08) * np.sin(2 * np.pi * f * 4.02 * t)) * expenv(n, 0.35)
    return y * 0.45


def glide(m0, m1, dur):
    n = t2n(dur); t = np.arange(n) / SR
    f = mtof(m0) + (mtof(m1) - mtof(m0)) * np.clip(t / 0.08, 0, 1)
    return sine(f * (1 + 0.006 * np.sin(2 * np.pi * 5 * t)), n) * adsr(n, 0.01, 0.1, 0.7, 0.08) * 0.35


def flute(m, dur):
    n = t2n(dur); f = mtof(m); t = np.arange(n) / SR
    vib = 1 + 0.008 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.15) / 0.3, 0, 1)
    y = sine(f * vib, n) + 0.12 * sine(2 * f * vib, n)
    y += bp(noise(n), f * 0.8, f * 3) * 0.06
    return y * adsr(n, 0.09, 0.2, 0.8, 0.2) * 0.4


def taiko():
    n = t2n(0.6); t = np.arange(n) / SR
    return (sine(60 + 50 * np.exp(-t / 0.04), n) * expenv(n, 0.25) + lp(noise(n), 900) * expenv(n, 0.03) * 0.5) * 0.9


def cowbell():
    n = t2n(0.2)
    y = (square(540, n) + square(800, n)) * 0.5
    return bp(y, 500, 4000) * expenv(n, 0.06) * 0.35


def rim():
    n = t2n(0.06)
    return (hp(noise(n), 2500) * expenv(n, 0.006) * 0.5 + sine(1700, n) * expenv(n, 0.012) * 0.4)


def gated_snare():
    n = t2n(0.32); t = np.arange(n) / SR
    y = bp(noise(n), 300, 7000) * 0.8 + sine(190, n) * expenv(n, 0.04) * 0.6
    gate = np.where(t < 0.22, 1.0, np.exp(-(t - 0.22) / 0.01))
    return y * gate * 0.75


def brass(ms, dur):
    n = t2n(dur); y = np.zeros(n)
    for m in ms: y += polyblep_saw(mtof(m), n) + 0.5 * polyblep_saw(mtof(m) * 1.004, n)
    fc = 600 + 2600 * np.exp(-np.arange(n) / SR / 0.12)
    return svf_lp(y / len(ms), fc, 0.5) * adsr(n, 0.01, 0.08, 0.6, 0.05) * 0.5


# ======================= more SFX =======================
def sfx_block():
    n = t2n(0.12); t = np.arange(n) / SR
    return sine(520 * (1 + 0.5 * np.exp(-t / 0.01)), n) * expenv(n, 0.035) * 0.6 + hp(noise(n), 3000) * expenv(n, 0.004) * 0.3


def sfx_blocks():
    out = np.zeros(t2n(1.4))
    for i in range(14):
        b = sfx_block() * 0.6; k = t2n(i * 0.09); out[k:k + len(b)] += b * (0.7 + 0.3 * (i % 2))
    return out


def sfx_sticker():
    n = t2n(0.14); t = np.arange(n) / SR
    return sine(700 * np.exp(-t / 0.04) + 180, n) * expenv(n, 0.05) * 0.5 + bp(noise(n), 1500, 5000) * expenv(n, 0.012) * 0.45


def sfx_type():
    r = np.random.default_rng(5); out = np.zeros(t2n(1.2)); tt = 0.0
    while tt < 1.1:
        n = t2n(0.03); c = hp(noise(n), 2500) * expenv(n, 0.004) * (0.25 + 0.15 * r.random())
        k = t2n(tt); out[k:k + n] += c; tt += 0.05 + 0.05 * r.random()
    return out


def sfx_paper():
    n = t2n(0.4); t = np.arange(n) / SR
    am = 0.5 + 0.5 * np.sin(2 * np.pi * 30 * t) * np.sin(2 * np.pi * 7 * t)
    return bp(noise(n), 1200, 8000) * am * np.sin(np.pi * t / 0.4) * 0.35


def sfx_drip():
    n = t2n(0.14); t = np.arange(n) / SR
    return sine(500 + 1500 * (t / 0.14) ** 0.6, n) * expenv(n, 0.05) * 0.45


def sfx_coin():
    a = chip(nm('B5'), 0.07, 0.5, 0.22); b = chip(nm('E6'), 0.28, 0.5, 0.22) * expenv(t2n(0.28), 0.15)
    return np.concatenate([a, b])


def sfx_thud():
    n = t2n(0.4); t = np.arange(n) / SR
    return sine(95 * np.exp(-t / 0.12) + 40, n) * expenv(n, 0.18) * 0.9 + lp(noise(n), 1500) * expenv(n, 0.02) * 0.4


def sfx_stamp():
    return over(sfx_thud(), sfx_paper() * 0.6, sfx_sticker() * 0.5)


def sfx_squish():
    n = t2n(0.3); t = np.arange(n) / SR
    y = svf_bp(noise(n), 300 + 900 * np.sin(np.pi * t / 0.3), 0.3) * 0.4 + sine(160 + 60 * np.sin(2 * np.pi * 9 * t), n) * 0.25
    return y * np.sin(np.pi * t / 0.3)


def sfx_tape():
    n = t2n(0.28); t = np.arange(n) / SR
    y = svf_bp(noise(n), 800 * (6 ** (t / 0.28)), 0.5) * 0.5
    y *= (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 60 * t)))
    return y * np.sin(np.pi * t / 0.28)


def sfx_brush():
    n = t2n(0.7); t = np.arange(n) / SR
    return lp(bp(noise(n), 400, 5000), 3000) * np.sin(np.pi * t / 0.7) ** 2 * 0.35


def sfx_blob():
    n = t2n(0.35); t = np.arange(n) / SR
    return sine(260 * np.exp(-t / 0.12) + 90 + 25 * np.sin(2 * np.pi * 14 * t), n) * expenv(n, 0.16) * 0.6


def sfx_vhs():
    n = t2n(1.0); t = np.arange(n) / SR
    y = sine(60, n) * 0.15 + lp(noise(n), 2500) * 0.12 * np.exp(-t / 0.5)
    y[: t2n(0.05)] += hp(noise(t2n(0.05)), 2000) * 0.5
    return y * adsr(n, 0.01, 0.2, 0.6, 0.3)


def sfx_stretch():
    n = t2n(0.55); t = np.arange(n) / SR
    return sine(200 + 320 * (t / 0.55) ** 1.4, n) * (1 + 0.3 * np.sin(2 * np.pi * 11 * t)) * np.sin(np.pi * t / 0.55) * 0.35


def sfx_splash():
    n = t2n(0.6); t = np.arange(n) / SR
    y = lp(noise(n), 2500) * expenv(n, 0.12) * 0.5
    for i in range(5):
        d = sfx_drip() * 0.4; k = t2n(0.05 + i * 0.07); y[k:k + len(d)] += d[: len(y) - k]
    return y


def sfx_slap():
    # a sheet of paper pressed flat onto the board: soft low thump + crisp papery burst
    n = t2n(0.16); t = np.arange(n) / SR
    body = sine(118 * np.exp(-t / 0.05) + 60, n) * expenv(n, 0.035) * 0.55
    crisp = bp(noise(n), 900, 6500) * expenv(n, 0.018) * 0.55
    air = hp(noise(n), 4000) * expenv(n, 0.006) * 0.25
    return body + crisp + air


def sfx_sizzle(dur=2.4):
    n = t2n(dur); t = np.arange(n) / SR
    bed = hp(noise(n), 2200) * 0.12 * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 7.3 * t + np.sin(2 * np.pi * 1.1 * t))))
    rng_ = np.random.default_rng(7)
    for _ in range(int(dur * 55)):
        k = rng_.integers(0, n - 400); L = rng_.integers(40, 260)
        bed[k:k + L] += hp(noise(L), 3000) * rng_.uniform(0.15, 0.6) * np.exp(-np.arange(L) / (L * 0.25))
    env = np.clip(t / 0.25, 0, 1) * np.clip((dur - t) / 0.6, 0, 1)
    return lp(bed, 9000) * env * 0.8


def sfx_shutter():
    out = np.zeros(t2n(0.25)); c = hp(noise(t2n(0.03)), 1500) * expenv(t2n(0.03), 0.005) * 0.7
    out[: len(c)] += c; k = t2n(0.08); out[k:k + len(c)] += c * 0.8
    return out


def sfx_roll():
    n = t2n(0.9); t = np.arange(n) / SR
    return lp(noise(n), 400) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t)) * np.sin(np.pi * t / 0.9) * 0.6


def sfx_powerup():
    out = np.zeros(t2n(0.5))
    for i, m in enumerate(['C5', 'E5', 'G5', 'C6', 'E6', 'G6']):
        b = chip(nm(m), 0.06, 0.25, 0.2); k = t2n(i * 0.06); out[k:k + len(b)] += b
    return out


def sfx_levelup():
    out = np.zeros(t2n(1.0))
    for i, (m, d) in enumerate([('C5', 0.1), ('G5', 0.1), ('C6', 0.1), ('E6', 0.45)]):
        b = chip(nm(m), d, 0.5, 0.22); k = t2n(i * 0.1); out[k:k + len(b)] += b
    return out


def sfx_jump():
    n = t2n(0.16); t = np.arange(n) / SR
    return square(300 + 600 * (t / 0.16), n, 0.25) * 0.18 * expenv(n, 0.1)


def sfx_bonk():
    n = t2n(0.12)
    return square(150, n) * 0.25 * expenv(n, 0.05) + hp(noise(n), 2000) * expenv(n, 0.01) * 0.2


def sfx_flag():
    n = t2n(0.7); t = np.arange(n) / SR
    return square(400 + 500 * (t / 0.7), n, 0.5) * 0.15 * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 16 * t)))


def sfx_fireworks():
    out = np.zeros(t2n(1.6)); r = np.random.default_rng(3)
    for j in range(3):
        k0 = t2n(j * 0.3); n = t2n(0.5); b = lp(noise(n), 3000) * expenv(n, 0.08) * 0.5; out[k0:k0 + n] += b
        for i in range(10):
            c = hp(noise(t2n(0.01)), 3000) * 0.3; k = k0 + t2n(0.08 + r.random() * 0.5); out[k:k + len(c)] += c[: len(out) - k]
    return out


def sfx_neon():
    n = t2n(0.5); t = np.arange(n) / SR
    buzz = np.sign(np.sin(2 * np.pi * 120 * t)) * 0.08 + sine(240, n) * 0.06
    gate = np.where((t < 0.08) | ((t > 0.14) & (t < 0.2)) | (t > 0.24), 1.0, 0.05)
    return lp(buzz, 3000) * gate * expenv(n, 0.6)


def sfx_morph():
    return over(whoosh(0.4, True, 400, 6000, 0.4), np.pad(bell(nm('A6'), 0.6, 0.6) * 0.15, (t2n(0.3), 0)))


def sfx_marker():
    n = t2n(0.45); t = np.arange(n) / SR
    return (bp(noise(n), 2000, 6000) * 0.2 + sine(1800 + 300 * np.sin(2 * np.pi * 3 * t), n) * 0.04) * np.sin(np.pi * t / 0.45)


def sfx_laugh():
    out = np.zeros(t2n(0.9))
    for i, m in enumerate(['E5', 'C5', 'A4', 'C5', 'A4']):
        n = t2n(0.12); f = mtof(nm(m)); t = np.arange(n) / SR
        b = polyblep_saw(f * (1 + 0.04 * np.sin(2 * np.pi * 30 * t)), n); b = lp(b, 2200) * np.sin(np.pi * t / 0.12) * 0.25
        k = t2n(i * 0.15); out[k:k + n] += b
    return out


def sfx_guzheng():
    out = np.zeros(t2n(1.6))
    for i, m in enumerate(['A4', 'C5', 'D5', 'E5', 'G5', 'A5']):
        b = ks(nm(m), 1.0, 0.7, 0.997) * 0.4; k = t2n(i * 0.07); out[k:k + len(b)] += b[: len(out) - k]
    return out


def sfx_clink():
    return over(bell(nm('C8'), 0.6, 0.5) * 0.25, bell(nm('G7'), 0.4, 0.4) * 0.12)


EXTRA_SFX = {
    'block': sfx_block, 'blocks': sfx_blocks, 'sticker': sfx_sticker, 'pen': lambda: pencil(0.8), 'type': sfx_type,
    'tick': lambda: tick(3000, 0.6), 'paper': sfx_paper, 'slap': sfx_slap, 'drip': sfx_drip, 'coin': sfx_coin, 'thud': sfx_thud, 'stamp': sfx_stamp,
    'squish': sfx_squish, 'tape': sfx_tape, 'brush': sfx_brush, 'blob': sfx_blob, 'vhs': sfx_vhs, 'stretch': sfx_stretch,
    'splash': sfx_splash, 'snap': lambda: snap() * 1.2, 'shutter': sfx_shutter, 'roll': sfx_roll, 'powerup': sfx_powerup,
    'levelup': sfx_levelup, 'jump': sfx_jump, 'bonk': sfx_bonk, 'flag': sfx_flag, 'fireworks': sfx_fireworks, 'neon': sfx_neon,
    'morph': sfx_morph, 'marker': sfx_marker, 'laugh': sfx_laugh, 'guzheng': sfx_guzheng, 'clink': sfx_clink, 'clap': lambda: clap() * 1.1,
    'rim': lambda: rim() * 1.3, 'sizzle': sfx_sizzle,
}


# ======================= style sound worlds =======================
def chord_ext(name, tones):
    return tones + [tones[0] + (11 if name in ('C', 'F') else 10)]


def mus_02(M, tb, name, root, tones, bi):   # isometric: kalimba + soft beat
    pat = [0, 2, 1, 2, 3, 2, 1, 0]
    ext = chord_ext(name, tones)
    for e in range(8):
        M.add('music', marimba(ext[pat[e]] + 24, 0.5), tb + e * BEAT / 2, 0.3, -0.3 + 0.2 * (e % 4), 0.3)
    for q in (0, 2): M.add('drums', soft_kick(), tb + q * BEAT, 0.75)
    for q in (1, 3): M.add('drums', clap(), tb + q * BEAT, 0.3, 0, 0.2)
    for s16 in range(16): M.add('drums', shaker(), tb + s16 * BEAT / 4, 0.1 if s16 % 2 else 0.06, 0.3)
    M.add('music', sub(root - 12, BAR * 0.9), tb, 0.4)


def mus_03(M, tb, name, root, tones, bi):   # flat vector: bouncy pop
    for q in range(4): M.add('drums', kick(0.35, 140, 48, 1.4, 0.15), tb + q * BEAT, 0.75); M.sidechain(tb + q * BEAT, 0.4)
    for q in (1, 3): M.add('drums', clap(), tb + q * BEAT, 0.5, 0, 0.2)
    for e in range(8):
        M.add('music', bass_saw(root - 12 + (12 if e % 2 else 0), BEAT / 2 * 0.7, 900), tb + e * BEAT / 2, 0.35)
        if e % 2: M.add('music', pluck_saw(tones[e // 2 % 3] + 12, 0.18, 2000), tb + e * BEAT / 2, 0.14, 0.3, 0.2)
    for e in range(8): M.add('drums', hat(), tb + e * BEAT / 2 + BEAT / 4, 0.08, 0.4)


def mus_04(M, tb, name, root, tones, bi):   # line art: piano arpeggio + pad
    ext = chord_ext(name, tones)
    for e in range(8):
        m = [ext[0], ext[1], ext[2], ext[3], ext[2] + 12, ext[3], ext[2], ext[1]][e] + 12
        M.add('music', piano(m, 1.4), tb + e * BEAT / 2, 0.28, -0.2 + 0.4 * (e % 2), 0.45)
    M.add('music', piano(root, 2.0), tb, 0.35, 0, 0.3)
    M.add('music', pad([x + 12 for x in tones], BAR, 1400), tb, 0.25, 0, 0.5)
    for q in range(4): M.add('drums', shaker(), tb + q * BEAT + BEAT / 2, 0.07, 0.3)


def mus_05(M, tb, name, root, tones, bi):   # 3D: glossy half-time
    M.add('music', sub(root - 12, BAR * 0.95), tb, 0.5)
    M.add('drums', kick(0.5, 150, 42, 1.6, 0.2), tb, 0.85); M.add('drums', kick(0.5, 150, 42, 1.6, 0.2), tb + 2.5 * BEAT, 0.7)
    M.sidechain(tb, 0.5); M.sidechain(tb + 2.5 * BEAT, 0.4)
    M.add('drums', snap(), tb + 2 * BEAT, 0.5, 0, 0.4)
    for e in (0, 3, 6, 9, 12, 14):
        M.add('music', bell(tones[e % 3] + 24, 1.0, 0.6), tb + e * BEAT / 4, 0.16, 0.35 if e % 2 else -0.35, 0.45)
    M.add('music', pad([x + 12 for x in tones], BAR, 2200), tb, 0.3, 0, 0.4)


def mus_06(M, tb, name, root, tones, bi):   # morph: whimsical glides
    seq = [tones[0] + 12, tones[2] + 12, tones[1] + 24, tones[2] + 12]
    for q in range(4):
        M.add('music', glide(seq[q - 1] if q else seq[-1], seq[q], BEAT * 0.95), tb + q * BEAT, 0.4, 0.2, 0.4)
    for q in (0, 2): M.add('drums', soft_kick(), tb + q * BEAT, 0.7)
    for q in (1, 3): M.add('drums', snap(), tb + q * BEAT, 0.35, 0, 0.3)
    M.add('music', bell(tones[2] + 24, 1.5, 0.8), tb + 1.5 * BEAT, 0.12, -0.3, 0.6)
    M.add('music', sub(root - 12, BAR * 0.9), tb, 0.35)


def mus_07(M, tb, name, root, tones, bi):   # sticker: ukulele strums + claps
    for e, d in enumerate([0, 0.75, 1.5, 2, 2.75, 3.5]):
        for j, m in enumerate(tones + [tones[0] + 12]):
            M.add('music', ks(m + 12, 0.5, 0.6), tb + d * BEAT + j * 0.012, 0.16, -0.2 + 0.13 * j, 0.15)
    for q in (0, 2): M.add('drums', soft_kick(), tb + q * BEAT, 0.7)
    for q in (1, 3): M.add('drums', clap(), tb + q * BEAT, 0.45, 0, 0.25)
    M.add('music', upright(root, BEAT * 1.8), tb, 0.45); M.add('music', upright(root + 7, BEAT * 1.8), tb + 2 * BEAT, 0.4)


def mus_09(M, tb, name, root, tones, bi):   # collage: lo-fi
    sw = BEAT / 2 * 0.12
    M.add('drums', lp(kick(0.4, 110, 45, 1.2, 0.05), 1800), tb, 0.8); M.add('drums', lp(kick(0.4, 110, 45, 1.2, 0.05), 1800), tb + 2.75 * BEAT, 0.6)
    for q in (1, 3): M.add('drums', lp(clap(), 3000), tb + q * BEAT, 0.45, 0, 0.3)
    for e in range(8): M.add('drums', lp(hat(), 6000), tb + e * BEAT / 2 + (sw if e % 2 else 0), 0.08, 0.3)
    for j, m in enumerate(chord_ext(name, tones)): M.add('music', epiano(m + 12, BAR * 0.9), tb + j * 0.02, 0.18, -0.2 + 0.13 * j, 0.3)
    M.add('music', sub(root - 12, BEAT * 3), tb, 0.4)
    n = t2n(BAR); cr = np.zeros(n); r = np.random.default_rng(int(tb * 10))
    for i in range(30): k = int(r.random() * (n - 20)); cr[k:k + 20] += hp(noise(20), 3000) * 0.15
    M.add('sfx', cr, tb, 0.5)


def mus_11(M, tb, name, root, tones, bi):   # bauhaus: minimal techno
    for q in range(4): M.add('drums', kick(0.35, 160, 46, 1.8, 0.25), tb + q * BEAT, 0.85); M.sidechain(tb + q * BEAT, 0.5)
    for e in range(8):
        if e % 2: M.add('drums', rim(), tb + e * BEAT / 2, 0.5, 0.2)
        if e in (3, 6): M.add('drums', cowbell(), tb + e * BEAT / 2, 0.4, -0.3)
    for s in range(16):
        if s % 4 in (2, 3): M.add('music', lp(chip(root - 12 + (12 if s % 8 == 3 else 0), BEAT / 4 * 0.8, 0.5, 0.5), 900), tb + s * BEAT / 4, 0.5)


def mus_12(M, tb, name, root, tones, bi):   # synthwave
    for q in (0, 2): M.add('drums', kick(0.5, 150, 44, 1.6, 0.2), tb + q * BEAT, 0.9); M.sidechain(tb + q * BEAT, 0.45)
    for q in (1, 3): M.add('drums', gated_snare(), tb + q * BEAT, 0.6, 0, 0.6)
    for e in range(8): M.add('music', bass_saw(root - 12, BEAT / 2 * 0.85, 1100), tb + e * BEAT / 2, 0.42)
    for s in range(16):
        m = [tones[0], tones[1], tones[2], tones[1] + 12][s % 4] + 12
        M.add('music', pluck_saw(m, 0.2, 2600), tb + s * BEAT / 4, 0.12, 0.4 if s % 2 else -0.4, 0.3)
    M.add('music', pad([x + 12 for x in chord_ext(name, tones)], BAR, 2400, 0.015), tb, 0.38, 0, 0.5)


def mus_13(M, tb, name, root, tones, bi):   # chiptune
    mel = {'Am': ['A5', 'C6', 'E6', 'C6', 'B5', 'A5', 'G5', 'A5'], 'F': ['F5', 'A5', 'C6', 'A5', 'G5', 'F5', 'E5', 'F5'],
           'C': ['E5', 'G5', 'C6', 'G5', 'E5', 'D5', 'C5', 'E5'], 'G': ['D5', 'G5', 'B5', 'G5', 'D6', 'B5', 'A5', 'G5']}[name]
    for e, s in enumerate(mel): M.add('music', chip(nm(s), BEAT / 2 * 0.85, 0.25, 0.18), tb + e * BEAT / 2, 1.0, 0.15, 0.1)
    for q in range(4): M.add('music', tri_bass(root - 12 + (7 if q % 2 else 0), BEAT * 0.9), tb + q * BEAT, 0.55)
    for q in range(4): M.add('drums', kick(0.15, 220, 60, 2, 0.0), tb + q * BEAT, 0.5)
    for e in range(8): M.add('drums', hp(noise(t2n(0.03)), 6000) * expenv(t2n(0.03), 0.01), tb + e * BEAT / 2 + BEAT / 4, 0.25)


def mus_14(M, tb, name, root, tones, bi):   # liquid: deep house
    for q in range(4): M.add('drums', kick(0.45, 130, 44, 1.4, 0.1), tb + q * BEAT, 0.8); M.sidechain(tb + q * BEAT, 0.6, 0.22)
    for e in range(8): M.add('drums', shaker(), tb + e * BEAT / 2 + BEAT / 4, 0.12, 0.3)
    for q in (1, 3): M.add('drums', snap(), tb + q * BEAT, 0.35, 0, 0.4)
    M.add('music', pad([x + 12 for x in chord_ext(name, tones)], BAR, 1800, 0.01), tb, 0.45, 0, 0.5)
    for e in (1, 4, 6): M.add('music', sfx_blob() * 0.6, tb + e * BEAT / 2, 0.5, 0.3 if e % 2 else -0.3, 0.3)
    M.add('music', sub(root - 12, BEAT * 1.5), tb + BEAT / 2, 0.45); M.add('music', sub(root - 12, BEAT), tb + 2.5 * BEAT, 0.4)


def mus_15(M, tb, name, root, tones, bi):   # variety: oom-pah comedy
    for q in (0, 2): M.add('music', lp(polyblep_saw(mtof(root - 12), t2n(BEAT * 0.6)), 500) * adsr(t2n(BEAT * 0.6), 0.01, 0.1, 0.7, 0.05) * 0.7, tb + q * BEAT, 0.6)
    for q in (1, 3): M.add('music', brass([x + 12 for x in tones], BEAT * 0.4), tb + q * BEAT, 0.35, 0, 0.3)
    for q in range(4): M.add('drums', snap(), tb + q * BEAT + BEAT / 2, 0.25, 0.2, 0.2)
    if bi % 2 == 1:
        for i in range(8): M.add('drums', bp(noise(t2n(0.05)), 300, 6000) * expenv(t2n(0.05), 0.02) * 0.5, tb + 3 * BEAT + i * BEAT / 8, 0.5 + i * 0.05)


def mus_16(M, tb, name, root, tones, bi):   # page camera: clean tech pop
    for q in range(4): M.add('drums', soft_kick(), tb + q * BEAT, 0.7); M.sidechain(tb + q * BEAT, 0.35)
    for q in (1, 3): M.add('drums', clap(), tb + q * BEAT, 0.4, 0, 0.3)
    for s in range(16):
        m = [tones[0], tones[2], tones[1] + 12, tones[2]][s % 4] + 12
        M.add('music', pluck_saw(m, 0.16, 1500 + 600 * (s % 2)), tb + s * BEAT / 4, 0.1, 0.3 if s % 2 else -0.3, 0.25)
    M.add('music', pad([x + 12 for x in tones], BAR, 2600, 0.01), tb, 0.32, 0, 0.5)
    M.add('music', sub(root - 12, BAR * 0.9), tb, 0.4)


def mus_17(M, tb, name, root, tones, bi):   # editorial: newsroom
    for s in range(16): M.add('drums', tick(4200 if s % 4 else 3000, 0.3), tb + s * BEAT / 4, 0.6 if s % 4 == 0 else 0.35, 0.25)
    M.add('drums', taiko() * 0.7, tb, 0.7)
    for j, m in enumerate(tones): M.add('music', piano(m + 12, 1.0), tb + j * 0.01, 0.3, 0, 0.3); M.add('music', piano(m + 12, 0.6), tb + 2.5 * BEAT + j * 0.01, 0.22, 0, 0.3)
    M.add('music', pad([x for x in tones], BAR, 900, 0.006), tb, 0.35, 0, 0.4)
    M.add('music', sub(root - 12, BAR * 0.95), tb, 0.4)


def mus_18(M, tb, name, root, tones, bi):   # ink: guzheng + flute
    pent = [nm('A4'), nm('C5'), nm('D5'), nm('E5'), nm('G5'), nm('A5'), nm('C6')]
    seq = [[0, 2, 3, 4], [5, 4, 3, 2], [1, 3, 4, 6], [4, 3, 1, 0]][bi % 4]
    for e, k in enumerate(seq): M.add('music', ks(pent[k], 1.0, 0.75, 0.997), tb + e * BEAT, 0.5, -0.25 + 0.15 * e, 0.45)
    M.add('music', ks(pent[seq[-1]] - 12, 1.5, 0.5, 0.998), tb + 3.5 * BEAT, 0.35, 0.2, 0.45)
    M.add('drums', taiko(), tb, 0.6 if bi % 2 == 0 else 0.4, 0, 0.3)
    if bi % 2 == 1: M.add('music', flute(pent[seq[0]] + 12, BAR * 0.9), tb, 0.25, 0.1, 0.5)
    M.add('music', pad([root, root + 7, root + 12], BAR, 700, 0.004), tb, 0.3, 0, 0.5)


def mus_19(M, tb, name, root, tones, bi):   # clay: toy piano
    for e in range(8):
        m = [tones[0], tones[2], tones[1], tones[2], tones[0] + 12, tones[2], tones[1], tones[2]][e] + 24
        M.add('music', toy(m, 0.6), tb + e * BEAT / 2, 0.3, -0.2 + 0.1 * (e % 4), 0.3)
    for q in (0, 2): M.add('drums', soft_kick(), tb + q * BEAT, 0.65)
    for q in (1, 3): M.add('drums', lp(snap(), 4000), tb + q * BEAT, 0.4, 0, 0.3)
    M.add('music', marimba(root, 0.8), tb, 0.45); M.add('music', marimba(root + 7, 0.8), tb + 2 * BEAT, 0.4)


def mus_20(M, tb, name, root, tones, bi):   # blueprint: mechanical
    for s in range(16): M.add('drums', tick(2600 + (s % 3) * 400, 0.35), tb + s * BEAT / 4, 0.45 if s % 4 == 0 else 0.22, 0.4 if s % 2 else -0.4)
    for q in range(4): M.add('drums', soft_kick(), tb + q * BEAT, 0.6)
    for s in range(8):
        m = [tones[0], tones[1], tones[2], tones[1]][s % 4] + 12
        M.add('music', lp(pluck_saw(m, 0.14, 900), 2000), tb + s * BEAT / 2, 0.22, 0.2, 0.2)
    for q in range(4): M.add('music', lp(chip(root - 12, BEAT * 0.45, 0.3, 0.45), 700), tb + q * BEAT, 0.5)


EXTRA = {'02': mus_02, '03': mus_03, '04': mus_04, '05': mus_05, '06': mus_06, '07': mus_07, '09': mus_09, '11': mus_11, '12': mus_12,
         '13': mus_13, '14': mus_14, '15': mus_15, '16': mus_16, '17': mus_17, '18': mus_18, '19': mus_19, '20': mus_20}

SFX.update(EXTRA_SFX)


def section_music(M, kind, t0, dur):
    bars = int(round(dur / BAR))
    b0 = int(round(t0 / BAR))
    for bi in range(bars):
        tb = t0 + bi * BAR
        name, root, tones = PROG[(b0 + bi) % 4]
        if kind == 'intro':
            if bi == 0:
                for q in range(4): M.add('music', sub(root - 12, BEAT * 0.9), tb + q * BEAT, 0.55)
            else:
                for q in range(4):
                    M.add('drums', kick(), tb + q * BEAT, 0.9); M.sidechain(tb + q * BEAT)
                    M.add('music', sub(root - 12 + 12, BEAT * 0.45), tb + q * BEAT + BEAT / 2, 0.45)
                for e in range(8): M.add('drums', hat(), tb + e * BEAT / 2, 0.22 if e % 2 else 0.12, 0.3)
                M.add('music', pad(tones, BAR, 1500), tb, 0.4, 0, 0.3)
        elif kind == '01':  # hand-drawn: marimba, shaker, soft kick, upright bass
            mel = {
                'C': ['E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5'],
                'G': ['D5', 'G5', 'B5', 'G5', 'D5', 'B4', 'G4', 'B4'],
                'Am': ['C5', 'E5', 'A5', 'E5', 'C5', 'B4', 'A4', None],
                'F': ['C5', 'F5', 'A5', 'F5', 'C5', 'A4', 'F4', 'A4'],
            }[name]
            for e, s in enumerate(mel):
                if s: M.add('music', marimba(nm(s)), tb + e * BEAT / 2, 0.42 if e % 2 == 0 else 0.3, -0.25 + 0.1 * (e % 3), 0.25)
            M.add('drums', soft_kick(), tb, 0.8); M.add('drums', soft_kick(), tb + 2 * BEAT, 0.7)
            M.add('drums', snap(), tb + BEAT, 0.35, 0.2, 0.2); M.add('drums', snap(), tb + 3 * BEAT, 0.35, 0.2, 0.2)
            for s16 in range(16): M.add('drums', shaker(), tb + s16 * BEAT / 4, 0.16 if s16 % 2 else 0.09, 0.4)
            M.add('music', upright(root, BEAT * 1.5), tb, 0.55); M.add('music', upright(root + 7, BEAT * 0.9), tb + BEAT * 1.5, 0.4)
            M.add('music', upright(root, BEAT * 1.5), tb + 2 * BEAT, 0.5); M.add('music', upright(root + 12, BEAT), tb + 3.5 * BEAT, 0.35)
        elif kind == '08':  # HUD: four-on-floor, saw bass 16ths, arp
            for q in range(4):
                M.add('drums', kick(0.45, 170, 44, 2.2, 0.3), tb + q * BEAT, 1.0); M.sidechain(tb + q * BEAT, 0.7)
            M.add('drums', clap(), tb + BEAT, 0.55, 0, 0.25); M.add('drums', clap(), tb + 3 * BEAT, 0.55, 0, 0.25)
            for s16 in range(16):
                M.add('drums', hat(s16 % 4 == 2), tb + s16 * BEAT / 4, 0.16 if s16 % 4 == 2 else 0.1, 0.35)
                if s16 % 4 != 0:
                    M.add('music', bass_saw(root - 12 + (12 if s16 % 4 == 2 else 0), BEAT / 4 * 0.9, 1400), tb + s16 * BEAT / 4, 0.42)
                arp = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[1] + 24][s16 % 4]
                M.add('music', pluck_saw(arp, 0.22, 3200 if s16 % 8 < 4 else 1800), tb + s16 * BEAT / 4, 0.16, 0.35 if s16 % 2 else -0.35, 0.18)
            M.add('music', pad([x - 12 for x in tones], BAR, 900), tb, 0.3, 0, 0.2)
        elif kind == '10':  # glass: pads, bell arps, soft kick, snaps
            ext = tones + [tones[0] + 11 if name in ('C', 'F') else tones[0] + 10]
            M.add('music', pad([x + 12 for x in ext], BAR, 2600, 0.008), tb, 0.55, 0, 0.45)
            M.add('music', sub(root - 12, BAR * 0.95), tb, 0.45)
            for e in range(8):
                m = [ext[0] + 24, ext[2] + 24, ext[1] + 24, ext[3] + 24, ext[2] + 24, ext[1] + 36, ext[2] + 24, ext[0] + 36][e]
                M.add('music', bell(m, 1.2, 0.5), tb + e * BEAT / 2, 0.14, 0.4 if e % 2 else -0.4, 0.5)
            M.add('drums', soft_kick(), tb, 0.75); M.add('drums', soft_kick(), tb + 2.5 * BEAT, 0.55)
            M.sidechain(tb, 0.45); M.sidechain(tb + 2.5 * BEAT, 0.35)
            M.add('drums', snap(), tb + BEAT, 0.4, 0, 0.35); M.add('drums', snap(), tb + 3 * BEAT, 0.4, 0, 0.35)
            for e in range(8): M.add('drums', hat(), tb + e * BEAT / 2 + BEAT / 4, 0.06, 0.5)
        elif kind == 'outro':
            M.add('music', pad([x + 12 for x in tones], BAR * (1.6 if bi == bars - 1 else 1.05), 2000), tb, 0.5, 0, 0.5)
            M.add('music', bell(tones[0] + 24, 2.0, 0.7), tb, 0.2, -0.2, 0.5)
            M.add('music', bell(tones[2] + 24, 2.0, 0.7), tb + BEAT * 1.5, 0.14, 0.3, 0.5)
            if bi == 0:
                M.add('music', sub(root - 12, BAR), tb, 0.4)
        elif kind in EXTRA:
            EXTRA[kind](M, tb, name, root, tones, bi)
        else:
            print('no music for', kind)


def reverb_ir(dur=1.8, decay=0.55):
    n = t2n(dur)
    t = np.arange(n) / SR
    ir = np.stack([noise(n), noise(n)], 1) * np.exp(-t / decay)[:, None]
    ir[:, 0] = lp(ir[:, 0], 6000); ir[:, 1] = lp(ir[:, 1], 6000)
    ir[: t2n(0.012)] = 0  # predelay
    return ir / np.sqrt((ir ** 2).sum(0))


def tp_limit(mix, ceiling_db=-2.4, os=4, hold=0.005):
    """true-peak limiter: 4x oversampled peak detection, look-ahead min-hold + smoothing (only touches the few overs)"""
    from scipy.signal import resample_poly
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    c = 10 ** (ceiling_db / 20)
    up = np.stack([resample_poly(mix[:, i], os, 1) for i in range(mix.shape[1])], 1)
    pk = np.abs(up).max(1)
    n = len(mix)
    pk = pk[: n * os].reshape(-1, os).max(1) if len(pk) >= n * os else np.pad(pk, (0, n * os - len(pk))).reshape(-1, os).max(1)
    g = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = int(hold * SR)
    g = uniform_filter1d(minimum_filter1d(g, 2 * L + 1), 2 * L + 1)
    print(f'  true-peak limiter: max reduction {-20*np.log10(g.min()):.2f} dB on {np.mean(g < 0.999)*100:.2f}% of samples')
    return mix * g[:, None]


def render(plan, out):
    secs = plan['sections']
    total = max(s['start'] + s['dur'] for s in secs)
    M = Mix(total)
    # pass 1: measure each section's music+drums level in isolation, so all styles sit at a similar loudness
    lv = {}
    for s in secs:
        L = Mix(s['dur'], s['start'])
        section_music(L, s['kind'], s['start'], s['dur'])
        body = L.bus['drums'] * 0.9 + L.bus['music'] * L.duck[:, None] * 0.85
        body = body[: t2n(s['dur'])]
        lv[s['start']] = np.sqrt((body ** 2).mean()) + 1e-9
    ref = float(np.median([v for k, v in lv.items()]))
    for s in secs:
        g = float(np.clip(ref / lv[s['start']], 0.5, 2.8)) * s.get('music_gain', 1.0)
        if s['kind'] == 'intro': g = min(g, 1.0)
        M.gain = g
        section_music(M, s['kind'], s['start'], s['dur'])
        print(f"  {s['kind']:>6} level {20*np.log10(lv[s['start']]):6.1f} dB  gain {g:4.2f}")
    M.gain = 1.0
    for s in secs:
        for c in s.get('cues', []):
            f = SFX.get(c['sfx'])
            if f is None: print('missing sfx', c['sfx']); continue
            x = f()
            M.add('sfx', x, s['start'] + c['t'], c.get('gain', 0.8), c.get('pan', 0.0), 0.25)
    # cut accents on every section boundary (except first)
    for c in plan.get('global_cues', []):
        f = SFX.get(c['sfx'])
        if f is None: print('missing sfx', c['sfx']); continue
        M.add('sfx', f(), c['t'], c.get('gain', 0.8), c.get('pan', 0.0), c.get('send', 0.2))
    music = M.bus['music'] * M.duck[:, None]
    ir = reverb_ir()
    verb = np.stack([signal.fftconvolve(M.bus['verb'][:, i], ir[:, i])[: M.n] for i in range(2)], 1)
    mix = M.bus['drums'] * 0.9 + music * 0.85 + M.bus['sfx'] * 0.9 + verb * 0.5
    mix = hp(mix.T, 28).T
    n_total = t2n(total)
    mix = mix[:n_total]
    fade = t2n(0.6); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    # loudness-ish normalize + soft limit
    rms = np.sqrt((mix ** 2).mean())
    mix *= 0.16 / (rms + 1e-9)
    mix = np.tanh(mix * 1.2) / 1.2
    peak = np.abs(mix).max(); mix *= 0.84 / peak if peak > 0.84 else 1   # leave headroom for AAC overshoot (true peak < -1 dBTP)
    mix = tp_limit(mix)
    pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
    from scipy.io import wavfile
    wavfile.write(out, SR, pcm)
    print('wrote', out, f'{total:.2f}s rms={np.sqrt((mix**2).mean()):.3f}')


if __name__ == '__main__':
    render(json.load(open(sys.argv[1])), sys.argv[2])
