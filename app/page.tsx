"use client";

import NextImage from "next/image";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import styles from "./page.module.css";

type Scene = {
  id: string;
  dialogue: string;
  duration: number;
  imageDataUrl?: string;
  imageName?: string;
  audioName?: string;
  audioArrayBuffer?: ArrayBuffer;
  audioDuration?: number;
  accentColor: string;
};

type CanvasPreset = {
  label: string;
  width: number;
  height: number;
};

type SceneMeta = {
  scene: Scene;
  image: HTMLImageElement;
  duration: number;
  audioLength: number;
};

const DURATION_MIN = 1;
const DURATION_MAX = 30;

const canvasPresets: CanvasPreset[] = [
  { label: "HD 16:9 (1280x720)", width: 1280, height: 720 },
  { label: "FHD 16:9 (1920x1080)", width: 1920, height: 1080 },
  { label: "Cuadrado 1:1 (1080x1080)", width: 1080, height: 1080 },
  { label: "Vertical 9:16 (1080x1920)", width: 1080, height: 1920 }
];

const fpsOptions = [24, 30, 60];

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
};

const randomAccent = () =>
  `hsl(${Math.floor(Math.random() * 360)}, 82%, 58%)`;

const createScene = (): Scene => ({
  id: createId(),
  dialogue: "",
  duration: 6,
  accentColor: randomAccent()
});

const formatSeconds = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

export default function Page() {
  const [scenes, setScenes] = useState<Scene[]>(() => [createScene()]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [canvasPreset, setCanvasPreset] = useState<CanvasPreset>(canvasPresets[0]);
  const [fps, setFps] = useState<number>(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">(
    "neutral"
  );
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const [recordingSceneId, setRecordingSceneId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (!selectedSceneId && scenes.length > 0) {
      setSelectedSceneId(scenes[0].id);
    } else if (
      selectedSceneId &&
      !scenes.some((scene) => scene.id === selectedSceneId)
    ) {
      setSelectedSceneId(scenes[0]?.id ?? null);
    }
  }, [scenes, selectedSceneId]);

  useEffect(() => {
    return () => {
      if (generatedVideoUrl) {
        URL.revokeObjectURL(generatedVideoUrl);
      }
    };
  }, [generatedVideoUrl]);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = canvasPreset.width;
      canvasRef.current.height = canvasPreset.height;
    }
  }, [canvasPreset]);

  const totalDuration = useMemo(() => {
    return scenes.reduce((sum, scene) => {
      const base = Math.max(scene.duration, DURATION_MIN);
      if (scene.audioDuration) {
        return sum + Math.max(base, scene.audioDuration);
      }
      return sum + base;
    }, 0);
  }, [scenes]);

  const selectedScene = useMemo(
    () => scenes.find((scene) => scene.id === selectedSceneId) ?? null,
    [scenes, selectedSceneId]
  );

  const ensureAudioContext = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const handleDialogueChange = (sceneId: string, value: string) => {
    setScenes((prev) =>
      prev.map((scene) =>
        scene.id === sceneId ? { ...scene, dialogue: value } : scene
      )
    );
  };

  const handleDurationChange = (sceneId: string, duration: number) => {
    setScenes((prev) =>
      prev.map((scene) =>
        scene.id === sceneId ? { ...scene, duration } : scene
      )
    );
  };

  const handleImageUpload = (sceneId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setScenes((prev) =>
        prev.map((scene) =>
          scene.id === sceneId
            ? { ...scene, imageDataUrl: dataUrl, imageName: file.name }
            : scene
        )
      );
    };
    reader.readAsDataURL(file);
  };

  const handleAudioUpload = async (sceneId: string, file: File | null) => {
    if (!file) return;
    try {
      const ctx = await ensureAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      setScenes((prev) =>
        prev.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                audioArrayBuffer: arrayBuffer.slice(0),
                audioName: file.name,
                audioDuration: decoded.duration
              }
            : scene
        )
      );
      setStatusTone("success");
      setStatusMessage("Audio cargado en la escena.");
    } catch (error) {
      console.error("Error al decodificar audio", error);
      setStatusTone("error");
      setStatusMessage("No se pudo decodificar el archivo de audio.");
    }
  };

  const clearAudio = (sceneId: string) => {
    setScenes((prev) =>
      prev.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              audioArrayBuffer: undefined,
              audioDuration: undefined,
              audioName: undefined
            }
          : scene
      )
    );
  };

  const addScene = () => {
    setScenes((prev) => {
      const next = [...prev, createScene()];
      return next;
    });
  };

  const duplicateScene = (sceneId: string) => {
    setScenes((prev) => {
      const index = prev.findIndex((scene) => scene.id === sceneId);
      if (index === -1) return prev;
      const clone: Scene = {
        ...prev[index],
        id: createId(),
        accentColor: randomAccent()
      };
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const removeScene = (sceneId: string) => {
    setScenes((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((scene) => scene.id !== sceneId);
    });
  };

  const startRecording = async (sceneId: string) => {
    if (isRecording) return;
    try {
      const ctx = await ensureAudioContext();
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      const recorder = new MediaRecorder(mediaStream);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        setIsRecording(false);
        setRecordingSceneId(null);
        mediaStream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        const blob = new Blob(recordingChunksRef.current, {
          type: "audio/webm"
        });
        if (blob.size === 0) return;
        const arrayBuffer = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        setScenes((prev) =>
          prev.map((scene) =>
            scene.id === sceneId
              ? {
                  ...scene,
                  audioArrayBuffer: arrayBuffer.slice(0),
                  audioDuration: decoded.duration,
                  audioName: "Grabación de voz"
                }
              : scene
          )
        );
        setStatusTone("success");
        setStatusMessage("Grabación guardada en la escena.");
      };
      recorderRef.current = recorder;
      recordingStreamRef.current = mediaStream;
      setRecordingSceneId(sceneId);
      setIsRecording(true);
      recorder.start();
    } catch (error) {
      console.error("No se pudo iniciar la grabación", error);
      setStatusTone("error");
      setStatusMessage("No se pudo acceder al micrófono.");
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    recorderRef.current?.stop();
  };

  const loadImage = (src: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = document.createElement("img");
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  };

  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) => {
    const words = text.split(/\s+/);
    let line = "";
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
      const testLine = line ? `${line} ${words[n]}` : words[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n];
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, currentY);
    }
  };

  const drawSceneFrame = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    meta: SceneMeta,
    elapsed: number,
    total: number
  ) => {
    const { image, scene } = meta;
    const { width, height } = canvas;
    ctx.save();
    ctx.fillStyle = "#020409";
    ctx.fillRect(0, 0, width, height);
    const imgRatio = image.width / image.height;
    const canvasRatio = width / height;
    let drawWidth = width;
    let drawHeight = height;
    if (imgRatio > canvasRatio) {
      drawHeight = width / imgRatio;
    } else {
      drawWidth = height * imgRatio;
    }
    const dx = (width - drawWidth) / 2;
    const dy = (height - drawHeight) / 2;
    ctx.drawImage(image, dx, dy, drawWidth, drawHeight);

    if (scene.dialogue.trim()) {
      const captionHeight = height * 0.28;
      const gradient = ctx.createLinearGradient(0, height - captionHeight, 0, height);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(0.4, "rgba(0,0,0,0.45)");
      gradient.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, height - captionHeight, width, captionHeight);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f8fafc";
      ctx.font = `600 ${Math.max(28, width * 0.026)}px "Inter", sans-serif`;
      wrapText(
        ctx,
        scene.dialogue.trim(),
        width / 2,
        height - captionHeight / 2,
        width * 0.7,
        Math.max(34, width * 0.035)
      );
    }

    const progressWidth = width * 0.6;
    const progressHeight = Math.max(10, height * 0.015);
    const progressX = (width - progressWidth) / 2;
    const progressY = height - progressHeight - Math.max(40, height * 0.04);
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(progressX, progressY, progressWidth, progressHeight);
    ctx.fillStyle = scene.accentColor;
    const completion = total > 0 ? Math.min(1, elapsed / total) : 1;
    ctx.fillRect(progressX, progressY, progressWidth * completion, progressHeight);

    ctx.restore();
  };

  const generateVideo = async () => {
    if (isGenerating) return;
    if (!canvasRef.current) {
      setStatusTone("error");
      setStatusMessage("Necesitamos un canvas disponible para renderizar.");
      return;
    }
    const scenesReady = scenes.filter((scene) => scene.imageDataUrl);
    if (scenesReady.length === 0) {
      setStatusTone("error");
      setStatusMessage("Agrega al menos una escena con imagen para generar el video.");
      return;
    }
    setIsGenerating(true);
    setStatusTone("neutral");
    setStatusMessage("Preparando escenas y recursos...");

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("No se pudo obtener el contexto 2D");
      }
      const images = await Promise.all(
        scenesReady.map((scene) => loadImage(scene.imageDataUrl as string))
      );

      const audioCtx = new AudioContext();
      await audioCtx.resume();
      const destination = audioCtx.createMediaStreamDestination();
      const metas: SceneMeta[] = [];
      let audioTimelineCursor = audioCtx.currentTime + 0.4;

      for (let i = 0; i < scenesReady.length; i++) {
        const scene = scenesReady[i];
        const image = images[i];
        let duration = Math.max(scene.duration, DURATION_MIN);
        let audioLength = 0;
        let audioBuffer: AudioBuffer | null = null;

        if (scene.audioArrayBuffer) {
          const decoded = await audioCtx.decodeAudioData(
            scene.audioArrayBuffer.slice(0)
          );
          audioBuffer = decoded;
          audioLength = decoded.duration;
          duration = Math.max(duration, audioLength);
        } else {
          audioLength = duration;
          audioBuffer = audioCtx.createBuffer(
            1,
            Math.max(1, Math.floor(duration * audioCtx.sampleRate)),
            audioCtx.sampleRate
          );
        }

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(destination);
        source.start(audioTimelineCursor);
        metas.push({
          scene,
          image,
          duration,
          audioLength
        });
        audioTimelineCursor += duration;
      }

      const totalTimelineDuration = metas.reduce(
        (acc, meta) => acc + meta.duration,
        0
      );
      if (totalTimelineDuration <= 0) {
        throw new Error("La duración total del video es inválida.");
      }

      const videoStream = canvas.captureStream(fps);
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ]);

      const preferredMime =
        "video/webm;codecs=vp9,opus";
      const fallbackMime =
        "video/webm;codecs=vp8,opus";
      const mimeType = MediaRecorder.isTypeSupported(preferredMime)
        ? preferredMime
        : MediaRecorder.isTypeSupported(fallbackMime)
        ? fallbackMime
        : "video/webm";

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 6_000_000,
        audioBitsPerSecond: 192_000
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const recorderPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = async () => {
          try {
            await audioCtx.close();
          } catch {
            // ignore close errors
          }
          resolve(new Blob(chunks, { type: mimeType }));
        };
      });

      recorder.start(500);
      setStatusMessage("Renderizando video con IA...");

      const startInstant = performance.now();
      let animationFrame = 0;

      const renderFrame = (timestamp: number) => {
        const elapsed = (timestamp - startInstant) / 1000;
        let accumulated = 0;
        let currentMeta = metas[metas.length - 1];
        let currentStart = totalTimelineDuration - currentMeta.duration;

        for (const meta of metas) {
          const metaStart = accumulated;
          const metaEnd = accumulated + meta.duration;
          if (elapsed >= metaStart && elapsed < metaEnd) {
            currentMeta = meta;
            currentStart = metaStart;
            break;
          }
          accumulated += meta.duration;
        }

        const sceneElapsed = Math.min(
          currentMeta.duration,
          Math.max(0, elapsed - currentStart)
        );
        drawSceneFrame(ctx, canvas, currentMeta, sceneElapsed, currentMeta.duration);

        if (elapsed < totalTimelineDuration) {
          animationFrame = requestAnimationFrame(renderFrame);
        } else {
          drawSceneFrame(
            ctx,
            canvas,
            metas[metas.length - 1],
            metas[metas.length - 1].duration,
            metas[metas.length - 1].duration
          );
          recorder.stop();
        }
      };

      animationFrame = requestAnimationFrame(renderFrame);
      const videoBlob = await recorderPromise;
      cancelAnimationFrame(animationFrame);
      const url = URL.createObjectURL(videoBlob);
      if (generatedVideoUrl) {
        URL.revokeObjectURL(generatedVideoUrl);
      }
      setGeneratedVideoUrl(url);
      setStatusTone("success");
      setStatusMessage("Video generado exitosamente.");
    } catch (error) {
      console.error("Error al generar el video", error);
      setStatusTone("error");
      setStatusMessage("Hubo un problema al generar el video.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSceneImageChange = (sceneId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageUpload(sceneId, file);
    }
    event.target.value = "";
  };

  const handleSceneAudioChange = (sceneId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleAudioUpload(sceneId, file);
    }
    event.target.value = "";
  };

  const timelineSegments = useMemo(() => {
    const total = scenes.reduce((acc, scene) => {
      const duration = Math.max(scene.duration, scene.audioDuration ?? 0, DURATION_MIN);
      return acc + duration;
    }, 0);
    if (total === 0) return [];
    return scenes.map((scene) => {
      const duration = Math.max(scene.duration, scene.audioDuration ?? 0, DURATION_MIN);
      return {
        id: scene.id,
        width: `${(duration / total) * 100}%`,
        color: scene.accentColor
      };
    });
  }, [scenes]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.tag}>Sin límites | Generador IA</div>
        <h1 className={styles.headline}>
          Crea videos con IA a partir de tus imágenes, voces y diálogos sin restricciones.
        </h1>
        <p className={styles.subhead}>
          Diseña escenas ilimitadas, mezcla tus fotografías o renders con narraciones,
          genera el metraje en alta resolución y descárgalo instantáneamente listo para tus proyectos más creativos.
        </p>
        <div className={styles.ctaRow}>
          <button className={styles.ctaPrimary} onClick={generateVideo} disabled={isGenerating}>
            {isGenerating ? "Generando video..." : "Generar video ahora"}
          </button>
        </div>
      </header>

      <section className={styles.studio}>
        <aside className={styles.panel}>
          <div className={styles.panelTitle}>Escenas</div>
          <div className={styles.sceneList}>
            {scenes.map((scene, index) => (
              <button
                key={scene.id}
                className={clsx(
                  styles.sceneCard,
                  selectedSceneId === scene.id && styles.sceneCardActive
                )}
                onClick={() => setSelectedSceneId(scene.id)}
              >
                <div className={styles.sceneThumb}>
                  {scene.imageDataUrl ? (
                    <NextImage
                      src={scene.imageDataUrl}
                      alt={`Escena ${index + 1}`}
                      fill
                      unoptimized
                      sizes="72px"
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <>Imagen<br />no asignada</>
                  )}
                </div>
                <div className={styles.sceneMeta}>
                  <div className={styles.sceneTitle}>Escena {index + 1}</div>
                  <div className={styles.sceneCaption}>
                    {scene.audioDuration
                      ? `Duración: ${formatSeconds(
                          Math.max(scene.duration, scene.audioDuration)
                        )}`
                      : `Duración: ${scene.duration.toFixed(1)}s`}
                  </div>
                  <div className={styles.sceneCaption}>
                    {scene.dialogue
                      ? `${scene.dialogue.slice(0, 42)}${
                          scene.dialogue.length > 42 ? "…" : ""
                        }`
                      : "Sin diálogo"}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className={styles.sceneActions}>
            <button className={styles.buttonGhost} onClick={addScene}>
              Añadir escena
            </button>
            {selectedScene && (
              <button
                className={styles.buttonGhost}
                onClick={() => duplicateScene(selectedScene.id)}
              >
                Duplicar
              </button>
            )}
          </div>
          {selectedScene && scenes.length > 1 && (
            <button
              className={clsx(styles.buttonGhost, styles.danger)}
              onClick={() => removeScene(selectedScene.id)}
            >
              Eliminar escena seleccionada
            </button>
          )}
          <div className={styles.timeline}>
            <div className={styles.panelTitle}>Línea de tiempo</div>
            <div className={styles.timelineBar}>
              {timelineSegments.map((segment) => (
                <span
                  key={segment.id}
                  className={styles.timelineSegment}
                  style={{ width: segment.width, background: segment.color }}
                />
              ))}
            </div>
            <div className={styles.timelineInfo}>
              <span>{scenes.length} escenas</span>
              <span>Total: {formatSeconds(totalDuration)}</span>
            </div>
          </div>
        </aside>

        <section className={clsx(styles.panel, styles.panelDense)}>
          {selectedScene ? (
            <div className={styles.editor}>
              <div className={styles.editorStack}>
                <div className={styles.field}>
                  <label>Imagen base</label>
                  <input
                    type="file"
                    accept="image/*"
                    className={styles.input}
                    onChange={(event) =>
                      handleSceneImageChange(selectedScene.id, event)
                    }
                  />
                  {selectedScene.imageName ? (
                    <span className={styles.status}>
                      Imagen: {selectedScene.imageName}
                    </span>
                  ) : (
                    <div className={styles.emptyState}>
                      <span>Arrastra o seleccione una imagen para esta escena.</span>
                      <span>
                        Admite renders, fotografías, ilustraciones y cualquier formato popular.
                      </span>
                    </div>
                  )}
                </div>

                <div className={styles.field}>
                  <label>Diálogo / Subtítulo</label>
                  <textarea
                    className={clsx(styles.input, styles.textarea)}
                    placeholder="Describe lo que dice el personaje, la narración o cualquier texto que quieras mostrar."
                    value={selectedScene.dialogue}
                    onChange={(event) =>
                      handleDialogueChange(selectedScene.id, event.target.value)
                    }
                  />
                </div>

                <div className={styles.field}>
                  <label>Duración de la escena</label>
                  <div className={styles.rangeRow}>
                    <span>{selectedScene.duration.toFixed(1)}s</span>
                    <input
                      type="range"
                      min={DURATION_MIN}
                      max={DURATION_MAX}
                      step={0.5}
                      value={selectedScene.duration}
                      onChange={(event) =>
                        handleDurationChange(
                          selectedScene.id,
                          Number(event.target.value)
                        )
                      }
                      style={{ flex: 1 }}
                    />
                  </div>
                  {selectedScene.audioDuration &&
                    selectedScene.audioDuration > selectedScene.duration && (
                      <div className={styles.status}>
                        El audio dura más que la escena. Se extenderá a{" "}
                        {selectedScene.audioDuration.toFixed(1)}s
                      </div>
                    )}
                </div>

                <div className={styles.field}>
                  <label>Audio</label>
                  <div className={styles.inlineActions}>
                    <input
                      type="file"
                      accept="audio/*"
                      className={styles.input}
                      onChange={(event) =>
                        handleSceneAudioChange(selectedScene.id, event)
                      }
                    />
                    {!isRecording || recordingSceneId !== selectedScene.id ? (
                      <button
                        className={styles.buttonGhost}
                        onClick={() => startRecording(selectedScene.id)}
                      >
                        Grabar voz
                      </button>
                    ) : (
                      <button className={styles.buttonGhost} onClick={stopRecording}>
                        Detener grabación
                      </button>
                    )}
                    {selectedScene.audioArrayBuffer && (
                      <button
                        className={clsx(styles.buttonGhost, styles.danger)}
                        onClick={() => clearAudio(selectedScene.id)}
                      >
                        Quitar audio
                      </button>
                    )}
                  </div>
                  {isRecording && recordingSceneId === selectedScene.id && (
                    <span className={styles.status}>Grabando… habla cuando quieras.</span>
                  )}
                  {selectedScene.audioName && (
                    <div className={styles.badgeGroup}>
                      <span className={styles.audioBadge}>
                        Audio asignado • {selectedScene.audioName} •{" "}
                        {formatSeconds(selectedScene.audioDuration ?? 0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className={styles.field}>
                  <label>Vista previa</label>
                  <div className={styles.canvasWrap}>
                    <canvas
                      ref={canvasRef}
                      className={styles.canvas}
                      width={canvasPreset.width}
                      height={canvasPreset.height}
                    />
                  </div>
                </div>

                <div className={styles.optionsGrid}>
                  <div className={styles.optionBox}>
                    <label>Resolución</label>
                    <select
                      value={canvasPreset.label}
                      onChange={(event) => {
                        const preset = canvasPresets.find(
                          ({ label }) => label === event.target.value
                        );
                        if (preset) {
                          setCanvasPreset(preset);
                        }
                      }}
                    >
                      {canvasPresets.map((preset) => (
                        <option key={preset.label} value={preset.label}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.optionBox}>
                    <label>FPS</label>
                    <select
                      value={fps}
                      onChange={(event) => setFps(Number(event.target.value))}
                    >
                      {fpsOptions.map((value) => (
                        <option key={value} value={value}>
                          {value} FPS
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.generatorActions}>
                  <button
                    className={styles.primary}
                    onClick={generateVideo}
                    disabled={isGenerating}
                  >
                    {isGenerating ? "Generando video IA..." : "Generar video IA"}
                  </button>
                  <div
                    className={clsx(
                      styles.status,
                      statusTone === "success" && styles.statusSuccess,
                      statusTone === "error" && styles.statusError
                    )}
                  >
                    {statusMessage}
                  </div>
                </div>

                {generatedVideoUrl && (
                  <div className={styles.videoPreview}>
                    <div className={styles.panelTitle}>Video listo</div>
                    <video controls src={generatedVideoUrl} />
                    <div className={styles.status}>
                      Puedes descargar el video o subirlo directamente a tu plataforma favorita.
                    </div>
                    <div className={styles.inlineActions}>
                      <a
                        className={styles.buttonGhost}
                        href={generatedVideoUrl}
                        download="video-ia.webm"
                      >
                        Descargar .webm
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <span>Selecciona una escena para editar sus detalles.</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
