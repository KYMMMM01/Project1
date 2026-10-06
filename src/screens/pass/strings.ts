/** Player-facing lines of the season pass tab, ko (해요체) and en. Keys: rt.pass.* */
import { addStrings } from '@/core/i18n';
import '../system/strings';

addStrings('ko', {
  'rt.pass.season.0': '햇살 낮잠 시즌',
  'rt.pass.season.1': '참치 파티 시즌',
  'rt.pass.season.2': '달밤 산책 시즌',
  'rt.pass.season.3': '눈꽃 털뭉치 시즌',
  'rt.pass.daysLeft': '{n}일 남았어요',
  'rt.pass.lastDay': '오늘이 마지막이에요',
  'rt.pass.tierNow': '{n}단계',
  'rt.pass.xp': '{cur}/{max} XP',
  'rt.pass.maxed': '모든 단계를 끝냈어요!',
  'rt.pass.claimAll': '모두 받기',
  'rt.pass.buy': '프리미엄 열기',
  'rt.pass.owned': '프리미엄 이용 중',
  'rt.pass.premiumLocked': '프리미엄을 열면 받을 수 있어요.',
  'rt.pass.notYet': '아직 이 단계에 닿지 않았어요.',
  'rt.pass.buyFailed': '구매하지 못했어요. 잠시 뒤에 다시 해 보세요.',
  'rt.pass.buyUnavailable': '지금은 살 수 없어요.',
  'rt.pass.celebrate.title': '프리미엄이 열렸어요!',
  'rt.pass.celebrate.body': '{n}단계까지의 프리미엄 보상을 한꺼번에 받을 수 있어요.',
  'rt.pass.celebrate.empty': '이제 단계마다 프리미엄 보상이 쌓여요.',
  'rt.pass.celebrate.claim': '모두 받기',
  'rt.pass.celebrate.later': '나중에 받기',
  'rt.pass.ending.title': '시즌이 곧 끝나요',
  'rt.pass.ending.body': '못 받은 보상이 있어요. 시즌이 끝나면 사라져요.',
});

addStrings('en', {
  'rt.pass.season.0': 'Sunny Nap Season',
  'rt.pass.season.1': 'Tuna Party Season',
  'rt.pass.season.2': 'Moonlit Stroll Season',
  'rt.pass.season.3': 'Snowball Fluff Season',
  'rt.pass.daysLeft': '{n} days left',
  'rt.pass.lastDay': 'Last day today',
  'rt.pass.tierNow': 'Tier {n}',
  'rt.pass.xp': '{cur}/{max} XP',
  'rt.pass.maxed': 'Every tier is done!',
  'rt.pass.claimAll': 'Claim all',
  'rt.pass.buy': 'Unlock Premium',
  'rt.pass.owned': 'Premium active',
  'rt.pass.premiumLocked': 'Unlock Premium to claim this.',
  'rt.pass.notYet': 'You have not reached this tier yet.',
  'rt.pass.buyFailed': 'The purchase did not go through. Please try again in a moment.',
  'rt.pass.buyUnavailable': 'Not available right now.',
  'rt.pass.celebrate.title': 'Premium unlocked!',
  'rt.pass.celebrate.body': 'Premium rewards up to tier {n} are ready to claim.',
  'rt.pass.celebrate.empty': 'From now on every tier adds a Premium reward.',
  'rt.pass.celebrate.claim': 'Claim all',
  'rt.pass.celebrate.later': 'Claim later',
  'rt.pass.ending.title': 'The season is ending',
  'rt.pass.ending.body': 'Rewards are still waiting. They are gone when the season ends.',
});

/** Number of rotating season names. */
export const SEASON_NAME_COUNT = 4;
