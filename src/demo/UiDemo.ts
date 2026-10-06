import { Container, Graphics } from 'pixi.js';
import { Scene } from '@/core/scene';
import { game } from '@/core/game';
import { debugExpose } from '@/core/debug';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { ICON_NAMES, drawIcon } from '@/ui/icons';
import { Panel } from '@/ui/Panel';
import { vGradient } from '@/ui/shapes';
import { uiLabel } from '@/ui/text';
import { Color, type ButtonStyleId } from '@/ui/theme';

const STYLES: ButtonStyleId[] = ['primary', 'success', 'info', 'danger', 'neutral', 'purple'];

interface PageDef {
  title: string;
  build: (host: Container) => void;
}

/** Gallery of every UI component: ?demo=ui&page=N. */
export default class UiDemo extends Scene {
  private readonly bg = new Graphics();
  private readonly host = new Container();
  private pageIndex = 0;

  private readonly pages: PageDef[] = [
    { title: 'Buttons', build: (h) => this.pageButtons(h) },
    { title: 'Icons', build: (h) => this.pageIcons(h) },
  ];

  override enter(): void {
    const q = new URLSearchParams(location.search).get('page');
    this.pageIndex = Math.max(0, Math.min(this.pages.length - 1, Number(q ?? 0) || 0));
    this.addChild(this.bg, this.host);
    this.show(this.pageIndex);
    debugExpose('ui', { demo: this, show: (i: number) => this.show(i) });
  }

  override resize(w: number, h: number): void {
    this.bg.clear().rect(0, 0, w, h).fill(vGradient(0x2d1c5c, 0x170f2e));
  }

  show(i: number): void {
    this.pageIndex = i;
    for (const c of this.host.removeChildren()) c.destroy({ children: true });
    this.pages[i]?.build(this.host);
  }

  private heading(host: Container, text: string, y: number): void {
    const t = uiLabel(text, { size: 28, color: Color.textDim });
    t.position.set(game.w / 2, y);
    host.addChild(t);
  }

  private pageButtons(host: Container): void {
    let y = game.safeTop + 60;
    this.heading(host, 'primary  success  info', y);
    y += 80;
    const row1 = ['primary', 'success', 'info'] as const;
    row1.forEach((s, i) => {
      const b = new Button({ label: s === 'primary' ? 'Play' : s === 'success' ? 'Claim' : 'Info', style: s, width: 200, height: 104 });
      b.position.set(110 + i * 250, y + 50);
      host.addChild(b);
    });
    y += 130;
    this.heading(host, 'danger  neutral  purple', y);
    y += 80;
    (['danger', 'neutral', 'purple'] as const).forEach((s, i) => {
      const b = new Button({ label: s === 'danger' ? 'Delete' : s === 'neutral' ? 'Cancel' : 'Summon', style: s, width: 200, height: 104 });
      b.position.set(110 + i * 250, y + 50);
      host.addChild(b);
    });
    y += 130;
    this.heading(host, 'sublabel / icon / big CTA', y);
    y += 90;
    const cta = new Button({ label: 'START RUN', sublabel: 'Wave 12', style: 'primary', width: 420, height: 130, fontSize: 52, icon: 'play' });
    cta.position.set(game.w / 2, y + 40);
    cta.startPulse();
    host.addChild(cta);
    y += 160;
    const ad = new Button({ label: 'Claim x2', sublabel: 'Watch ad', style: 'success', width: 300, height: 120, icon: 'ad' });
    ad.position.set(190, y + 40);
    const buy = new Button({ label: 'Buy', sublabel: '1,200', sublabelIcon: 'coin', style: 'info', width: 260, height: 120 });
    buy.position.set(520, y + 40);
    host.addChild(ad, buy);
    y += 150;
    this.heading(host, 'disabled / icon buttons', y);
    y += 80;
    const dis = new Button({ label: 'Locked', style: 'primary', width: 220, height: 100, enabled: false });
    dis.position.set(140, y + 40);
    host.addChild(dis);
    (['close', 'settings', 'sound_on', 'plus'] as const).forEach((n, i) => {
      const ib = new IconButton({ icon: n, style: STYLES[i + 1] ?? 'info', size: 88 });
      ib.position.set(320 + i * 100, y + 40);
      host.addChild(ib);
    });
    y += 130;
    const panel = new Panel({ width: 600, height: 240, variant: 'default', title: 'Panel' });
    panel.position.set(game.w / 2, y + 150);
    host.addChild(panel);
  }

  private pageIcons(host: Container): void {
    const cols = 5;
    const cell = 130;
    const x0 = (game.w - cols * cell) / 2 + cell / 2;
    const y0 = game.safeTop + 130;
    ICON_NAMES.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tile = new Graphics();
      tile.roundRect(-58, -58, 116, 116, 20).fill({ color: 0x000000, alpha: 0.25 });
      const ic = drawIcon(n, 84);
      ic.position.y = -4;
      const cap = uiLabel(n, { size: 20, color: Color.textDim, stroke: false });
      cap.position.y = 46;
      const c = new Container();
      c.addChild(tile, ic, cap);
      c.position.set(x0 + col * cell, y0 + row * 150);
      host.addChild(c);
    });
  }
}
