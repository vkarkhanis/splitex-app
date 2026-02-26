import 'styled-components';
import type { TraxettleTheme } from '@traxettle/ui';

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends TraxettleTheme {}
}
