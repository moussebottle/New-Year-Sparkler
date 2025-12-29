import { Particle, Point } from '../types';
import { BURST_COLORS, BURST_PARTICLE_COUNT, TRAIL_COLOR } from '../constants';

export const createTrailParticle = (x: number, y: number, velocity: Point, color: string = TRAIL_COLOR): Particle => {
  const angle = Math.random() * Math.PI * 2;
  const speed = Math.random() * 2;
  // Add some randomness to velocity based on movement
  const vx = (Math.cos(angle) * speed) + (velocity.x * 0.1);
  const vy = (Math.sin(angle) * speed) + (velocity.y * 0.1);

  return {
    x,
    y,
    vx,
    vy,
    life: 1.0,
    decay: 0.02 + Math.random() * 0.03, // Lasts ~30-50 frames
    color: `rgba(${color},`, // Base string, alpha added later
    size: 2 + Math.random() * 3,
    type: 'trail',
    gravity: 0.1
  };
};

export const createBurstParticles = (x: number, y: number): Particle[] => {
  const particles: Particle[] = [];
  for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    // Explosion force
    const speed = 2 + Math.random() * 10;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    
    // Pick random color
    const colorBase = BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)];
    
    particles.push({
      x,
      y,
      vx,
      vy,
      life: 1.0,
      decay: 0.01 + Math.random() * 0.02, // Longer life
      color: `rgba(${colorBase},`,
      size: 3 + Math.random() * 4,
      type: 'burst',
      gravity: 0.3 // Heavier gravity for fallout
    });
  }
  return particles;
};

export const updateParticles = (particles: Particle[], width: number, height: number): Particle[] => {
  const aliveParticles: Particle[] = [];

  for (const p of particles) {
    p.life -= p.decay;

    if (p.life > 0) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity; // Gravity

      // Floor bounce (optional, adds to realism)
      if (p.y > height && p.vy > 0) {
        p.vy *= -0.6;
        p.y = height;
      }
      
      aliveParticles.push(p);
    }
  }

  return aliveParticles;
};

export const drawParticles = (ctx: CanvasRenderingContext2D, particles: Particle[]) => {
  // Additive blending makes lights look bright/glowing
  ctx.globalCompositeOperation = 'lighter';

  for (const p of particles) {
    ctx.beginPath();
    ctx.fillStyle = `${p.color} ${p.life})`;
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }

  // Reset
  ctx.globalCompositeOperation = 'source-over';
};
