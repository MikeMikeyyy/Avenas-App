import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WeightUnit = 'kg' | 'lbs';

const UNITS_KEY = '@weight_unit';
const KG_TO_LBS = 2.20462;

type UnitsContextType = {
  unit: WeightUnit;
  setUnit: (u: WeightUnit) => void;
  toDisplay: (kg: number) => number;
  toKg: (val: number) => number;
  fmtWt: (kg: number) => string;
};

const UnitsContext = createContext<UnitsContextType | null>(null);

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>('kg');

  useEffect(() => {
    AsyncStorage.getItem(UNITS_KEY).then(v => {
      if (v === 'lbs' || v === 'kg') setUnitState(v);
    });
  }, []);

  const setUnit = useCallback((u: WeightUnit) => {
    setUnitState(u);
    AsyncStorage.setItem(UNITS_KEY, u).catch(() => {});
  }, []);

  const toDisplay = useCallback(
    (kg: number) => (unit === 'lbs' ? kg * KG_TO_LBS : kg),
    [unit],
  );

  const toKg = useCallback(
    (val: number) => (unit === 'lbs' ? val / KG_TO_LBS : val),
    [unit],
  );

  const fmtWt = useCallback(
    (kg: number) => {
      const v = toDisplay(kg);
      const r = Math.round(v * 10) / 10;
      return `${r % 1 === 0 ? Math.round(r) : r.toFixed(1)} ${unit}`;
    },
    [unit, toDisplay],
  );

  return React.createElement(
    UnitsContext.Provider,
    { value: { unit, setUnit, toDisplay, toKg, fmtWt } },
    children,
  );
}

export function useUnits() {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used within UnitsProvider');
  return ctx;
}
