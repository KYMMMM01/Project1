/** Settings as a full screen: volumes, screen shake, flashes, haptics, damage numbers and language. */
import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { i18nEvents, t, getLang, type Lang } from '@/core/i18n';
import type { NumbersMode } from '@/fx';
import { Color, drawPaper, fitLabel, paperSeed, ScreenScaffold, SegmentTabs, Slider, Toggle, uiLabel } from '@/ui';
import { currentSettings, updateSettings } from '../settings';
import { SHAKE_MODES, volumeStep, type ShakeMode } from '../settingsMath';

const ROW_H = 104;
const TALL_H = 176;
/** A tall row with a line of explanation under its label. */
const HINT_H = 204;

/** Open the settings screen above everything; `onClose` runs after it has gone. */
export function openSettings(onClose: () => void): ScreenScaffold {
  const scaffold = new ScreenScaffold({ title: t('hud.settings'), onBack: () => close(), scroll: true });
  game.popupLayer.addChild(scaffold);
  let closed = false;

  const build = (): void => {
    scaffold.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    scaffold.setTitle(t('hud.settings'));
    const s = currentSettings();
    const w = scaffold.contentWidth;
    let y = 8;
    const plate = (h: number, label: string): Container => {
      const row = new Container();
      row.position.set(0, y);
      const g = new Graphics();
      drawPaper(g, 0, 0, { w, h, radius: 26, fill: Color.paperLight, edge: Color.kraftDark, seed: paperSeed(), grain: false });
      const text = uiLabel(label, { size: 32, anchorX: 0, align: 'left' });
      text.position.set(28, h > ROW_H ? 40 : h / 2);
      row.addChild(g, text);
      scaffold.content.addChild(row);
      y += h + 16;
      return row;
    };

    const volume = (label: string, value: number, set: (v: number) => void, tick: boolean): void => {
      const row = plate(ROW_H, label);
      const slider = new Slider({
        width: 360,
        value,
        step: 0.1,
        onChange: (v) => set(volumeStep(v)),
        onCommit: () => {
          if (tick) audio.play('ui_confirm', { volume: 0.7 });
        },
      });
      slider.position.set(w - 28 - 180, ROW_H / 2);
      row.addChild(slider);
    };
    volume(t('hud.set.sfx'), s.sfx, (v) => updateSettings({ sfx: v }), true);
    volume(t('hud.set.music'), s.music, (v) => updateSettings({ music: v }), false);

    const shakeRow = plate(TALL_H, t('hud.set.shake'));
    const shake = new SegmentTabs({
      width: w - 56,
      height: 80,
      selected: s.shake,
      tabs: SHAKE_MODES.map((m) => ({ id: m, label: t(`hud.set.shake.${m}`) })),
    });
    shake.position.set(w / 2, TALL_H - 56);
    shake.onSelect((id) => updateSettings({ shake: id as ShakeMode }));
    shakeRow.addChild(shake);

    const toggle = (label: string, value: boolean, set: (v: boolean) => void): void => {
      const row = plate(ROW_H, label);
      const tg = new Toggle({ value, onChange: set });
      tg.position.set(w - 28 - 58, ROW_H / 2);
      row.addChild(tg);
    };
    toggle(t('hud.set.flashes'), s.flashes, (v) => updateSettings({ flashes: v }));
    // Applied on the spot (settings.ts sets the kit's switch and the effects' switch): the next thing that moves is already calm.
    toggle(t('hud.set.reduceMotion'), s.reduceMotion, (v) => updateSettings({ reduceMotion: v }));
    toggle(t('hud.set.haptics'), s.haptics, (v) => updateSettings({ haptics: v }));

    const numRow = plate(HINT_H, t('hud.set.numbers'));
    const hint = uiLabel(t('hud.set.numbers.hint'), { size: 24, color: Color.inkSoft, anchorX: 0 });
    fitLabel(hint, w - 56, 24);
    hint.position.set(28, 78);
    numRow.addChild(hint);
    const modes: NumbersMode[] = ['full', 'brief', 'off'];
    const nums = new SegmentTabs({
      width: w - 56,
      height: 80,
      selected: s.numbers,
      tabs: modes.map((m) => ({ id: m, label: t(`hud.set.numbers.${m}`) })),
    });
    nums.position.set(w / 2, HINT_H - 56);
    nums.onSelect((id) => updateSettings({ numbers: id as NumbersMode }));
    numRow.addChild(nums);

    const langRow = plate(TALL_H, t('hud.set.lang'));
    const langs = new SegmentTabs({
      width: w - 56,
      height: 80,
      selected: getLang(),
      tabs: [
        { id: 'ko', label: '한국어' },
        { id: 'en', label: 'English' },
      ],
    });
    langs.position.set(w / 2, TALL_H - 56);
    // The screen is rebuilt by the i18n change listener, not here.
    langs.onSelect((id) => updateSettings({ lang: id as Lang }));
    langRow.addChild(langs);
    scaffold.refresh();
  };

  // Rebuilt after the handler that changed the language has returned: that handler lives inside a widget being replaced.
  const off = i18nEvents.on('change', () => {
    queueMicrotask(() => {
      if (!closed) build();
    });
  });
  const close = (): void => {
    if (closed) return;
    closed = true;
    off();
    void scaffold.hide(true).then(() => {
      scaffold.destroy({ children: true });
      onClose();
    });
  };
  build();
  void scaffold.show(true);
  return scaffold;
}
