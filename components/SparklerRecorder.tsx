import React, { useEffect, useRef, useState, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Particle, Point, RecorderState } from '../types';
import { createTrailParticle, createBurstParticles, updateParticles, drawParticles } from '../utils/particleEngine';
import { 
  INERTIA_FACTOR, 
  DRAW_SPEED_THRESHOLD, 
  BURST_ARM_SPEED, 
  BURST_TRIGGER_SPEED, 
  VIDEO_WIDTH, 
  VIDEO_HEIGHT,
  TARGET_FPS,
  TRAIL_COLOR
} from '../constants';
import { RecorderControls } from './RecorderControls';

// Indices for: Thumb, Index, Middle, Ring, Pinky
const FINGER_INDICES = [4, 8, 12, 16, 20];

// Subtle variations of gold/warm colors for different fingers
const FINGER_COLORS = [
  '255, 120, 80',   // Thumb (Red-Orange)
  '255, 215, 0',    // Index (Gold - Default)
  '255, 240, 150',  // Middle (Pale Gold)
  '255, 200, 50',   // Ring (Deep Yellow)
  '255, 160, 100'   // Pinky (Peach)
];

interface EmitterState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    isBurstArmed: boolean;
}

export const SparklerRecorder: React.FC = () => {
  // -- Refs --
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  
  // -- Physics State --
  const particlesRef = useRef<Particle[]>([]);
  
  // Map key: "${handIndex}-${fingerIndex}" -> State
  const emittersRef = useRef<Map<string, EmitterState>>(new Map());
  
  const lightingIntensityRef = useRef<number>(0);
  
  // -- React State --
  const [recorderState, setRecorderState] = useState<RecorderState>(RecorderState.IDLE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // -- Initialization --
  useEffect(() => {
    let isMounted = true;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        if (!isMounted) return;

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2 // Updated to support 2 hands
        });

        setIsLoading(false);
        startCamera();
      } catch (err) {
        console.error("MediaPipe Init Error:", err);
        setCameraError("Failed to load AI models.");
      }
    };

    setupMediaPipe();

    return () => {
      isMounted = false;
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const startCamera = async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: VIDEO_WIDTH },
          height: { ideal: VIDEO_HEIGHT },
          facingMode: 'user'
        },
        audio: true // Request audio for recording
      });

      videoRef.current.srcObject = stream;
      videoRef.current.addEventListener("loadeddata", () => {
        animate();
      });
    } catch (err) {
      console.error("Camera Error:", err);
      setCameraError("Please allow camera access to use this app.");
    }
  };

  // -- The Core Loop --
  const animate = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;

    if (!video || !canvas || !landmarker) {
        requestRef.current = requestAnimationFrame(animate);
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Setup Canvas Dimensions if changed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // 2. Draw Mirrored Video
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 3. Process Tracking
    // We only detect if we have enough data (video is playing)
    if (video.currentTime > 0 && !video.paused && !video.ended) {
      const startTimeMs = performance.now();
      const results = landmarker.detectForVideo(video, startTimeMs);

      // Identify which emitters are active this frame
      const activeKeys = new Set<string>();

      if (results.landmarks && results.landmarks.length > 0) {
        
        // Calculate Dynamic Density Multiplier
        // The more fingers tracked, the fewer particles each one emits to save FPS/visuals.
        const totalActiveEmitters = results.landmarks.length * 5; 
        const particleMultiplier = 1 / Math.max(1, totalActiveEmitters * 0.5);

        results.landmarks.forEach((hand, handIndex) => {
           FINGER_INDICES.forEach((tipIdx, fingerIndex) => {
              const tip = hand[tipIdx];
              // Mirror Logic: (1 - x) because of canvas mirroring
              const targetX = (1 - tip.x) * canvas.width;
              const targetY = tip.y * canvas.height;
              
              const key = `${handIndex}-${fingerIndex}`;
              activeKeys.add(key);

              // Update this specific emitter
              updateEmitter(
                  key, 
                  targetX, 
                  targetY, 
                  particleMultiplier, 
                  FINGER_COLORS[fingerIndex] || TRAIL_COLOR
              );
           });
        });
      }

      // Cleanup: Remove emitters that are no longer tracked (e.g. hand left frame)
      // This prevents "teleporting" streaks when a hand reappears elsewhere
      for (const key of emittersRef.current.keys()) {
          if (!activeKeys.has(key)) {
              emittersRef.current.delete(key);
          }
      }
    }

    // 4. Draw Lighting Effects
    if (lightingIntensityRef.current > 0.01) {
        ctx.fillStyle = `rgba(255, 120, 50, ${lightingIntensityRef.current * 0.4})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        lightingIntensityRef.current *= 0.85; // Rapid decay
    }

    // 5. Draw Particles
    particlesRef.current = updateParticles(particlesRef.current, canvas.width, canvas.height);
    drawParticles(ctx, particlesRef.current);

    requestRef.current = requestAnimationFrame(animate);
  };

  const updateEmitter = (
      key: string, 
      targetX: number, 
      targetY: number, 
      particleChance: number,
      color: string
    ) => {
      
    // Get or Create Emitter State
    let emitter = emittersRef.current.get(key);
    if (!emitter) {
        emitter = { x: targetX, y: targetY, vx: 0, vy: 0, isBurstArmed: false };
        emittersRef.current.set(key, emitter);
        // Don't update physics on creation frame to avoid 0->pos streaks
        return; 
    }

    // Inertia: Smooth the emitter movement
    const dx = targetX - emitter.x;
    const dy = targetY - emitter.y;
    
    emitter.x += dx * INERTIA_FACTOR;
    emitter.y += dy * INERTIA_FACTOR;

    // Velocity Calculation
    const vx = dx * INERTIA_FACTOR;
    const vy = dy * INERTIA_FACTOR;
    const speed = Math.sqrt(vx * vx + vy * vy);
    
    // Update stored velocity
    emitter.vx = vx;
    emitter.vy = vy;

    // -- State Machine: Draw vs Burst --
    
    // 1. Arming the burst
    if (speed > BURST_ARM_SPEED) {
        emitter.isBurstArmed = true;
    }

    // 2. Triggering the burst
    if (emitter.isBurstArmed && speed < BURST_TRIGGER_SPEED) {
        // TRIGGER!
        const burstParticles = createBurstParticles(emitter.x, emitter.y);
        particlesRef.current.push(...burstParticles);
        
        // Flash light (Global effect, so we clamp it)
        lightingIntensityRef.current = Math.min(lightingIntensityRef.current + 0.5, 1.0);
        
        // Reset
        emitter.isBurstArmed = false;
    }

    // 3. Emitting Trails
    if (speed > DRAW_SPEED_THRESHOLD) {
        // Probabilistic emission based on dynamic density
        // We accumulate "chance" 
        // Example: if particleChance is 0.2, we have 20% chance per frame per finger to emit 1 particle.
        // But original code emitted ~3 particles. 
        // Let's scale the *number* of particles or probability.
        // Better: Scale Probability. 
        
        // Original logic: Emit 1 always, maybe 2.
        // New logic: Check against random.
        
        // We want at least a solid stream. 
        // If density is high (10 fingers), chance is ~0.2.
        
        if (Math.random() < particleChance) {
             const newParticle = createTrailParticle(
                emitter.x, 
                emitter.y, 
                { x: vx, y: vy },
                color
            );
            particlesRef.current.push(newParticle);
        }
        
        // Secondary particle for density (only if speed is high AND chance is favorable)
        if (speed > DRAW_SPEED_THRESHOLD * 2 && Math.random() < particleChance) {
             particlesRef.current.push(createTrailParticle(
                emitter.x, 
                emitter.y, 
                { x: vx, y: vy },
                color
            ));
        }
    }
  };


  // -- Recording Logic --

  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setRecorderState(RecorderState.RECORDING);
    recordedChunksRef.current = [];

    // Capture stream from canvas. 
    const canvasStream = canvas.captureStream(TARGET_FPS);
    
    // Mix in microphone audio if available
    if (videoRef.current && videoRef.current.srcObject) {
        const videoStream = videoRef.current.srcObject as MediaStream;
        const audioTracks = videoStream.getAudioTracks();
        if (audioTracks.length > 0) {
            canvasStream.addTrack(audioTracks[0]);
        }
    }

    // Prefer vp9 for webm, fallback to standard
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
    }

    try {
        const recorder = new MediaRecorder(canvasStream, options);
        
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };

        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            setVideoBlob(blob);
            setRecorderState(RecorderState.FINISHED);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
    } catch (e) {
        console.error("Recorder Error", e);
        setRecorderState(RecorderState.IDLE);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
    }
  }, []);

  const downloadVideo = useCallback(() => {
    if (!videoBlob) return;
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sparkler-moment-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [videoBlob]);

  const resetRecording = useCallback(() => {
    setVideoBlob(null);
    setRecorderState(RecorderState.IDLE);
  }, []);


  // -- Render --
  
  if (cameraError) {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-black text-white p-6 text-center">
            <div>
                <h1 className="text-2xl font-bold mb-4 text-red-500">Error</h1>
                <p>{cameraError}</p>
            </div>
        </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-black overflow-hidden flex flex-col items-center justify-center">
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-400 mb-4"></div>
            <p className="text-gray-300 tracking-widest uppercase text-sm">Initializing Multi-Hand Magic...</p>
        </div>
      )}

      {/* The Stage */}
      <div className="relative w-full h-full max-w-none max-h-none">
        {/* Hidden Video Element (Source) */}
        <video
          ref={videoRef}
          className="absolute opacity-0 pointer-events-none"
          playsInline
          muted // Must be muted to autoplay without interaction, but audio track can still be recorded
          autoPlay
        />

        {/* The Main Canvas (Display + Recording Source) */}
        {/* We use object-cover to ensure full screen filling while maintaining aspect ratio */}
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover touch-none"
        />
      </div>

      {/* UI Layer */}
      <RecorderControls 
        state={recorderState}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onDownload={downloadVideo}
        onReset={resetRecording}
      />
      
      {/* Instructions Overlay (Fades out when recording) */}
      {recorderState === RecorderState.IDLE && !isLoading && (
         <div className="absolute top-10 pointer-events-none text-center space-y-1 opacity-70 z-40">
            <h1 className="text-yellow-400 font-bold text-xl uppercase tracking-widest drop-shadow-md">New Year Sparkler</h1>
            <p className="text-white text-xs">Use one or two hands • 10 Fingers Supported!</p>
         </div>
      )}

    </div>
  );
};