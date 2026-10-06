import type { TabFactory } from '../contract';
import { BattleTab } from './BattleTab';

/** Entry point of the "battle" tab: chapter card, start button and the home cards. */
export const createBattleTab: TabFactory = (shell) => new BattleTab(shell);
