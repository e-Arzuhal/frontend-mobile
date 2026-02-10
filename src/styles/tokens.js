import { Platform } from 'react-native';

export const colors = {
  primary: '#1B2A4A',
  primaryLight: '#2D4272',
  primaryDark: '#0F1A30',
  accent: '#C8963E',
  accentLight: '#E8C882',
  accentMuted: 'rgba(200, 150, 62, 0.12)',
  surface: '#FAFBFD',
  surfaceAlt: '#F0F2F7',
  card: '#FFFFFF',
  text: '#1B2A4A',
  textSecondary: '#6B7A96',
  textMuted: '#9CA8BC',
  textInverse: '#FFFFFF',
  border: '#E2E6EE',
  borderFocus: '#C8963E',
  success: '#2D8B55',
  successBg: '#E8F5EE',
  warning: '#D4880F',
  warningBg: '#FFF7E6',
  error: '#C0392B',
  errorBg: '#FDE8E5',
  info: '#2980B9',
  infoBg: '#E8F1FA',
};

export const fonts = {
  heading: 'PlayfairDisplay_700Bold',
  headingMedium: 'PlayfairDisplay_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const shadows = Platform.select({
  ios: {
    sm: { shadowColor: '#1B2A4A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    md: { shadowColor: '#1B2A4A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
    lg: { shadowColor: '#1B2A4A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 30 },
  },
  android: {
    sm: { elevation: 2 },
    md: { elevation: 4 },
    lg: { elevation: 8 },
  },
});
