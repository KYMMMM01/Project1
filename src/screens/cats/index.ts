import type { TabFactory } from '../contract';
import { installServices } from '../shop/services';
import { createCatsTabView } from './CatsTab';

/** Entry point of the "cats" tab; it installs the shared services too, so they exist whichever tab is built first. */
export const createCatsTab: TabFactory = (shell) => {
  installServices(shell);
  return createCatsTabView();
};
