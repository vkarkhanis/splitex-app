import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
  StyleSheet,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
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

/**
 * Date-only picker backed by the native platform date picker
 * (`@react-native-community/datetimepicker`).
 *
 * - Android: taps open the native calendar dialog; a selection commits immediately.
 * - iOS: taps open a modal spinner with a Done button.
 *
 * All values are date-only `YYYY-MM-DD` strings, parsed/formatted in the
 * client's local timezone so the displayed day never shifts.
 */
export default function DateField({ value, onChange, testID }: DateFieldProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const selected = useMemo(() => parseLocalDate(value) ?? new Date(), [value]);
  const [show, setShow] = useState(false);
  // iOS holds a temporary date until the user confirms with "Done".
  const [tempDate, setTempDate] = useState<Date>(selected);

  const openPicker = () => {
    setTempDate(parseLocalDate(value) ?? new Date());
    setShow(true);
  };

  const handleAndroidChange = (event: DateTimePickerEvent, d?: Date) => {
    setShow(false);
    if (event.type === 'set' && d) {
      onChange(toLocalISODate(d));
    }
  };

  const handleIosChange = (_event: DateTimePickerEvent, d?: Date) => {
    if (d) setTempDate(d);
  };

  const confirmIos = () => {
    onChange(toLocalISODate(tempDate));
    setShow(false);
  };

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

      {/* Android: native dialog, mounted only while shown. */}
      {show && Platform.OS === 'android' && (
        <DateTimePicker
          testID="date-field-native-picker"
          value={selected}
          mode="date"
          display="default"
          onChange={handleAndroidChange}
        />
      )}

      {/* iOS: modal spinner with an explicit confirm. */}
      {Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShow(false)}>
            <TouchableOpacity activeOpacity={1} style={[styles.card, { backgroundColor: c.surface }]}>
              <DateTimePicker
                testID="date-field-native-picker"
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleIosChange}
                textColor={c.text}
              />
              <View style={styles.actions}>
                <TouchableOpacity testID="date-field-cancel" onPress={() => setShow(false)}>
                  <Text style={[styles.actionText, { color: c.muted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="date-field-done" onPress={confirmIos}>
                  <Text style={[styles.actionText, { color: c.primary }]}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
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
  card: { width: '100%', maxWidth: 360, borderRadius: radii.lg, padding: spacing.lg },
  actions: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: spacing.md, paddingTop: spacing.md,
  },
  actionText: { fontSize: fontSizes.md, fontWeight: '700' },
});
