/** The words of a topic with its numbers filled in, in the current language. */
import { t } from '@/core/i18n';
import './strings';
import { factsOf } from './facts';
import type { TopicId } from './topics';

export function topicTitle(id: TopicId): string {
  return t(`guide.${id}.title`, factsOf(id));
}

/** One or two short sentences for a tutorial bubble or a lesson card. */
export function topicTeach(id: TopicId): string {
  return t(`guide.${id}.teach`, factsOf(id));
}

/** The guidebook page: paragraphs separated by line breaks. */
export function topicFull(id: TopicId): string[] {
  return t(`guide.${id}.full`, factsOf(id)).split('\n');
}
