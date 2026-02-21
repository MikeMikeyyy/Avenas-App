import React, { createContext, useContext, useState, useCallback } from 'react';

export type ThemeColors = {
  gradientStart: string;
  gradientEnd: string;
  cardTranslucent: string;
  cardSolid: string;
  cardBorder: string;
  primaryText: string;
  secondaryText: string;
  tertiaryText: string;
  whiteText: string;
  inputBg: string;
  border: string;
  statusBar: 'dark-content' | 'light-content';
  accent: string;
  backButtonBg: string;
  shadowColor: string;
  checkboxBg: string;
  modalBg: string;
  overlayBg: string;
};

const LIGHT_COLORS: ThemeColors = {
  gradientStart: '#abbac4',
  gradientEnd: '#FFFFFF',
  cardTranslucent: '#ffffff59',
  cardSolid: '#fff',
  cardBorder: '#ffffffcc',
  primaryText: '#2c3e50',
  secondaryText: '#5a6c7d',
  tertiaryText: '#8e8e93',
  whiteText: '#FFFFFF',
  inputBg: '#f5f6f8',
  border: '#f0f0f0',
  statusBar: 'dark-content',
  accent: '#47DDFF',
  backButtonBg: '#FFFFFF',
  shadowColor: '#000',
  checkboxBg: '#e8eaed',
  modalBg: '#fff',
  overlayBg: 'rgba(0,0,0,0.5)',
};

const DARK_COLORS: ThemeColors = {
  gradientStart: '#1a1a2e',
  gradientEnd: '#0f0f1a',
  cardTranslucent: 'rgba(255,255,255,0.06)',
  cardSolid: '#1c1c2e',
  cardBorder: 'rgba(255,255,255,0.1)',
  primaryText: '#e8eaed',
  secondaryText: '#a0a8b4',
  tertiaryText: '#6c7580',
  whiteText: '#FFFFFF',
  inputBg: '#3a3a58',
  border: 'rgba(255,255,255,0.08)',
  statusBar: 'light-content',
  accent: '#47DDFF',
  backButtonBg: '#252538',
  shadowColor: '#000',
  checkboxBg: '#2a2a3e',
  modalBg: '#1c1c2e',
  overlayBg: 'rgba(0,0,0,0.7)',
};

type ThemeContextType = {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return React.createElement(
    ThemeContext.Provider,
    { value: { isDark, colors, toggleTheme } },
    children
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
