import React, { useCallback, useRef, useState } from 'react';
import { Play, Download, RotateCcw } from 'lucide-react';
import { RecorderState } from '../types';

interface RecorderControlsProps {
  state: RecorderState;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDownload: () => void;
  onReset: () => void;
}

export const RecorderControls: React.FC<RecorderControlsProps> = ({
  state,
  onStartRecording,
  onStopRecording,
  onDownload,
  onReset
}) => {
  const [isPressed, setIsPressed] = useState(false);
  // Use a timeout to detect "Hold" vs "Click" if we wanted, 
  // but requirements say "Press & Hold: Start... Release: Stop".
  
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsPressed(true);
    onStartRecording();
  }, [onStartRecording]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (isPressed) {
      setIsPressed(false);
      onStopRecording();
    }
  }, [isPressed, onStopRecording]);

  // If the user drags their finger off the button, we should probably stop recording too
  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (isPressed) {
      setIsPressed(false);
      onStopRecording();
    }
  }, [isPressed, onStopRecording]);

  if (state === RecorderState.FINISHED) {
    return (
      <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button
          onClick={onReset}
          className="bg-gray-800/80 backdrop-blur-md text-white p-4 rounded-full hover:bg-gray-700 transition-all border border-gray-600 shadow-lg"
          aria-label="Reset"
        >
          <RotateCcw size={24} />
        </button>
        <button
          onClick={onDownload}
          className="bg-gradient-to-r from-yellow-500 to-orange-600 text-white px-8 py-4 rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center gap-2"
        >
          <Download size={24} />
          <span>Save Video</span>
        </button>
      </div>
    );
  }

  // Determine visibility: Hide if recording
  const isHidden = state === RecorderState.RECORDING;

  return (
    <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center z-50 pointer-events-none">
       {/* 
         The container is pointer-events-none so gestures pass through to canvas if not on button.
         But the button itself is pointer-events-auto.
       */}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className={`
          pointer-events-auto
          relative group
          transition-all duration-300 ease-out
          ${isHidden ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100 scale-100'}
        `}
        style={{ touchAction: 'none' }}
        aria-label="Hold to Record"
      >
        {/* Outer Ring Animation */}
        <div className="absolute -inset-4 bg-white/20 rounded-full blur-md group-hover:bg-white/30 transition-colors"></div>
        <div className="absolute -inset-1 bg-gradient-to-tr from-yellow-400 to-red-500 rounded-full opacity-75 blur-sm animate-pulse"></div>
        
        {/* The Button */}
        <div className="relative w-20 h-20 bg-white rounded-full border-4 border-red-500 shadow-[0_0_20px_rgba(255,100,50,0.5)] flex items-center justify-center transform transition-transform group-active:scale-90">
            <div className="w-8 h-8 bg-red-500 rounded-sm"></div>
        </div>
        
        {/* Instructions */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium tracking-wide whitespace-nowrap text-shadow-md">
          Hold to Record
        </div>
      </button>
    </div>
  );
};
