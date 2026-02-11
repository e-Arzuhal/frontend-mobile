import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../styles/tokens';

const defaultSteps = [
  'Temel Bilgiler',
  'Taraflar',
  'İçerik',
  'Önizleme',
];

export default function StepIndicator({ currentStep = 0, steps = defaultSteps }) {
  return (
    <View style={styles.container}>
      {steps.map((label, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const isLast = index === steps.length - 1;

        return (
          <View key={index} style={styles.stepRow}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.circleCompleted,
                  isActive && styles.circleActive,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                ) : (
                  <Text
                    style={[
                      styles.circleText,
                      (isActive || isCompleted) && styles.circleTextActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  isActive && styles.labelActive,
                  isCompleted && styles.labelCompleted,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {!isLast && (
              <View
                style={[
                  styles.line,
                  isCompleted && styles.lineCompleted,
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  stepRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepItem: {
    alignItems: 'center',
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  circleCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  circleText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textMuted,
  },
  circleTextActive: {
    color: colors.textInverse,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 60,
  },
  labelActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.accent,
  },
  labelCompleted: {
    color: colors.success,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 4,
    marginBottom: 18,
  },
  lineCompleted: {
    backgroundColor: colors.success,
  },
});
