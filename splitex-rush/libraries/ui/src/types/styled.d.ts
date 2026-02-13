import 'styled-components';
import type { SplitexTheme } from '../theme/themes';

declare module 'styled-components' {
  export interface DefaultTheme extends SplitexTheme {}
}
