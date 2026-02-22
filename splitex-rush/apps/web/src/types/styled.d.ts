import 'styled-components';
import type { SplitexTheme } from '@splitex/ui';

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends SplitexTheme {}
}
