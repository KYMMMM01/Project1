import { Container } from 'pixi.js';
import type { TabFactory } from '../contract';

/** Entry point of the "shop" tab. Placeholder until the tab is implemented. */
export const createShopTab: TabFactory = () => {
  const view = new Container();
  return { view, show() {}, hide() {}, resize() {}, update() {}, badge: () => false, destroy: () => view.destroy({ children: true }) };
};
