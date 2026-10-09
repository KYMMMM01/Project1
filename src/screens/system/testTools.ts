/** The test block of the settings sheet: which buttons it holds. Only the development platform shows any. Pure. */
import { PLATFORM_ID } from '@/platform';
import type { Bundle, CurrencyId } from '@/meta';

export interface TestTool {
  currency: CurrencyId;
  amount: number;
}

/** What a tester needs to try the shop, the chests and the sweep without playing for it. */
export const TEST_TOOLS: readonly TestTool[] = [
  { currency: 'gold', amount: 10_000 },
  { currency: 'gems', amount: 1_000 },
  { currency: 'tickets', amount: 5 },
];

/** The same condition that shows the test ad and the test purchase sheet: a build for the development platform. */
export function testTools(platformId: string = PLATFORM_ID): readonly TestTool[] {
  return platformId === 'dev' ? TEST_TOOLS : [];
}

/** The bundle a tool hands out, for the currency flight. */
export function testBundle(currency: CurrencyId, amount: number): Bundle {
  switch (currency) {
    case 'gold':
      return { gold: amount };
    case 'gems':
      return { gems: amount };
    case 'tickets':
      return { tickets: amount };
  }
}
