/**
 * A skill's scene is built on that skill's FIRST CAST (`director/sp/index.ts`), not when the director is mounted, so a test rig that wants to look
 * at the scene's `live()` read-out reads it when it is asked, not at mount. Asking before the skill has cast is a mistake the helper says out loud.
 */
import type { SpStaging } from '@/view/director/sp';

export function lazyLive<L>(staging: SpStaging | null, skill: string): { live(): L } {
  return {
    live: () => {
      const scene = staging?.scenes[skill as keyof SpStaging['scenes']] as unknown as { live(): L } | undefined;
      if (!scene) throw new Error(`the ${skill} scene is not built yet: nothing has cast that skill`);
      return scene.live();
    },
  };
}
