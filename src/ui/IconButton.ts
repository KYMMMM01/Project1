import { Button, type ButtonOpts } from './Button';
import type { IconName } from './icons';

export interface IconButtonOpts extends Omit<ButtonOpts, 'label' | 'sublabel' | 'sublabelIcon' | 'icon' | 'width' | 'height' | 'radius'> {
  icon: IconName;
  shape?: 'round' | 'square';
  /** Visual diameter / side. The touch target is never smaller than 88x88 whatever this is. */
  size?: number;
}

/** Icon-only button, round or rounded-square, built on Button so it shares press feel, sounds and states. */
export class IconButton extends Button {
  constructor(opts: IconButtonOpts) {
    const size = opts.size ?? 88;
    super({
      ...opts,
      icon: opts.icon,
      width: size,
      height: size,
      radius: (opts.shape ?? 'round') === 'round' ? 'pill' : Math.round(size * 0.28),
      style: opts.style ?? 'neutral',
      sfx: opts.sfx ?? (opts.icon === 'close' || opts.icon === 'back' ? 'ui_back' : 'ui_click'),
    });
  }
}
