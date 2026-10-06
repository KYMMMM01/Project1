import type { TabFactory } from '../contract';
import { MissionsTab } from './MissionsTab';

/** Entry point of the "missions" tab. */
export const createMissionsTab: TabFactory = (shell) => new MissionsTab(shell);
