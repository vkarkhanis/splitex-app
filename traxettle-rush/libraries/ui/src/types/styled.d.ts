import 'styled-components';
import type { TraxettleTheme } from '../theme/themes';

declare module 'styled-components' {
  export interface DefaultTheme extends TraxettleTheme {}
}
