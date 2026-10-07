/** Settings as a full screen of paper sheets: sound, screen, game, my records (the Meow Code, purchases), and a note about erasing everything. */
import { Container, type Text } from 'pixi.js';
import { legalLinks, openLegalLink, type LegalLink, type LegalLinkId } from '@/app/legalLinks';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { getLang, i18nEvents, t, type Lang } from '@/core/i18n';
import { isStorageVolatile, onStorageVolatile } from '@/core/save';
import { uiTweens } from '@/core/tween';
import type { NumbersMode } from '@/fx';
import { guideProgress, openGuide } from '@/guide';
import { profile } from '@/meta';
import { iap } from '@/platform';
import { backOut, Button, Color, drawIcon, fitLabel, motion, PaperLabel, paperSeed, popups, ScreenScaffold, SegmentTabs, Slider, toast, Toggle, TweenBag, uiLabel } from '@/ui';
import { refusalCue } from '@/ui/press';
import { shell } from '@/screens/shell/controller';
import { currentSettings, ensureSettings, updateSettings } from '@/view/hud/settings';
import { SHAKE_MODES, volumeStep, type ShakeMode } from '@/view/hud/settingsMath';
import { CodeExportPopup, CodeImportPopup } from './backupPopups';
import { paperSheet } from './kit/sheets';
import { routinePrefs, setQuality } from './prefs';
import { resetProgress } from './resetProgress';
import { QUALITIES, type Quality } from './settingsModel';
import { formSheet, LABEL_OVERHANG, type FormRow } from './settingsForm';
import { GAME_VERSION } from './strings';

const ROW_H = 104;
const SEG_H = 80;
const SIDE = 28;
const GAP = 20;
const LINK_H = 88;
/** The language strip's paper piece slides across before the screen changes language; then the new sheets settle into place one after another. */
const LANG_SLIDE = 0.2;
const RELAY_DROP = 18;
const RELAY_BEAT = 0.05;

const LINK_LABEL: Record<LegalLinkId, string> = {
  privacy: 'rt.sys.link.privacy',
  terms: 'rt.sys.link.terms',
  support: 'rt.sys.link.support',
};

let current: ScreenScaffold | null = null;
let dispose: (() => void) | null = null;

/** QA: scroll the open settings screen to an offset without inertia. */
export function scrollSettingsTo(y: number): void {
  current?.scroller?.scrollTo(y, false);
}

/** Close the screen at once (the home scene is going away). */
export function closeSettingsScreen(): void {
  dispose?.();
}

/** Open the settings screen above everything. `onChanged` runs after a backup import so the shell can re-read the profile. */
export async function openSettingsScreen(onChanged: () => void): Promise<void> {
  if (current) return;
  await ensureSettings();
  await guideProgress.load();
  if (current) return;
  const scaffold = new ScreenScaffold({ title: t('rt.sys.settings'), onBack: () => close(), scroll: true });
  current = scaffold;
  game.popupLayer.addChild(scaffold);
  let closed = false;
  let restoring = false;
  const bag = new TweenBag();

  const labelOf = (row: Container, text: string, w: number, y: number, room: number): Text => {
    const label = uiLabel(text, { size: 32, anchorX: 0, align: 'left' });
    fitLabel(label, w - SIDE * 2 - room, 32);
    label.position.set(SIDE, y);
    row.addChild(label);
    return label;
  };

  const sliderRow = (label: string, value: number, set: (v: number) => void, tick: boolean): FormRow => ({
    height: ROW_H,
    draw: (row, w) => {
      labelOf(row, label, w, ROW_H / 2, 380);
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
    },
  });

  const toggleRow = (label: string, value: boolean, set: (v: boolean) => void): FormRow => ({
    height: ROW_H,
    draw: (row, w) => {
      labelOf(row, label, w, ROW_H / 2, 160);
      const tg = new Toggle({ value, onChange: set });
      tg.position.set(w - SIDE - 58, ROW_H / 2);
      row.addChild(tg);
    },
  });

  const segmentRow = (label: string, options: readonly { id: string; label: string }[], selected: string, pick: (id: string) => void, hint?: string): FormRow => {
    const height = hint ? 204 : 170;
    return {
      height,
      draw: (row, w) => {
        labelOf(row, label, w, 32, 0);
        if (hint) {
          const hintText = uiLabel(hint, { size: 24, color: Color.inkSoft, anchorX: 0 });
          fitLabel(hintText, w - SIDE * 2, 24);
          hintText.position.set(SIDE, 72);
          row.addChild(hintText);
        }
        const seg = new SegmentTabs({ width: w - SIDE * 2, height: SEG_H, selected, tabs: options.map((o) => ({ id: o.id, label: o.label })) });
        seg.position.set(w / 2, height - 22 - SEG_H / 2);
        seg.onSelect(pick);
        row.addChild(seg);
      },
    };
  };

  const buttonOf = (label: string, style: 'neutral' | 'danger' | 'info', icon: 'code' | 'shop' | 'warning', onTap: (b: Button) => void, width: number): Button => {
    const b = new Button({ label, style, icon, width, height: 96, fontSize: 32 });
    b.onTap(() => onTap(b));
    return b;
  };

  /** A quiet kraft strip: the toast that says so is shown once and a scene change can swallow it. */
  const volatileNotice = (w: number): Container => {
    const view = new Container();
    const text = uiLabel(t('rt.sys.volatile'), { size: 24, wrap: w - SIDE * 2 - 52, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 30 });
    const h = Math.max(72, Math.ceil(text.height) + 36);
    view.addChild(paperSheet(w, h, { fill: Color.kraft, radius: 22, seed: paperSeed() }));
    const icon = drawIcon('info', 36);
    icon.position.set(SIDE + 18, h / 2);
    text.position.set(SIDE + 52, (h - text.height) / 2);
    view.addChild(icon, text);
    return view;
  };

  const linkRow = (link: LegalLink): FormRow => ({
    height: LINK_H + 24,
    draw: (row, w) => {
      const b = new Button({ label: t(LINK_LABEL[link.id]), style: 'neutral', width: w - SIDE * 2, height: LINK_H, fontSize: 32 });
      b.onTap(() => openLegalLink(link.url));
      b.position.set(w / 2, (LINK_H + 24) / 2);
      row.addChild(b);
    },
  });

  const versionLabel = (): PaperLabel => new PaperLabel({ text: t('rt.sys.version', { v: GAME_VERSION }), size: 26, paper: 'kraft', padX: 28, padY: 8 });

  const build = (settle = false): void => {
    let order = 0;
    for (const c of scaffold.content.removeChildren()) c.destroy({ children: true });
    scaffold.setTitle(t('rt.sys.settings'));
    const s = currentSettings();
    const w = scaffold.contentWidth;
    let y = LABEL_OVERHANG;
    if (isStorageVolatile()) {
      const notice = volatileNotice(w);
      notice.position.set(0, y);
      scaffold.content.addChild(notice);
      y += notice.height + GAP + LABEL_OVERHANG;
    }
    // The guidebook sits first, as one big paper button: a player who skipped the tutorial finds it without hunting.
    const left = guideProgress.unread().length;
    const guideBtn = new Button({
      label: t('guide.settings.title'), sublabel: left > 0 ? t('guide.unread', { n: left }) : t('guide.settings.hint'), style: 'primary', icon: 'question',
      width: w, height: 120, fontSize: 40, tape: 'pink',
    });
    guideBtn.onTap(() => openGuide({ host: { goTab: (tab) => { closeSettingsScreen(); shell.goTab(tab); } }, onClose: () => { if (!closed) build(); } }));
    guideBtn.position.set(w / 2, y + 60);
    scaffold.content.addChild(guideBtn);
    y += 120 + GAP + LABEL_OVERHANG;
    const add = (title: string, rows: readonly FormRow[]): void => {
      const sheet = formSheet(w, title, rows);
      sheet.view.position.set(0, y);
      if (settle && !motion.reduced) {
        const top = y;
        sheet.view.y = top + RELAY_DROP;
        bag.to(sheet.view, { y: top }, { duration: 0.26, delay: order++ * RELAY_BEAT, ease: backOut(1.6) });
      }
      scaffold.content.addChild(sheet.view);
      y += sheet.height + GAP + LABEL_OVERHANG;
    };

    add(t('rt.sys.section.sound'), [sliderRow(t('rt.sys.music'), s.music, (v) => updateSettings({ music: v }), false), sliderRow(t('rt.sys.sfx'), s.sfx, (v) => updateSettings({ sfx: v }), true)]);

    const modes: NumbersMode[] = ['full', 'brief', 'off'];
    add(t('rt.sys.section.screen'), [
      segmentRow(t('rt.sys.shake'), SHAKE_MODES.map((m) => ({ id: m, label: t(`rt.sys.shake.${m}`) })), s.shake, (id) => updateSettings({ shake: id as ShakeMode })),
      toggleRow(t('rt.sys.flashes'), s.flashes, (v) => updateSettings({ flashes: v })),
      // Applied at once (the kit's motion flag and the effect switch): the rest of the screen already moves less on the next frame.
      toggleRow(t('rt.sys.reduceMotion'), s.reduceMotion, (v) => updateSettings({ reduceMotion: v })),
      segmentRow(t('rt.sys.numbers'), modes.map((m) => ({ id: m, label: t(`rt.sys.numbers.${m}`) })), s.numbers, (id) => updateSettings({ numbers: id as NumbersMode })),
      segmentRow(t('rt.sys.quality'), QUALITIES.map((q) => ({ id: q, label: t(`rt.sys.quality.${q}`) })), routinePrefs().quality, (id) => setQuality(id as Quality), t('rt.sys.quality.hint')),
    ]);

    add(t('rt.sys.section.game'), [
      toggleRow(t('rt.sys.haptics'), s.haptics, (v) => updateSettings({ haptics: v })),
      // The strip's piece slides over first; the language changes when it has arrived and the i18n listener rebuilds the screen.
      segmentRow(t('rt.sys.lang'), [{ id: 'ko', label: '한국어' }, { id: 'en', label: 'English' }], getLang(), (id) => {
        uiTweens.call(motion.reduced ? 0 : LANG_SLIDE, () => {
          if (!closed) updateSettings({ lang: id as Lang });
        });
      }),
    ]);

    const bw = (w - SIDE * 2 - GAP) / 2;
    const help = uiLabel(t('meta.backup.help'), { size: 26, color: Color.inkSoft, wrap: w - SIDE * 2, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 36 });
    const records: FormRow[] = [
      {
        height: 62 + Math.ceil(help.height) + 14,
        draw: (row) => {
          labelOf(row, t('rt.sys.code.title'), w, 34, 0);
          help.position.set(SIDE, 62);
          row.addChild(help);
        },
      },
      {
        height: 96 + 40,
        draw: (row) => {
          const exp = buttonOf(t('rt.sys.code.export'), 'info', 'code', () => void exportCode(), bw);
          exp.position.set(SIDE + bw / 2, 68);
          const imp = buttonOf(t('rt.sys.code.import'), 'info', 'code', () => void popups.open(new CodeImportPopup(onChanged)), bw);
          imp.position.set(SIDE + bw + GAP + bw / 2, 68);
          row.addChild(exp, imp);
        },
      },
    ];
    if (iap.isAvailable()) {
      records.push({
        height: 96 + 40,
        draw: (row) => {
          const restore = buttonOf(t('rt.sys.restore'), 'neutral', 'shop', (b) => void restorePurchases(b), w - SIDE * 2);
          restore.position.set(w / 2, 68);
          row.addChild(restore);
        },
      });
    }
    add(t('rt.sys.section.data'), records);

    // The one dangerous action lives on a kraft note of its own, away from the ordinary rows.
    const note = new Container();
    const hint = uiLabel(t('rt.sys.reset.hint'), { size: 26, wrap: w - SIDE * 2 - 24, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 36 });
    const noteH = 40 + Math.ceil(hint.height) + 24 + 96 + 36;
    note.addChild(paperSheet(w, noteH, { fill: Color.kraft, radius: 26, seed: paperSeed(), dash: 14, dashColor: Color.kraftDark, tape: { name: 'yellow', at: 0.8, pattern: 'gingham' } }));
    hint.position.set(SIDE + 12, 40);
    const reset = buttonOf(t('rt.sys.reset'), 'danger', 'warning', () => void resetProgress(), w - SIDE * 2 - 24);
    reset.position.set(w / 2, noteH - 36 - 48);
    note.addChild(hint, reset);
    note.position.set(0, y);
    scaffold.content.addChild(note);
    y += noteH;

    const links = legalLinks();
    if (links.length > 0) {
      y += GAP + LABEL_OVERHANG;
      add(t('rt.sys.section.about'), [
        ...links.map(linkRow),
        {
          height: 80,
          draw: (row, rw) => {
            const version = versionLabel();
            version.position.set(rw / 2, 40);
            row.addChild(version);
          },
        },
      ]);
    } else {
      const version = versionLabel();
      version.position.set(w / 2, y + 36 + 20);
      scaffold.content.addChild(version);
    }
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
      refusalCue();
      toast(t('rt.sys.restore.fail'), 'warning');
      return;
    }
    const changed = r.granted + r.revoked + r.finished;
    toast(t(changed > 0 ? 'rt.sys.restore.done' : 'rt.sys.restore.none'), changed > 0 ? 'success' : 'info');
    onChanged();
  };

  // The language segment lives inside the content that is rebuilt: rebuild after its handler has returned.
  const rebuild = (): void => {
    if (!closed) build(true);
  };
  const offLang = i18nEvents.on('change', () => queueMicrotask(rebuild));

  // The notice at the top appears the moment the first write is lost, even with this screen already open.
  const offVolatile = onStorageVolatile(() => queueMicrotask(rebuild));

  const close = (): void => {
    if (closed) return;
    closed = true;
    bag.killAll();
    offLang();
    offVolatile();
    current = null;
    dispose = null;
    void scaffold.hide(true).then(() => scaffold.destroy({ children: true }));
  };
  dispose = () => {
    if (closed) return;
    closed = true;
    bag.killAll();
    offLang();
    offVolatile();
    current = null;
    dispose = null;
    scaffold.destroy({ children: true });
  };

  build();
  void scaffold.show(true);
}
