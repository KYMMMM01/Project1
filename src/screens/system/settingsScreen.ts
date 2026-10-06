/** Settings as a full screen: sound, screen, game, and the player's own data (backup code, purchases, reset). */
import { Container, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { getLang, i18nEvents, t, type Lang } from '@/core/i18n';
import type { NumbersMode } from '@/fx';
import { profile } from '@/meta';
import { iap } from '@/platform';
import { currentSettings, ensureSettings, updateSettings } from '@/view/hud/settings';
import { SHAKE_MODES, volumeStep, type ShakeMode } from '@/view/hud/settingsMath';
import { Button } from '@/ui/Button';
import { popups } from '@/ui/Popup';
import { ScreenScaffold } from '@/ui/ScreenScaffold';
import { SegmentTabs } from '@/ui/TabBar';
import { Slider, Toggle } from '@/ui/controls';
import { fitLabel, uiLabel } from '@/ui/text';
import { Color } from '@/ui/theme';
import { toast } from '@/ui/Toast';
import { CodeExportPopup, CodeImportPopup } from './backupPopups';
import { sharedPanel } from './kit/widgets';
import { routinePrefs, setQuality } from './prefs';
import { resetProgress } from './resetProgress';
import { QUALITIES, type Quality } from './settingsModel';
import { GAME_VERSION } from './strings';

const ROW_H = 104;
const SEG_H = 80;
const TALL_H = 176;
const SIDE = 28;
const GAP = 16;

let current: ScreenScaffold | null = null;
let dispose: (() => void) | null = null;

/** Close the screen at once (the home scene is going away). */
export function closeSettingsScreen(): void {
  dispose?.();
}

/** Open the settings screen above everything. `onChanged` runs after a backup import so the shell can re-read the profile. */
export async function openSettingsScreen(onChanged: () => void): Promise<void> {
  if (current) return;
  await ensureSettings();
  if (current) return;
  const scaffold = new ScreenScaffold({ title: t('rt.sys.settings'), onBack: () => close(), scroll: true });
  current = scaffold;
  game.popupLayer.addChild(scaffold);
  let closed = false;
  let restoring = false;

  const build = (): void => {
    for (const c of scaffold.content.removeChildren()) c.destroy({ children: true });
    scaffold.setTitle(t('rt.sys.settings'));
    const s = currentSettings();
    const w = scaffold.contentWidth;
    let y = 4;

    const plate = (h: number, label: string): Container => {
      const row = new Container();
      row.position.set(0, y);
      const text = uiLabel(label, { size: 32, anchorX: 0, align: 'left', strokeWidth: 5 });
      text.position.set(SIDE, h > ROW_H ? 42 : h / 2);
      fitLabel(text, w - SIDE * 2 - (h > ROW_H ? 0 : 380), 32);
      row.addChild(sharedPanel(w, h, 'default', 28), text);
      scaffold.content.addChild(row);
      y += h + GAP;
      return row;
    };
    const section = (label: string): void => {
      const text = uiLabel(label, { size: 28, color: Color.textDim, anchorX: 0, strokeWidth: 5, shadow: false });
      text.position.set(8, y + 22);
      scaffold.content.addChild(text);
      y += 56;
    };
    const slider = (label: string, value: number, set: (v: number) => void, tick: boolean): void => {
      const row = plate(ROW_H, label);
      const sl = new Slider({
        width: 360,
        value,
        step: 0.1,
        onChange: (v) => set(volumeStep(v)),
        onCommit: () => {
          if (tick) audio.play('ui_confirm', { volume: 0.7 });
        },
      });
      sl.position.set(w - SIDE - 180, ROW_H / 2);
      row.addChild(sl);
    };
    const toggle = (label: string, value: boolean, set: (v: boolean) => void): void => {
      const row = plate(ROW_H, label);
      const tg = new Toggle({ value, onChange: set });
      tg.position.set(w - SIDE - 58, ROW_H / 2);
      row.addChild(tg);
    };
    const segments = (label: string, options: readonly { id: string; label: string }[], selected: string, pick: (id: string) => void, hint?: string): void => {
      const h = hint ? TALL_H + 34 : TALL_H;
      const row = plate(h, label);
      if (hint) {
        const hintText: Text = uiLabel(hint, { size: 24, color: Color.textDim, anchorX: 0, strokeWidth: 4, shadow: false });
        fitLabel(hintText, w - SIDE * 2, 24);
        hintText.position.set(SIDE, 82);
        row.addChild(hintText);
      }
      const seg = new SegmentTabs({ width: w - SIDE * 2, height: SEG_H, selected, tabs: options.map((o) => ({ id: o.id, label: o.label })) });
      seg.position.set(w / 2, h - 56);
      seg.onSelect(pick);
      row.addChild(seg);
    };
    const button = (label: string, style: 'neutral' | 'danger' | 'info', icon: 'code' | 'shop' | 'warning', onTap: (b: Button) => void, width = w): Button => {
      const b = new Button({ label, style, icon, width, height: 96, fontSize: 32 });
      b.onTap(() => onTap(b));
      return b;
    };

    section(t('rt.sys.section.sound'));
    slider(t('rt.sys.music'), s.music, (v) => updateSettings({ music: v }), false);
    slider(t('rt.sys.sfx'), s.sfx, (v) => updateSettings({ sfx: v }), true);

    section(t('rt.sys.section.screen'));
    segments(
      t('rt.sys.shake'),
      SHAKE_MODES.map((m) => ({ id: m, label: t(`rt.sys.shake.${m}`) })),
      s.shake,
      (id) => updateSettings({ shake: id as ShakeMode }),
    );
    toggle(t('rt.sys.flashes'), s.flashes, (v) => updateSettings({ flashes: v }));
    const modes: NumbersMode[] = ['full', 'brief', 'off'];
    segments(
      t('rt.sys.numbers'),
      modes.map((m) => ({ id: m, label: t(`rt.sys.numbers.${m}`) })),
      s.numbers,
      (id) => updateSettings({ numbers: id as NumbersMode }),
    );
    segments(
      t('rt.sys.quality'),
      QUALITIES.map((q) => ({ id: q, label: t(`rt.sys.quality.${q}`) })),
      routinePrefs().quality,
      (id) => setQuality(id as Quality),
      t('rt.sys.quality.hint'),
    );

    section(t('rt.sys.section.game'));
    toggle(t('rt.sys.haptics'), s.haptics, (v) => updateSettings({ haptics: v }));
    segments(
      t('rt.sys.lang'),
      [
        { id: 'ko', label: '한국어' },
        { id: 'en', label: 'English' },
      ],
      getLang(),
      // The screen is rebuilt by the i18n listener once the handler that changed the language has returned.
      (id) => updateSettings({ lang: id as Lang }),
    );

    section(t('rt.sys.section.data'));
    const bw = (w - SIDE * 2 - GAP) / 2;
    const codeCard = new Container();
    codeCard.position.set(0, y);
    const codeTitle = uiLabel(t('rt.sys.code.title'), { size: 32, anchorX: 0, strokeWidth: 5 });
    codeTitle.position.set(SIDE, 42);
    const codeHelp = uiLabel(t('meta.backup.help'), { size: 24, color: Color.textDim, wrap: w - SIDE * 2, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 32, strokeWidth: 4, shadow: false });
    codeHelp.position.set(SIDE, 78);
    const codeH = 78 + codeHelp.height + 20 + 100 + 24;
    codeCard.addChild(sharedPanel(w, codeH, 'default', 28), codeTitle, codeHelp);
    const exp = button(t('rt.sys.code.export'), 'info', 'code', () => void exportCode(), bw);
    exp.position.set(SIDE + bw / 2, codeH - 24 - 52);
    const imp = button(t('rt.sys.code.import'), 'info', 'code', () => void popups.open(new CodeImportPopup(onChanged)), bw);
    imp.position.set(SIDE + bw + GAP + bw / 2, codeH - 24 - 52);
    codeCard.addChild(exp, imp);
    scaffold.content.addChild(codeCard);
    y += codeH + GAP;

    if (iap.isAvailable()) {
      const restore = button(t('rt.sys.restore'), 'neutral', 'shop', (b) => void restorePurchases(b));
      restore.position.set(w / 2, y + 52);
      scaffold.content.addChild(restore);
      y += 96 + 12 + GAP;
    }

    const resetHint = uiLabel(t('rt.sys.reset.hint'), { size: 24, color: Color.textDim, wrap: w, strokeWidth: 4, shadow: false, lineHeight: 32 });
    resetHint.position.set(w / 2, y + resetHint.height / 2 + 6);
    scaffold.content.addChild(resetHint);
    y += resetHint.height + 16;
    const reset = button(t('rt.sys.reset'), 'danger', 'warning', () => void resetProgress());
    reset.position.set(w / 2, y + 52);
    scaffold.content.addChild(reset);
    y += 96 + 12 + 24;

    const version = uiLabel(t('rt.sys.version', { v: GAME_VERSION }), { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false });
    version.position.set(w / 2, y + 12);
    scaffold.content.addChild(version);
    scaffold.refresh();
  };

  const exportCode = async (): Promise<void> => {
    const code = await profile.exportCode();
    if (!closed) void popups.open(new CodeExportPopup(code));
  };

  const restorePurchases = async (b: Button): Promise<void> => {
    if (restoring) return;
    restoring = true;
    b.setBusy(true);
    const r = await iap.restorePurchases();
    restoring = false;
    if (closed || b.destroyed) return;
    b.setBusy(false);
    if (!r.ok) {
      audio.play('ui_error');
      toast(t('rt.sys.restore.fail'), 'warning');
      return;
    }
    const changed = r.granted + r.revoked + r.finished;
    toast(t(changed > 0 ? 'rt.sys.restore.done' : 'rt.sys.restore.none'), changed > 0 ? 'success' : 'info');
    onChanged();
  };

  // The language segment lives inside the content that is rebuilt: rebuild after its handler has returned.
  const offLang = i18nEvents.on('change', () => {
    queueMicrotask(() => {
      if (!closed) build();
    });
  });

  const close = (): void => {
    if (closed) return;
    closed = true;
    offLang();
    current = null;
    dispose = null;
    void scaffold.hide(true).then(() => scaffold.destroy({ children: true }));
  };
  dispose = () => {
    if (closed) return;
    closed = true;
    offLang();
    current = null;
    dispose = null;
    scaffold.destroy({ children: true });
  };

  build();
  void scaffold.show(true);
}
