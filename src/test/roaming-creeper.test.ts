import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('RoamingCreeper & AboutUs Integration', () => {
  const root = process.cwd();
  const creeperPath = join(root, 'src/components/RoamingCreeper.tsx');
  const homePath = join(root, 'src/components/HomeScreen.tsx');
  const photoPath = join(root, 'public/about-photo.jpg');
  const musicPath = join(root, 'public/careless-whisper.mp3');

  it('has RoamingCreeper component and references required media assets', () => {
    expect(existsSync(creeperPath)).toBe(true);
    expect(existsSync(photoPath)).toBe(true);
    expect(existsSync(musicPath)).toBe(true);

    const creeperCode = readFileSync(creeperPath, 'utf8');
    expect(creeperCode).toContain('/about-photo.jpg');
    expect(creeperCode).toContain('/careless-whisper.mp3');
    expect(creeperCode).toContain('startAutoScroll');
    expect(creeperCode).toContain('stopAutoScroll');
    expect(creeperCode).toContain('aboutHome');
    expect(creeperCode).toContain('startExplosion');
  });

  it('HomeScreen includes RoamingCreeper in the stage', () => {
    const homeCode = readFileSync(homePath, 'utf8');
    expect(homeCode).toContain('RoamingCreeper');
    expect(homeCode).toContain('<RoamingCreeper />');
  });
});
