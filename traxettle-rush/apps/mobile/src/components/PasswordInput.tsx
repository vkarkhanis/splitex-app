import React, { useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

type PasswordInputProps = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  toggleColor: string;
};

export default function PasswordInput({
  containerStyle,
  inputStyle,
  toggleColor,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        style={[styles.input, inputStyle]}
      />
      <Pressable
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => setVisible((current) => !current)}
        style={styles.toggle}
      >
        <Text style={[styles.toggleText, { color: toggleColor }]}>
          {visible ? 'Hide' : 'Show'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    paddingRight: 72,
  },
  toggle: {
    position: 'absolute',
    right: 16,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
