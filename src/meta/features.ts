/** Feature unlocks by progress. Pure. */
import { t } from '@/core/i18n';
import { FEATURES, FEATURE_RULES, type FeatureId } from './data/schedule';
import { tn } from './plural';

export interface FeatureInputs {
  /** Completed runs, the tutorial included. */
  runs: number;
  accountLevel: number;
  /** Chapters cleared at stake 0, counted from chapter 1. */
  chaptersCleared: number;
  butler: boolean;
}

export function isFeatureUnlocked(feature: FeatureId, inp: FeatureInputs): boolean {
  const r = FEATURE_RULES[feature];
  return (
    (r.runs === undefined || inp.runs >= r.runs) &&
    (r.accountLevel === undefined || inp.accountLevel >= r.accountLevel) &&
    (r.chapter === undefined || inp.chaptersCleared >= r.chapter) &&
    (!r.butler || inp.butler)
  );
}

export function unlockedFeatures(inp: FeatureInputs): FeatureId[] {
  return FEATURES.filter((f) => isFeatureUnlocked(f, inp));
}

/** The "how do I get this" line shown on a locked feature. */
export function featureHint(feature: FeatureId): string {
  const r = FEATURE_RULES[feature];
  if (r.runs !== undefined) return tn('meta.unlock.runs', r.runs);
  if (r.accountLevel !== undefined) return t('meta.unlock.level', { n: r.accountLevel });
  if (r.chapter !== undefined) return t('meta.unlock.chapter', { chapter: t('chapter.' + r.chapter + '.name') });
  return t('meta.unlock.butler');
}
