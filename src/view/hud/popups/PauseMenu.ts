/** Pause menu: resume, settings, the guidebook, the codex, restart and quit (both of the last two ask first). */
import { confirmDialog, Button, Color, Panel, Popup, uiLabel } from '@/ui';
import { fmtDuration } from '@/core/format';
import { t } from '@/core/i18n';
import '@/codex/strings';
import type { HudEnv } from '../env';

export type PauseAction = 'resume' | 'settings' | 'guide' | 'codex' | 'restart' | 'quit';

const W = 600;

export class PauseMenu extends Popup<PauseAction> {
  constructor(env: HudEnv) {
    super({ dismissResult: 'resume', priority: 3 });
    const b = env.battle;
    const btnH = 104;
    const gap = 22;
    const top = 150;
    const h = top + 6 * btnH + 5 * gap + 54;
    const panel = new Panel({ width: W, height: h, title: t('hud.pause.title'), torn: 'bottom', tape: 'sky' });
    const c = panel.content;

    const where = b.totalWaves > 0 ? t('hud.wave', { act: Math.max(1, b.act), wave: Math.max(1, b.wave), total: b.totalWaves }) : t('hud.waveOpen', { act: Math.max(1, b.act), wave: Math.max(1, b.wave) });
    const info = uiLabel(`${where}  ·  ${fmtDuration(b.time)}`, { size: 28, color: Color.inkSoft });
    info.position.set(W / 2, 98);
    c.addChild(info);

    const add = (i: number, label: string, style: 'success' | 'info' | 'neutral' | 'danger', icon: 'play' | 'settings' | 'question' | 'book' | 'reroll' | 'home', run: () => void): void => {
      const btn = new Button({ label, style, icon, width: W - 90, height: btnH, fontSize: 40 });
      btn.position.set(W / 2, top + btnH / 2 + i * (btnH + gap));
      btn.onTap(run);
      c.addChild(btn);
    };
    add(0, t('hud.pause.resume'), 'success', 'play', () => this.close('resume'));
    add(1, t('hud.settings'), 'info', 'settings', () => this.close('settings'));
    add(2, t('guide.pause'), 'info', 'question', () => this.close('guide'));
    add(3, t('codex.pause'), 'info', 'book', () => this.close('codex'));
    add(4, t('hud.pause.restart'), 'neutral', 'reroll', () => {
      void confirmDialog({
        title: t('hud.pause.restart'),
        message: t('hud.pause.restartAsk'),
        confirmLabel: t('hud.pause.restart'),
        cancelLabel: t('hud.cancel'),
        danger: true,
      }).then((ok) => {
        if (ok) this.close('restart');
      });
    });
    add(5, t('hud.pause.quit'), 'danger', 'home', () => {
      void confirmDialog({
        title: t('hud.pause.quit'),
        message: t('hud.pause.quitAsk'),
        confirmLabel: t('hud.pause.quit'),
        cancelLabel: t('hud.cancel'),
        danger: true,
      }).then((ok) => {
        if (ok) this.close('quit');
      });
    });
    this.body.addChild(panel);
    this.setContentSize(W + 80, h + 100);
  }
}
