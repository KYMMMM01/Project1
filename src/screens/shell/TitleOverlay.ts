import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { Button, Color, drawIcon, Panel, PaperLabel, uiLabel } from '@/ui';

/** What the title shows of the game account (the Google sign-in, platform/account.ts). */
export type AccountView = { state: 'none' } | { state: 'wait' } | { state: 'off' } | { state: 'on' };
const CARD_W = 560;
const CARD_H = 230;
const PROMPT_SIZE = 40;
const PGS_W = 460;
const PGS_H = 84;
const STATUS_ICON = 34;
const BLINK_S = 1.6;

/**
 * The title's foreground (the owner's pick B of 2026-11-11): one taped paper card at the bottom with "tap to start" breathing on it and,
 * under it, the game account's state: "checking", "signed in", or the Google sign-in button (2026-11-12: the account moved from Play Games
 * to a Google sign-in). The version sits in the bottom-right corner. The scene owns the tap that starts the game; a tap on the sign-in
 * button never starts it (`isOwnTap`).
 */
export class TitleOverlay extends Container {
  private readonly card = new Panel({ width: CARD_W, height: CARD_H, variant: 'light', tape: 'pink' });
  private readonly prompt = new PaperLabel({ text: t('shell.title.tap'), size: PROMPT_SIZE, paper: Color.paperLight, ink: Color.ink, padX: 40, padY: 14 });
  private readonly version = uiLabel(`v${__APP_VERSION__}`, { size: 22, color: Color.paperLight });
  private pgsNode: Container | null = null;
  private connectButton: Button | null = null;
  private time = 0;
  private w = 0;
  private h = 0;
  private safeBottom = 0;

  constructor(
    view: AccountView,
    private readonly onConnect: () => void,
  ) {
    super();
    this.version.anchor.set(1, 1);
    this.version.alpha = 0.85;
    this.addChild(this.card, this.prompt, this.version);
    this.setAccount(view);
  }

  /** The account changed (the last session restored, a sign-in finished or was closed). */
  setAccount(view: AccountView): void {
    this.pgsNode?.destroy({ children: true });
    this.pgsNode = null;
    this.connectButton = null;
    // No account on this build (no Firebase config yet): the card holds the prompt alone.
    if (view.state === 'none') {
      this.layout(this.w, this.h, this.safeBottom);
      return;
    }
    if (view.state === 'off') {
      const b = new Button({ label: t('shell.title.acct.signIn'), icon: 'paw', style: 'neutral', width: PGS_W, height: PGS_H, fontSize: 28 });
      b.onTap(() => this.onConnect());
      this.connectButton = b;
      this.pgsNode = b;
    } else {
      this.pgsNode = view.state === 'on' ? status(t('shell.title.acct.on'), 'check') : status(t('shell.title.acct.wait'), 'clock');
    }
    this.addChild(this.pgsNode);
    this.layout(this.w, this.h, this.safeBottom);
  }

  /** True for a pointer event that landed on the connect button, so the scene's "tap to start" ignores it. */
  isOwnTap(target: unknown): boolean {
    for (let n = target as Container | null; n; n = n.parent) if (n === this.connectButton) return true;
    return false;
  }

  layout(w: number, h: number, safeBottom: number): void {
    Object.assign(this, { w, h, safeBottom });
    if (!w || !h) return;
    const bottom = h - safeBottom;
    this.card.position.set(w / 2, bottom - 175);
    this.prompt.position.set(w / 2, this.pgsNode ? bottom - 230 : bottom - 175);
    this.pgsNode?.position.set(w / 2, bottom - 130);
    this.version.position.set(w - 24, bottom - 16);
  }

  /** The prompt breathes so it reads as "waiting for you"; never fainter than 75 %. */
  tick(dt: number): void {
    this.time += dt;
    const k = 0.5 + 0.5 * Math.cos((this.time / BLINK_S) * Math.PI * 2);
    this.prompt.alpha = 0.75 + 0.25 * k;
    this.prompt.scale.set(1 + 0.04 * k);
  }
}

/** The quiet line of a sign-in being checked or made: a small icon, then the words on a small paper label. Origin = centre. */
function status(text: string, iconName: 'check' | 'clock'): Container {
  const row = new Container();
  const label = new PaperLabel({ text, size: 24, paper: 'neutral', padX: 22, padY: 8, maxWidth: PGS_W });
  const icon = drawIcon(iconName, STATUS_ICON, Color.paperLight);
  const gap = 10;
  const total = STATUS_ICON + gap + label.width;
  icon.position.set(-total / 2 + STATUS_ICON / 2, 0);
  label.position.set(-total / 2 + STATUS_ICON + gap + label.width / 2, 0);
  row.addChild(label, icon);
  return row;
}
