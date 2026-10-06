/** Live summon odds: the table the next summon will really roll on, plus the pity rule and its state. */
import { type DestroyOptions, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Color, OddsTable, Panel, Popup, uiLabel, type OddsRow } from '@/ui';
import type { HudEnv } from '../env';
import { Subs } from '../kit';

const W = 640;
const TABLE_W = 560;

export class OddsPopup extends Popup<void> {
  private readonly subs = new Subs();
  private readonly table: OddsTable;
  private readonly status: Text;
  private readonly rule: Text;
  private readonly gradeT: Text;
  private readonly panel: Panel;

  constructor(private readonly env: HudEnv) {
    super({ dismissResult: undefined, priority: 1 });
    this.table = new OddsTable({ width: TABLE_W, rows: [] });
    this.gradeT = uiLabel('', { size: 28, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false });
    this.status = uiLabel('', { size: 28, anchorX: 0, anchorY: 0, align: 'left', color: Color.gold, strokeWidth: 4, shadow: false, wrap: TABLE_W });
    this.rule = uiLabel('', {
      size: 24, anchorX: 0, anchorY: 0, align: 'left', color: Color.textDim, wrap: TABLE_W, lineHeight: 32, strokeWidth: 4, shadow: false,
    });
    this.gradeT.position.set(40, 100);
    this.table.position.set((W - TABLE_W) / 2, 130);
    // Measure first: the rule text is longer in English, so the panel is as tall as its content.
    this.refresh(false);
    const h = Math.round(this.rule.y + this.rule.height + 52);
    this.panel = new Panel({ width: W, height: h, title: t('hud.odds.title'), onClose: () => this.close() });
    this.panel.content.addChild(this.gradeT, this.table, this.status, this.rule);
    this.body.addChild(this.panel);

    const e = env.battle.events;
    for (const type of ['pity', 'upgrade', 'summon'] as const) this.subs.add(e.on(type, () => this.refresh(true)));
    this.setContentSize(W + 60, h + 100);
  }

  private refresh(animate: boolean): void {
    const b = this.env.battle;
    const rows: OddsRow[] = b.summonOdds().map((r) => ({ value: r.p, rarity: r.key }));
    this.table.setRows(rows, animate);
    const pity = b.pity();
    this.gradeT.text = t('hud.odds.grade', { lv: b.summonGrade() + 1 });
    const th = this.table.tableHeight;
    this.status.position.set(40, 130 + th + 18);
    this.status.text = t('hud.odds.status', { n: pity.epicDry, limit: pity.epicDryLimit, bonus: Math.round(pity.epicBonus * 100) });
    this.rule.text = this.env.tutorial ? t('hud.odds.tutorial') : t('hud.odds.rule', { limit: pity.epicDryLimit, next: pity.epicDryLimit + 1 });
    this.rule.position.set(40, this.status.y + this.status.height + 14);
  }

  override destroy(options?: DestroyOptions): void {
    this.subs.dispose();
    super.destroy(options);
  }
}
