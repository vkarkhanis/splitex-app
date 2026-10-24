import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import {
  POOL_PRESET_LABELS,
  allowedFundingSources,
  formatMinor,
  meterCaption,
  meterGeometry,
  needsTarget,
  withPreset,
  choosePool,
  CONTRIBUTOR_PRESETS,
} from '@traxettle/shared';
import type { EventFundingModel, ExpenseFundingSource, FundingChoice, PoolCycleSummary, PoolOverdraftState } from '@traxettle/shared';
import { useTheme } from '../../context/ThemeContext';
import { fontSizes, radii, spacing } from '../../theme';
import { pickReceiptImage, poolService } from '../../services/pool';
import type { ImagePickerLike } from '../../services/pool';
import { getResolvedApiBaseUrl } from '../../api';

// ── Balance meter ─────────────────────────────────────────────────────────

/** Three-zone balance meter: spent, overdraft (hatched amber), paused (red). */
export function PoolMeterView({ overdraft, currency }: { overdraft: PoolOverdraftState; currency: string }) {
  const { colors } = useTheme().theme;
  const g = meterGeometry(overdraft);
  const blocked = overdraft.zone === 'blocked';
  const empty = overdraft.baselineMinor === 0 && overdraft.balanceMinor === 0;
  const captionColor = empty ? colors.muted : blocked ? colors.error : overdraft.zone === 'overdrawn' ? colors.warning : colors.text;
  return (
    <View testID="pool-meter" accessibilityRole="progressbar" accessibilityLabel={meterCaption(overdraft, currency)}>
      <Text style={[s.meterCaption, { color: captionColor }]} testID="pool-meter-caption">{meterCaption(overdraft, currency)}</Text>
      <View style={[s.track, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <View style={[s.fill, { left: 0, width: `${g.spentPoolPct}%`, backgroundColor: blocked ? colors.error : colors.primary }]} />
        {g.spentOverdraftPct > 0 && (
          <View style={[s.fill, { left: `${g.poolMarkPct}%`, width: `${g.spentOverdraftPct}%`, backgroundColor: blocked ? colors.error : colors.warning, opacity: 0.85 }]} />
        )}
        {overdraft.toleranceMinor > 0 && <View style={[s.mark, { left: `${g.poolMarkPct}%`, backgroundColor: colors.text }]} />}
      </View>
      {overdraft.toleranceMinor > 0 && (
        <Text style={[s.meterLegend, { color: colors.muted }]}>
          pool {formatMinor(overdraft.baselineMinor, currency)} · limit {formatMinor(overdraft.baselineMinor + overdraft.toleranceMinor, currency)}
        </Text>
      )}
    </View>
  );
}

// ── Paid with ─────────────────────────────────────────────────────────────

const PAID_WITH_COPY: Record<ExpenseFundingSource, { title: string; text: string }> = {
  pool: { title: 'Pool funds', text: 'Paid from the pool.' },
  pool_reimbursement: { title: 'My money — claim it back', text: 'The pool reimburses you.' },
  self: { title: 'My money — split it', text: 'A regular split.' },
};

/** First question on the expense form for pool-funded events. */
export function PaidWithSelector(props: {
  model: EventFundingModel;
  value: ExpenseFundingSource;
  onChange: (v: ExpenseFundingSource) => void;
  summary: PoolCycleSummary | null;
  currency: string;
  noun: string;
  amountMinor: number;
}) {
  const { colors } = useTheme().theme;
  const o = props.summary?.overdraft;
  let status: { color: string; text: string } | null = null;
  if (o && props.value !== 'self') {
    const projected = o.balanceMinor - props.amountMinor;
    const noun = props.noun.toLowerCase();
    if (o.zone === 'blocked' && o.policy !== 'allow') status = { color: colors.error, text: `${meterCaption(o, props.currency)}. If you already paid, you can still record it.` };
    else if (props.amountMinor > 0 && o.policy !== 'allow' && projected < o.floorMinor) status = { color: colors.error, text: `More than the ${noun} allows (${formatMinor(o.headroomMinor, props.currency)} available).` };
    else if (props.amountMinor > 0 && projected < 0) status = { color: colors.warning, text: `Takes the ${noun} ${formatMinor(-projected, props.currency)} into overdraft.` };
    else if (o.balanceMinor < 0) status = { color: colors.warning, text: `The ${noun} is overdrawn by ${formatMinor(-o.balanceMinor, props.currency)} · ${formatMinor(o.headroomMinor, props.currency)} of headroom left` };
    else status = { color: colors.textSecondary, text: `${formatMinor(o.balanceMinor, props.currency)} in the ${noun}${props.amountMinor > 0 ? ` · ${formatMinor(projected, props.currency)} after this` : ''}` };
  }
  return (
    <View testID="paid-with" style={{ marginBottom: spacing.md }}>
      <Text style={[s.label, { color: colors.textSecondary }]}>Paid with</Text>
      <View style={s.optionRow} accessibilityRole="radiogroup">
        {allowedFundingSources(props.model).map((opt) => {
          const selected = props.value === opt;
          return (
            <TouchableOpacity key={opt} testID={`paid-with-${opt}`} accessibilityRole="radio" accessibilityState={{ selected }}
              onPress={() => props.onChange(opt)}
              style={[s.option, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.infoBg : colors.surface }]}>
              <Text style={[s.optionTitle, { color: colors.text }]}>{PAID_WITH_COPY[opt].title}</Text>
              <Text style={[s.optionText, { color: colors.muted }]}>{PAID_WITH_COPY[opt].text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {status && <Text testID="paid-with-status" style={[s.status, { color: status.color }]}>{status.text}</Text>}
    </View>
  );
}

// ── Receipts ──────────────────────────────────────────────────────────────

async function resolveHref(url: string): Promise<string> {
  if (/^https?:\/\//i.test(url) || !url.startsWith('/')) return url;
  return `${(await getResolvedApiBaseUrl()).replace(/\/$/, '')}${url}`;
}

/** Photograph or pick receipts and attach them (uploads immediately). */
export function ReceiptPicker(props: { eventId: string; value: string[]; onChange: (urls: string[]) => void; required?: boolean }) {
  const { colors } = useTheme().theme;
  const [uploading, setUploading] = useState(false);

  const add = async (source: 'camera' | 'library') => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const imagePicker = require('expo-image-picker') as ImagePickerLike;
      const file = await pickReceiptImage(source, {
        imagePicker,
        readAsBase64: (uri) => readAsStringAsync(uri, { encoding: EncodingType.Base64 }),
        alert: (title, message) => Alert.alert(title, message),
      });
      if (!file) return;
      setUploading(true);
      const url = await poolService.uploadReceipt(props.eventId, file);
      props.onChange([...props.value, url]);
    } catch (err: unknown) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Could not upload the receipt');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View testID="receipt-picker" style={{ marginBottom: spacing.md }}>
      <Text style={[s.label, { color: colors.textSecondary }]}>Receipts{props.required ? '' : ' (optional)'}</Text>
      <View style={s.optionRow}>
        <TouchableOpacity testID="receipt-camera" disabled={uploading} onPress={() => void add('camera')} style={[s.smallBtn, { borderColor: colors.primary }]}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Take photo</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="receipt-library" disabled={uploading} onPress={() => void add('library')} style={[s.smallBtn, { borderColor: colors.primary }]}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Choose photo</Text>
        </TouchableOpacity>
        {uploading && <ActivityIndicator color={colors.primary} />}
      </View>
      {props.value.length > 0 && (
        <View style={[s.optionRow, { marginTop: spacing.sm }]}>
          {props.value.map((url, i) => (
            <View key={url} style={[s.chip, { borderColor: colors.border }]}>
              <TouchableOpacity onPress={async () => Linking.openURL(await resolveHref(url))}>
                <Text style={{ color: colors.primary, fontSize: fontSizes.sm }}>Receipt {i + 1}</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel={`Remove receipt ${i + 1}`} onPress={() => props.onChange(props.value.filter((u) => u !== url))}>
                <Text style={{ color: colors.muted, marginLeft: 6 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {props.required && props.value.length === 0 && (
        <Text style={[s.status, { color: colors.error }]}>A receipt is required for this expense.</Text>
      )}
    </View>
  );
}

// ── Create-event funding step ─────────────────────────────────────────────

type FundingStepViewProps = {
  value: FundingChoice;
  onChange: (v: FundingChoice) => void;
  currency: string;
  /** Offer "Several of us" pools; otherwise only "Just me" (see contributorPoolsAvailable). */
  allowContributorPools: boolean;
};

/** "How is this event funded?" — split expenses (default) or a pool preset. */
export function FundingStepView({ value, onChange, currency, allowContributorPools }: FundingStepViewProps) {
  const { colors } = useTheme().theme;
  const preset = value.funder === 'sponsor' ? 'sponsor_budget' : value.preset;
  const card = (selected: boolean) => [s.option, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.infoBg : colors.surface }];
  const input = [s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }];

  return (
    <View testID="funding-step" style={[s.section, { borderColor: colors.border }]}>
      <Text style={[s.label, { color: colors.textSecondary }]}>How is this event funded?</Text>
      <View style={s.optionRow}>
        <TouchableOpacity testID="funding-split" style={card(value.kind === 'split')} onPress={() => onChange({ ...value, kind: 'split' })}>
          <Text style={[s.optionTitle, { color: colors.text }]}>Split expenses</Text>
          <Text style={[s.optionText, { color: colors.muted }]}>Everyone pays their own way. Settle up at the end.</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="funding-pool" style={card(value.kind === 'pool')} onPress={() => onChange(choosePool(value, allowContributorPools))}>
          <Text style={[s.optionTitle, { color: colors.text }]}>Pool money</Text>
          <Text style={[s.optionText, { color: colors.muted }]}>Collect money up front. Spend from the pool.</Text>
        </TouchableOpacity>
      </View>

      {value.kind === 'pool' && (
        <>
          <Text style={[s.label, { color: colors.textSecondary, marginTop: spacing.md }]}>Who puts money in?</Text>
          <View style={s.optionRow}>
            {allowContributorPools && (
              <TouchableOpacity testID="funder-contributors" style={card(value.funder === 'contributors')}
                onPress={() => onChange(withPreset({ ...value, funder: 'contributors' }, CONTRIBUTOR_PRESETS.includes(value.preset) ? value.preset : 'trip_kitty'))}>
                <Text style={[s.optionTitle, { color: colors.text }]}>Several of us</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity testID="funder-sponsor" style={card(value.funder === 'sponsor')}
              onPress={() => onChange(withPreset({ ...value, funder: 'sponsor' }, 'sponsor_budget'))}>
              <Text style={[s.optionTitle, { color: colors.text }]}>Just me</Text>
            </TouchableOpacity>
          </View>

          {allowContributorPools && value.funder === 'contributors' && (
            <View style={[s.optionRow, { marginTop: spacing.sm }]}>
              {CONTRIBUTOR_PRESETS.map((p) => (
                <TouchableOpacity key={p} testID={`preset-${p}`} style={card(value.preset === p)} onPress={() => onChange(withPreset(value, p))}>
                  <Text style={[s.optionTitle, { color: colors.text }]}>{POOL_PRESET_LABELS[p].title}</Text>
                  <Text style={[s.optionText, { color: colors.muted }]}>{POOL_PRESET_LABELS[p].tagline}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {value.funder === 'sponsor' && (
            <Text style={[s.optionText, { color: colors.muted, marginTop: spacing.sm }]}>{POOL_PRESET_LABELS.sponsor_budget.tagline}</Text>
          )}

          {needsTarget(preset) && (
            <>
              <Text style={[s.label, { color: colors.textSecondary, marginTop: spacing.md }]}>{preset === 'sponsor_budget' ? `Total budget (${currency})` : `Amount to collect (${currency})`}</Text>
              <TextInput testID="pool-target-input" style={input} keyboardType="decimal-pad" value={value.targetAmount}
                onChangeText={(t) => onChange({ ...value, targetAmount: t })} placeholder="e.g. 800000" placeholderTextColor={colors.muted} />
            </>
          )}
          {preset !== 'sponsor_budget' && (
            <>
              <Text style={[s.label, { color: colors.textSecondary, marginTop: spacing.md }]}>
                {preset === 'household' || preset === 'club_treasury' ? `Each person, per month (${currency})` : `Each person puts in (${currency})`}
              </Text>
              <TextInput testID="pool-per-person-input" style={input} keyboardType="decimal-pad" value={value.perPersonAmount}
                onChangeText={(t) => onChange({ ...value, perPersonAmount: t })} placeholder="Optional — set later" placeholderTextColor={colors.muted} />
            </>
          )}
          {preset !== 'sponsor_budget' && (
            <TouchableOpacity testID="pool-allow-peer" style={[s.optionRow, { marginTop: spacing.md, alignItems: 'center' }]}
              onPress={() => onChange({ ...value, allowPeerExpenses: !value.allowPeerExpenses })}>
              <Text style={{ color: colors.primary, fontSize: fontSizes.lg }}>{value.allowPeerExpenses ? '☑' : '☐'}</Text>
              <Text style={[s.optionText, { color: colors.text, flex: 1 }]}>Also allow regular split expenses in this event</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: fontSizes.sm, fontWeight: '600', marginBottom: spacing.xs },
  section: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.lg },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { borderWidth: 1.5, borderRadius: radii.md, padding: spacing.md, minWidth: 140, flexGrow: 1, flexBasis: '45%' },
  optionTitle: { fontSize: fontSizes.sm, fontWeight: '700' },
  optionText: { fontSize: fontSizes.xs, marginTop: 2 },
  status: { fontSize: fontSizes.xs, fontWeight: '600', marginTop: spacing.xs },
  input: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSizes.md },
  smallBtn: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  meterCaption: { fontSize: fontSizes.sm, fontWeight: '700', marginBottom: spacing.xs },
  track: { height: 14, borderRadius: radii.full, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  fill: { position: 'absolute', top: 0, bottom: 0 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 2, opacity: 0.55 },
  meterLegend: { fontSize: fontSizes.xs, marginTop: 4, textAlign: 'right' },
});
