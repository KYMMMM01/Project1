/** Registers the codex's words (Korean and English) with the i18n tables. Keys: codex.* */
import { addStrings } from '@/core/i18n';
import { EN } from './stringsEn';
import { KO } from './stringsKo';

addStrings('ko', KO);
addStrings('en', EN);
