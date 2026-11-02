"""Synthesise a soft, loopable ambient pad so the background-music plumbing can be
heard immediately. No samples, no copyright: pure sine partials, 4 slow chords,
16 s loop, gentle envelope so the seam is inaudible.

usage: python _mkmusic.py <out.wav>
"""
import math
import struct
import sys
import wave

SR = 44100
DUR = 16.0
OUT = sys.argv[1]

# A slow, calm progression (A minor 7 -> F major 7 -> C major -> G), two bars each.
CHORDS = [
    [220.00, 261.63, 329.63, 415.30],  # Am7
    [174.61, 220.00, 261.63, 329.63],  # Fmaj7
    [130.81, 196.00, 261.63, 329.63],  # C
    [196.00, 246.94, 293.66, 392.00],  # G
]
CHORD_SECONDS = DUR / len(CHORDS)
N = int(SR * DUR)


def envelope(t_in_chord):
    """Long fade in/out inside each chord, so chord changes glide."""
    x = t_in_chord / CHORD_SECONDS
    return math.sin(math.pi * min(max(x, 0.0), 1.0)) ** 1.5


frames = bytearray()
for i in range(N):
    t = i / SR
    idx = min(int(t / CHORD_SECONDS), len(CHORDS) - 1)
    local = t - idx * CHORD_SECONDS
    env = envelope(local)
    left = right = 0.0
    for k, freq in enumerate(CHORDS[idx]):
        # fundamental + a quiet octave gives a soft "pad" rather than a bare tone
        phase = 2 * math.pi * freq * t
        voice = math.sin(phase) + 0.18 * math.sin(2 * phase)
        pan = 0.5 + 0.32 * math.sin(2 * math.pi * (0.03 + 0.01 * k) * t)
        left += voice * (1.0 - pan)
        right += voice * pan
    left *= env / 6.0
    right *= env / 6.0
    # very quiet master level: background, not foreground
    gain = 0.35
    frames += struct.pack('<hh', int(max(-1.0, min(1.0, left * gain)) * 32767),
                          int(max(-1.0, min(1.0, right * gain)) * 32767))

with wave.open(OUT, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(bytes(frames))
print(f'wrote {OUT} ({DUR:g}s, {len(frames) / 1024 / 1024:.1f} MiB)')
