/** Task-completion tone (Settings → General → Task completion sound). */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

let player: AudioPlayer | null = null;

export function playCompleteSound() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    player ??= createAudioPlayer(require('../assets/sounds/complete.wav'));
    player.volume = 0.6;
    void player.seekTo(0).then(() => player?.play()).catch(() => player?.play());
  } catch {
    /* audio unavailable — silent */
  }
}
