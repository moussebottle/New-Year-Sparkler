// Physics
export const INERTIA_FACTOR = 0.25; // Lower = more lag/smoothness
export const DRAW_SPEED_THRESHOLD = 3.0; // Min pixel movement per frame to emit trails
export const BURST_ARM_SPEED = 15.0; // Speed needed to arm the burst trigger
export const BURST_TRIGGER_SPEED = 5.0; // Drop below this speed to trigger burst

// Particles
export const TRAIL_COLOR = '255, 215, 0'; // Gold RGB
export const TRAIL_PARTICLE_COUNT = 3; // Particles per frame when moving
export const BURST_PARTICLE_COUNT = 60;
export const BURST_COLORS = [
  '255, 100, 50',   // Red-Orange
  '255, 215, 0',    // Gold
  '255, 255, 255',  // White sparkle
  '100, 200, 255'   // Blue tint
];

// Audio/Video
export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720; // 720p is good balance for mobile JS performance
export const TARGET_FPS = 30;
