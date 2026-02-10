import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radius } from '../styles/tokens';

const statusColors = {
  success: { bg: colors.successBg, text: colors.success },
  warning: { bg: colors.warningBg, text: colors.warning },
  error: { bg: colors.errorBg, text: colors.error },
  info: { bg: colors.infoBg, text: colors.info },
  default: { bg: colors.surfaceAlt, text: colors.textSecondary },
};

const statusMap = {
  DRAFT: 'default',
  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  COMPLETED: 'success',
  REJECTED: 'error',
  CANCELLED: 'error',
};

const labelMap = {
  DRAFT: 'Taslak',
  PENDING: 'Beklemede',
  PENDING_APPROVAL: 'Onay Bekliyor',
  APPROVED: 'Onaylandı',
  COMPLETED: 'Tamamlandı',
  REJECTED: 'Reddedildi',
  CANCELLED: 'İptal Edildi',
};

export default function Badge({ status, label, variant }) {
  const colorKey = variant || statusMap[status] || 'default';
  const c = statusColors[colorKey] || statusColors.default;
  const displayLabel = label || labelMap[status] || status;

  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{displayLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
  },
});
