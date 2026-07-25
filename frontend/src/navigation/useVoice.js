// ═══════════════════════════════════════════════════════════════════════
// USE VOICE — a simple voice-command hook: listens once, transcribes,
// hands the transcript to a callback along with a speak() function for
// the callback to respond with. Used by MainApp for "go to X" navigation.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useCallback } from "react";

export function useVoice(onCmd) {
  const [listening, setListening] = useState(false);
  const speak = useCallback((t) => {
    if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(t); u.rate = 1.05; speechSynthesis.speak(u); }
  }, []);
  const toggle = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return speak("Voice not supported");
    if (listening) return setListening(false);
    const r = new SR(); r.continuous = false; r.lang = "en-US";
    r.onresult = (e) => { onCmd(e.results[0][0].transcript.toLowerCase().trim(), speak); setListening(false); };
    r.onerror = () => setListening(false); r.onend = () => setListening(false);
    r.start(); setListening(true);
  }, [listening, onCmd, speak]);
  return { listening, toggle, speak };
}
