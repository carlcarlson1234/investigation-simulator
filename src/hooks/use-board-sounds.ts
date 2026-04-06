"use client";

import { useCallback, useRef, useState, useEffect } from "react";

const MUTE_KEY = "board-sound-mute";

type SoundName = "pickup" | "drop" | "connection" | "discovery" | "error";

// All sounds are synthesized — no audio files needed
const SOUNDS: Record<SoundName, (ctx: AudioContext) => void> = {
  // Soft ascending sweep — paper lifting from desk
  pickup(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  },

  // Soft descending thud — thumbtack into cork
  drop(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  },

  // Two-tone chime — click/latch
  connection(ctx) {
    const play = (freq: number, delay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.12);
    };
    play(523, 0);     // C5
    play(659, 0.08);  // E5
  },

  // Three ascending notes — warm notification
  discovery(ctx) {
    const play = (freq: number, delay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    };
    play(523, 0);     // C5
    play(659, 0.06);  // E5
    play(784, 0.12);  // G5
  },

  // Low buzz — soft rejection
  error(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  },
};

export function useBoardSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(true); // default true until we read localStorage

  // Read mute preference on mount
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "true");
    } catch {
      setMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try { localStorage.setItem(MUTE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (muted) return;
      try {
        if (!ctxRef.current) {
          ctxRef.current = new AudioContext();
        }
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") {
          ctx.resume();
        }
        SOUNDS[name](ctx);
      } catch {
        // Audio not available — silently ignore
      }
    },
    [muted]
  );

  return { play, muted, toggleMute };
}
