"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, Check, ChevronDown, Copy, FileAudio, Loader2, MicOff, Mic, Pause, Play,
  RotateCcw, ShieldAlert, ShieldCheck, ShieldQuestion, Square, UploadCloud, VolumeX, Waves,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Gauge } from "@/components/gauge";
import { Waveform, idlePeaks } from "@/components/waveform";
import { extFromMime, formatBytes, formatDuration, readWaveform, recorderMime } from "@/lib/audio";
import { LIKELY_REAL_MIN, LIKELY_SYNTHETIC_MAX, type Interpretation } from "@/lib/interpret";
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, extensionOf, type VelmaFrame } from "@/lib/velma";
import { cn } from "@/lib/utils";

interface Sample { title: string; file: string; label: string; source: string; licence: string }
interface Result { filename: string | null; durationMs: number; frames: VelmaFrame[]; summary: Interpretation }
interface Picked { file: File; peaks: number[]; duration: number; origin: "upload" | "mic" | "sample" }
type Phase = "choose" | "analysing" | "result";

const MAX_RECORD_SEC = 30;
const STEPS = ["Choose audio", "Analyse", "Result"] as const;

const TONE = {
  real: { icon: ShieldCheck, title: "Likely real", box: "bg-real-soft text-real", text: "text-real" },
  synthetic: { icon: ShieldAlert, title: "Likely synthetic", box: "bg-synthetic-soft text-synthetic", text: "text-synthetic" },
  unsure: { icon: ShieldQuestion, title: "Unsure", box: "bg-unsure-soft text-unsure", text: "text-unsure" },
} as const;

const STATUS_LINES = ["Uploading the clip", "Velma is listening", "Scoring each four second window"];

export function Detector() {
  const [phase, setPhase] = useState<Phase>("choose");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [statusIdx, setStatusIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [decoding, setDecoding] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const step = phase === "choose" ? 0 : phase === "analysing" ? 1 : 2;

  useEffect(() => {
    fetch("/samples/manifest.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setSamples(d.filter((s) => s?.file && s?.title)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (phase !== "analysing") return;
    const t = setInterval(() => setStatusIdx((i) => Math.min(i + 1, STATUS_LINES.length - 1)), 2200);
    return () => clearInterval(t);
  }, [phase]);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setProgress(0);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => () => {
    stopPlayback();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  }, [stopPlayback]);

  const accept = useCallback(async (file: File, origin: Picked["origin"]) => {
    setError(null);
    setResult(null);
    stopPlayback();
    const ext = extensionOf(file.name);
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      setPicked(null);
      setError(`.${ext || "unknown"} files are not supported. Use ${ALLOWED_EXTENSIONS.join(", ")}.`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setPicked(null);
      setError(`That file is ${formatBytes(file.size)}. The demo accepts up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      return;
    }
    if (file.size === 0) { setPicked(null); setError("That file is empty."); return; }
    setDecoding(true);
    try {
      const { peaks, duration } = await readWaveform(file);
      setPicked({ file, peaks, duration, origin });
    } catch {
      setPicked(null);
      setError("Your browser could not read that audio. It may be corrupt or not really audio.");
    } finally {
      setDecoding(false);
    }
  }, [stopPlayback]);

  const togglePlay = () => {
    if (!picked) return;
    if (!audioRef.current) {
      urlRef.current = URL.createObjectURL(picked.file);
      const a = new Audio(urlRef.current);
      a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
      a.onended = () => { setPlaying(false); setProgress(0); };
      audioRef.current = a;
    }
    const a = audioRef.current;
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
    else { a.pause(); setPlaying(false); }
  };

  const startRecording = async () => {
    setMicError(null);
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicError("This browser cannot record audio. Upload a file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = recorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || mime || "audio/webm";
        const file = new File([new Blob(chunks, { type })], `recording.${extFromMime(type)}`, { type });
        void accept(file, "mic");
      };
      recRef.current = rec;
      stopPlayback();
      setPicked(null);
      setResult(null);
      rec.start();
      setRecording(true);
      setRecSec(0);
      timerRef.current = setInterval(() => {
        setRecSec((s) => {
          if (s + 1 >= MAX_RECORD_SEC) stopRecording();
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setMicError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was denied. Allow it in your browser's site settings, then try again, or upload a file."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : "Could not start the microphone.",
      );
    }
  };

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    setRecording(false);
  }

  const pickSample = async (s: Sample) => {
    setError(null);
    try {
      const res = await fetch(`/samples/${s.file}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      await accept(new File([blob], s.file, { type: blob.type }), "sample");
    } catch {
      setError(`Could not load the sample "${s.title}".`);
    }
  };

  const analyse = async () => {
    if (!picked) return;
    stopPlayback();
    setError(null);
    setStatusIdx(0);
    setPhase("analysing");
    try {
      const body = new FormData();
      body.append("file", picked.file, picked.file.name);
      const res = await fetch("/api/detect", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status}).`);
      setResult(json as Result);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("choose");
    }
  };

  const reset = () => {
    stopPlayback();
    setPicked(null);
    setResult(null);
    setError(null);
    setMicError(null);
    setPhase("choose");
  };

  const summary = result?.summary;
  const tone = summary && summary.label !== "no-speech" ? TONE[summary.label] : null;
  const pct = summary?.naturalShare != null ? summary.naturalShare * 100 : 0;

  const copyResult = async () => {
    if (!summary || !result) return;
    const text = summary.label === "no-speech"
      ? `Velma found no speech in ${picked?.file.name ?? "this clip"}.`
      : `${TONE[summary.label].title}: Velma judged ${pct.toFixed(0)}% of the speech in ${picked?.file.name ?? "this clip"} as natural (${(summary.speechMs / 1000).toFixed(1)}s of speech, ${result.frames.length} windows). Demo only. Scores are estimates and are not proof.`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  return (
    <Card className="mx-auto w-full max-w-3xl gap-0 overflow-hidden rounded-3xl border bg-card p-0 shadow-xl shadow-primary/5">
      {/* progress */}
      <ol className="grid grid-cols-3 border-b bg-muted/50" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}
            className={cn("relative flex items-center justify-center gap-2 px-2 py-3.5 text-sm font-medium sm:justify-start sm:px-6",
              i === step ? "text-foreground" : "text-muted-foreground")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
              i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-border text-muted-foreground")}>
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
            {i === step && <motion.span layoutId="step-underline" className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
          </li>
        ))}
      </ol>

      <div className="p-5 sm:p-8">
        <AnimatePresence mode="wait">
          {phase === "choose" && (
            <motion.div key="choose" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">
              <header>
                <h2 className="font-heading text-2xl font-semibold">1. Choose audio</h2>
                <p className="mt-1 text-sm text-muted-foreground">Upload a clip, record your voice, or pick a sample. Short clips of 4 to 60 seconds work best.</p>
              </header>

              {!picked && !recording && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void accept(f, "upload"); }}
                    className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
                      dragging ? "border-primary bg-accent" : "border-border bg-muted/30 hover:border-primary/60")}
                  >
                    <UploadCloud className="size-7 text-primary" aria-hidden />
                    <p className="text-sm font-medium">Drop an audio file here</p>
                    <p className="text-xs text-muted-foreground">wav, mp3, m4a, ogg, webm and more, up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB</p>
                    <input ref={inputRef} type="file" className="sr-only" id="file" aria-label="Choose an audio file"
                      accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",") + ",audio/*"}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f, "upload"); e.target.value = ""; }} />
                    <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Browse files</Button>
                  </div>

                  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border bg-muted/30 p-6 text-center">
                    <Mic className="size-7 text-primary" aria-hidden />
                    <p className="text-sm font-medium">Record from your microphone</p>
                    <p className="text-xs text-muted-foreground">Up to {MAX_RECORD_SEC} seconds. You can replay it before analysing.</p>
                    <Button size="sm" onClick={startRecording}><Mic className="size-4" /> Start recording</Button>
                  </div>
                </div>
              )}

              {micError && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-unsure-soft p-3 text-sm text-unsure">
                  <MicOff className="mt-0.5 size-4 shrink-0" /> {micError}
                </p>
              )}

              {recording && (
                <div className="flex flex-col items-center gap-4 rounded-2xl border bg-muted/30 p-6" aria-live="polite">
                  <div className="flex items-center gap-2 text-sm font-medium text-synthetic">
                    <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-synthetic opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-synthetic" /></span>
                    Recording {formatDuration(recSec)} / {formatDuration(MAX_RECORD_SEC)}
                  </div>
                  <Waveform peaks={idlePeaks()} animate />
                  <Button variant="destructive" onClick={stopRecording}><Square className="size-4" /> Stop</Button>
                </div>
              )}

              {decoding && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading audio</p>
              )}

              {picked && (
                <div className="space-y-4 rounded-2xl border bg-muted/30 p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <Button size="icon" className="size-11 shrink-0 rounded-full" onClick={togglePlay} aria-label={playing ? "Pause preview" : "Play preview"}>
                      {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
                    </Button>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium"><FileAudio className="size-4 shrink-0 text-muted-foreground" />{picked.file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDuration(picked.duration)} · {formatBytes(picked.file.size)} · {picked.origin === "mic" ? "recorded" : picked.origin === "sample" ? "sample" : "uploaded"}</p>
                    </div>
                  </div>
                  <Waveform peaks={picked.peaks} progress={progress} />
                </div>
              )}

              {samples.length > 0 && !recording && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or try a sample</p>
                  <div className="flex flex-wrap gap-2">
                    {samples.map((s) => (
                      <Button key={s.file} variant="secondary" size="sm" onClick={() => pickSample(s)} title={`${s.source} (${s.licence})`}>
                        <Waves className="size-4" /> {s.title}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-synthetic-soft p-3 text-sm text-synthetic">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{error}</span>
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">Analyses the clip after you finish. This version does not stream live audio.</p>
                <div className="flex gap-2">
                  {picked && <Button variant="ghost" onClick={reset}>Clear</Button>}
                  <Button size="lg" onClick={analyse} disabled={!picked || recording || decoding}>Analyse clip</Button>
                </div>
              </div>
            </motion.div>
          )}

          {phase === "analysing" && picked && (
            <motion.div key="analysing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 py-4 text-center" aria-live="polite">
              <header>
                <h2 className="font-heading text-2xl font-semibold">2. Analysing</h2>
                <p className="mt-1 text-sm text-muted-foreground" role="status">{STATUS_LINES[statusIdx]}...</p>
              </header>
              <Waveform peaks={picked.peaks} animate />
              <Button size="lg" disabled><Loader2 className="size-4 animate-spin" /> Analysing</Button>
            </motion.div>
          )}

          {phase === "result" && result && summary && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="space-y-6">
              <header className="text-center">
                <h2 className="font-heading text-2xl font-semibold">3. Result</h2>
              </header>

              {tone ? (
                <>
                  <Gauge value={pct} tone={summary.label as "real" | "synthetic" | "unsure"} />
                  <div className="text-center">
                    <span className={cn("inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold", tone.box)}>
                      <tone.icon className="size-4" /> {tone.title}
                    </span>
                    <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                      Velma judged {pct.toFixed(0)}% of the speech in this clip as natural, across {(summary.speechMs / 1000).toFixed(1)} seconds of detected speech.
                    </p>
                  </div>
                  <Timeline frames={result.frames} />
                </>
              ) : (
                <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl bg-muted p-6 text-center">
                  <VolumeX className="size-8 text-muted-foreground" />
                  <p className="font-medium">No speech detected</p>
                  <p className="text-sm text-muted-foreground">Velma marked every window as no content, so there is nothing to score. Try a clip with a voice in it.</p>
                </div>
              )}

              <Collapsible className="rounded-2xl border">
                <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                  How to read this score
                  <ChevronDown className="size-4 transition-transform group-data-[panel-open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 px-4 pb-4 text-sm text-muted-foreground">
                  <p>Velma scores every four second window of audio and gives each one a verdict (synthetic, non-synthetic, or no content) plus a confidence in that verdict. Confidence is how sure Velma is of its verdict. It is not the chance that the audio is fake.</p>
                  <p>The meter shows the share of detected speech, weighted by time, that Velma judged non-synthetic. Windows with no speech are left out.</p>
                  <p>Modulate does not publish a clip-level cut-off. The labels here use demo defaults from this repo: {Math.round(LIKELY_REAL_MIN * 100)}% or more reads as likely real, {Math.round(LIKELY_SYNTHETIC_MAX * 100)}% or less as likely synthetic, and anything between as unsure. Modulate advises setting your own threshold against your own labelled recordings.</p>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={reset}><RotateCcw className="size-4" /> Try another clip</Button>
                <Button size="lg" variant="outline" onClick={copyResult}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy result"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

function Timeline({ frames }: { frames: VelmaFrame[] }) {
  if (!frames.length) return null;
  const total = frames[frames.length - 1].end_time_ms || 1;
  const color = (v: VelmaFrame["verdict"]) =>
    v === "synthetic" ? "bg-synthetic" : v === "non-synthetic" ? "bg-real" : "bg-border";
  return (
    <figure className="mx-auto max-w-md">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img"
        aria-label={`Verdict per window: ${frames.map((f) => f.verdict).join(", ")}`}>
        {frames.map((f, i) => (
          <div key={i} className={cn("h-full border-r border-card last:border-0", color(f.verdict))}
            style={{ width: `${((f.end_time_ms - f.start_time_ms) / total) * 100}%`, opacity: f.verdict === "no-content" ? 0.6 : 0.35 + 0.65 * f.confidence }} />
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-real" />natural</span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-synthetic" />synthetic</span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-border" />no speech</span>
        <span>Brighter means more confident</span>
      </figcaption>
    </figure>
  );
}
