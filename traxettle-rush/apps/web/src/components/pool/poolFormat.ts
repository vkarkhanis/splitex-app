/**
 * Pool formatting and copy. The implementations live in @traxettle/shared so
 * the web and mobile clients always agree; this module keeps web imports stable.
 */
export {
  CURRENCY_SYMBOLS,
  CONTRIBUTION_STATUS,
  POOL_NOUN,
  ZONE_TONE,
  canRecordAnyway,
  currencySymbol,
  describePoolRefusal,
  formatMinor,
  isReceiptRequired,
  poolErrorText,
  poolNoun,
  toPoolError,
} from '@traxettle/shared';
export type { PoolErrorInfo } from '@traxettle/shared';
