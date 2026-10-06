import { debugExpose } from '@/core/debug';
import { provide, services, type Shell } from '../contract';
import { openUnitScreen } from '../cats/UnitScreen';
import { isChestResult, playChestReveal } from './ChestReveal';
import { setShell } from './context';
import { openOddsScreen } from './OddsScreen';
import { showRewardsPopup } from './rewards';
import { openShopSection } from './ShopTab';
import { isBundleParts } from './shopLogic';
import './strings';
import '../cats/strings';

/**
 * Register everything this module provides for other screens. Both tabs call it when they are built,
 * so the services exist whichever tab the shell creates first. Registering again only swaps the shell.
 */
export function installServices(shell: Shell): void {
  setShell(shell);
  provide('revealChest', (result) => (isChestResult(result) ? playChestReveal(result) : Promise.resolve()));
  provide('showRewards', (parts, title) => (isBundleParts(parts) ? showRewardsPopup(parts, title) : Promise.resolve()));
  provide('openOdds', (kind) => openOddsScreen(kind));
  provide('openShop', (section) => openShopSection(section));
  provide('openUnit', (id) => openUnitScreen(id));
  // QA: open any of these screens directly from the console or a browser script.
  debugExpose('collection', { openUnit: services.openUnit, openOdds: services.openOdds, openShop: services.openShop, revealChest: services.revealChest, showRewards: services.showRewards });
}
