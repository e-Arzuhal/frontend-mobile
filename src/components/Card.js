import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { colors, radius, shadows } from '../styles/tokens';

export default function Card({ children, style, noPadding = false }) {
  return (
    <View style={[styles.card, shadows.md, noPadding ? null : styles.padding, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: Platform.OS === 'android' ? 0 : StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  padding: {
    padding: 20,
  },
});
