import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { spacing, radii, fontSizes } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { parseLocalDate, toLocalISODate, formatExpenseDate } from '../utils/date';

interface DateFieldProps {
  /** Selected date as a `YYYY-MM-DD` string. */
  value: string;
  /** Called with the newly selected `YYYY-MM-DD` string. */
  onChange: (value: string) => void;
  testID?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A dependency-free, date-only picker rendered as a tappable field that opens a
 * month calendar. Timezone-safe (uses local date parsing/formatting).
 */
export default function DateField({ value, onChange, testID }: DateFieldProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const selected = useMemo(() => parseLocalDate(value) ?? new Date(), [value]);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth()); // 0-based

  const openPicker = () => {
    const base = parseLocalDate(value) ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setOpen(true);
  };

  const goPrevMonth = () => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  };
  const goNextMonth = () => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  };

  const pick = (day: number) => {
    onChange(toLocalISODate(new Date(viewYear, viewMonth, day)));
    setOpen(false);
  };

  const pickToday = () => {
    const now = new Date();
    onChange(toLocalISODate(now));
    setOpen(false);
  };

  const { cells, todayISO, selectedISO } = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return {
      cells: arr,
      todayISO: toLocalISODate(new Date()),
      selectedISO: parseLocalDate(value) ? toLocalISODate(parseLocalDate(value)!) : '',
    };
  }, [viewYear, viewMonth, value]);

  return (
    <>
      <TouchableOpacity
        testID={testID}
        activeOpacity={0.7}
        style={[styles.field, { backgroundColor: c.surface, borderColor: c.border }]}
        onPress={openPicker}
      >
        <Text style={[styles.fieldText, { color: c.text }]}>
          {formatExpenseDate(value) || 'Select date'}
        </Text>
        <Text style={[styles.calendarIcon, { color: c.muted }]}>📅</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.card, { backgroundColor: c.surface }]}>
            {/* Month navigation */}
            <View style={styles.header}>
              <TouchableOpacity testID="date-field-prev-month" onPress={goPrevMonth} style={styles.navBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.navText, { color: c.primary }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: c.text }]}>{MONTHS[viewMonth]} {viewYear}</Text>
              <TouchableOpacity testID="date-field-next-month" onPress={goNextMonth} style={styles.navBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.navText, { color: c.primary }]}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday labels */}
            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={[styles.weekday, { color: c.muted }]}>{w}</Text>
              ))}
            </View>

            {/* Day grid */}
            <View style={styles.grid}>
              {cells.map((day, idx) => {
                if (day === null) return <View key={`e-${idx}`} style={styles.cell} />;
                const iso = toLocalISODate(new Date(viewYear, viewMonth, day));
                const isSelected = iso === selectedISO;
                const isToday = iso === todayISO;
                return (
                  <TouchableOpacity
                    key={`d-${day}`}
                    testID={`date-field-day-${day}`}
                    style={styles.cell}
                    onPress={() => pick(day)}
                  >
                    <View style={[
                      styles.dayInner,
                      isSelected && { backgroundColor: c.primary },
                      !isSelected && isToday && { borderWidth: 1, borderColor: c.primary },
                    ]}>
                      <Text style={[
                        styles.dayText,
                        { color: isSelected ? c.white : c.text },
                      ]}>{day}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity testID="date-field-today" onPress={pickToday}>
                <Text style={[styles.actionText, { color: c.primary }]}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="date-field-close" onPress={() => setOpen(false)}>
                <Text style={[styles.actionText, { color: c.muted }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    borderRadius: radii.sm, borderWidth: 1, padding: spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  fieldText: { fontSize: fontSizes.md },
  calendarIcon: { fontSize: fontSizes.md },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.xl,
  },
  card: { width: '100%', maxWidth: 340, borderRadius: radii.lg, padding: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  navText: { fontSize: fontSizes.xxl, fontWeight: '700' },
  headerTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekday: { flex: 1, textAlign: 'center', fontSize: fontSizes.xs, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  dayInner: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
  },
  dayText: { fontSize: fontSizes.sm, fontWeight: '600' },
  actions: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: spacing.md, paddingTop: spacing.md,
  },
  actionText: { fontSize: fontSizes.sm, fontWeight: '700' },
});
