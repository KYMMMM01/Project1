import type { TabFactory } from '../contract';
import { PassTab } from './PassTab';

/** Entry point of the "pass" tab. */
export const createPassTab: TabFactory = (shell) => new PassTab(shell);
