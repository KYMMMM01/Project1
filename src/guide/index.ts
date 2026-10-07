/** The game's explanations: the topic list, the numbers behind them, what the player has learnt, and the guidebook screen. */
import './strings';

export { factsOf, type Facts } from './facts';
export { closeGuide, openGuide, type GuideHost, type GuideOpts } from './GuideScreen';
export { illustration } from './Illustration';
export { GuideProgress, guideProgress } from './progress';
export { topicFull, topicTeach, topicTitle } from './text';
export {
  SECTIONS, TOPICS, TOPIC_IDS, isTopicId, topicDef, topicsOf, type Art, type HomePoint, type SectionId, type TopicDef, type TopicId, type TryControl, type TryTab,
} from './topics';
