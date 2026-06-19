import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants.js';
import BootScene from './scenes/BootScene.js';
import DifficultyScene from './scenes/DifficultyScene.js';
import ElementChoiceScene from './scenes/ElementChoiceScene.js';
import GameScene from './scenes/GameScene.js';
import HelpScene from './scenes/HelpScene.js';
import HUDScene from './scenes/HUDScene.js';
import LeaderboardScene from './scenes/LeaderboardScene.js';
import MoleculeTreeScene from './scenes/MoleculeTreeScene.js';
import PauseScene from './scenes/PauseScene.js';
import SettingsScene from './scenes/SettingsScene.js';
import StageSelectScene from './scenes/StageSelectScene.js';
import TitleScene from './scenes/TitleScene.js';
import Settings from './systems/Settings.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0d1420',
  physics: {
    default: 'arcade',
    arcade: { debug: false, gravity: { x: 0, y: 0 } },
  },
  scene: [
    BootScene,
    TitleScene,
    DifficultyScene,
    StageSelectScene,
    LeaderboardScene,
    SettingsScene,
    HelpScene,
    MoleculeTreeScene,
    GameScene,
    HUDScene,
    ElementChoiceScene,
    PauseScene,
  ],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

// @ts-expect-error debug hook
window.__game = game;

// Mobile browsers keep showing the URL bar over a non-scrolling page. Going fullscreen on the
// first user tap hides it. Fullscreen must be requested from a gesture, so we listen for one tap
// (best-effort: iPhone Safari has no element fullscreen — there the home-screen web-app meta wins).
if (Settings.get().fullscreen && Settings.isTouchDevice()) {
  const enterFullscreen = () => {
    window.removeEventListener('pointerdown', enterFullscreen);
    try {
      if (game.scale.fullscreen.available && !game.scale.isFullscreen) game.scale.startFullscreen();
    } catch {
      // Fullscreen not permitted on this device/browser — leave the page as-is.
    }
  };
  window.addEventListener('pointerdown', enterFullscreen);
}
