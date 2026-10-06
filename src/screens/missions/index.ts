import { Container } from 'pixi.js';
import type { TabFactory } from '../contract';

/** Entry point of the "missions" tab. Placeholder until the tab is implemented. */
export const createMissionsTab: TabFactory = () => {
  const view = new Container();
  return { view, show() {}, hide() {}, resize() {}, update() {}, badge: () => false, destroy: () => view.destroy({ children: true }) };
};
