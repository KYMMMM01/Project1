import type { TabFactory } from '../contract';
import { installServices } from './services';
import { createShopTabView } from './ShopTab';

/** Entry point of the "shop" tab. Also provides the reveal, rewards, odds, shop-jump and unit services. */
export const createShopTab: TabFactory = (shell) => {
  installServices(shell);
  return createShopTabView(shell);
};
