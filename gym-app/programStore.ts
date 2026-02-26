// Shared program state using React context

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Exercise = { name: string; sets: number; warmupSets?: number; mode?: 'reps' | 'hold' };
export type Session = { label: string; exercises: Exercise[] };
export type SplitDay =
  | { type: 'training'; sessions: Session[] }
  | { type: 'rest' };

export function getDayLabel(sd: SplitDay): string {
  if (sd.type === 'rest') return 'Rest';
  if (sd.sessions.length === 1) return sd.sessions[0].label;
  return sd.sessions.map(s => s.label).join(' / ');
}

export function getDayExerciseCount(sd: SplitDay): number {
  if (sd.type === 'rest') return 0;
  return sd.sessions.reduce((sum, s) => sum + s.exercises.length, 0);
}

export function isMultiSession(sd: SplitDay): boolean {
  return sd.type === 'training' && sd.sessions.length > 1;
}

export const PROGRAM_COLORS = [
  '#FF0000', // Red
  '#CD5C5C', // Indian Red
  '#FFA500', // Orange
  '#EEB4B4', // Rosy Brown 2
  '#FF7F50', // Coral
  '#CD6600', // Dark Orange 3
  '#FF1493', // Deep Pink
  '#FF82AB', // Pale Violet Red 1
  '#BA55D3', // Medium Orchid
  '#9370DB', // Medium Purple
  '#8B008B', // Dark Magenta
  '#483D8B', // Dark Slate Blue
  '#00CED1', // Dark Turquoise
  '#98F5FF', // Cadet Blue 1
  '#00BFFF', // Deep Sky Blue
  '#1E90FF', // Dodger Blue 2
  '#104E8B', // Dodger Blue 4
  '#76EEC6', // Aquamarine 2
  '#ADFF2F', // Green Yellow
  '#54FF9F', // Sea Green 1
  '#228B22', // Forest Green
  '#FFD700', // Gold
  '#FFFF00', // Yellow
  '#F0E68C', // Khaki
  '#8B7E66', // Wheat 4
] as const;

export type Program = {
  id: string;
  name: string;
  color: string;
  splitDays: SplitDay[];
};

export type SharedProgram = Program & {
  sharedBy: string;
};

const DEFAULT_PROGRAMS: Program[] = [
  {
    id: '1',
    name: 'PPL',
    color: PROGRAM_COLORS[0],
    splitDays: [
      { type: 'training', sessions: [{ label: 'Push', exercises: [{ name: 'Bench Press', sets: 4 }, { name: 'Shoulder Press', sets: 3 }, { name: 'Tricep Pushdown', sets: 3 }] }] },
      { type: 'training', sessions: [{ label: 'Pull', exercises: [{ name: 'Barbell Row', sets: 4 }, { name: 'Pull Ups', sets: 3 }, { name: 'Bicep Curls', sets: 3 }] }] },
      { type: 'training', sessions: [{ label: 'Legs', exercises: [{ name: 'Squats', sets: 4 }, { name: 'Leg Press', sets: 3 }, { name: 'Leg Curls', sets: 3 }] }] },
      { type: 'rest' },
    ],
  },
  {
    id: '2',
    name: 'Upper/Lower',
    color: PROGRAM_COLORS[1],
    splitDays: [
      { type: 'training', sessions: [{ label: 'Upper', exercises: [{ name: 'Bench Press', sets: 4 }, { name: 'Barbell Row', sets: 4 }] }] },
      { type: 'training', sessions: [{ label: 'Lower', exercises: [{ name: 'Squats', sets: 4 }, { name: 'Romanian Deadlift', sets: 3 }] }] },
      { type: 'rest' },
      { type: 'training', sessions: [{ label: 'Upper', exercises: [{ name: 'Overhead Press', sets: 4 }, { name: 'Pull Ups', sets: 4 }] }] },
      { type: 'training', sessions: [{ label: 'Lower', exercises: [{ name: 'Deadlift', sets: 4 }, { name: 'Leg Press', sets: 3 }] }] },
      { type: 'rest' },
      { type: 'rest' },
    ],
  },
  {
    id: '3',
    name: 'Full Body',
    color: PROGRAM_COLORS[2],
    splitDays: [
      { type: 'training', sessions: [{ label: 'Full Body', exercises: [{ name: 'Squats', sets: 3 }, { name: 'Bench Press', sets: 3 }, { name: 'Barbell Row', sets: 3 }] }] },
      { type: 'rest' },
      { type: 'training', sessions: [{ label: 'Full Body', exercises: [{ name: 'Deadlift', sets: 3 }, { name: 'Overhead Press', sets: 3 }, { name: 'Pull Ups', sets: 3 }] }] },
      { type: 'rest' },
      { type: 'training', sessions: [{ label: 'Full Body', exercises: [{ name: 'Front Squats', sets: 3 }, { name: 'Incline Bench', sets: 3 }, { name: 'Cable Rows', sets: 3 }] }] },
      { type: 'rest' },
      { type: 'rest' },
    ],
  },
];

const DEFAULT_SHARED: SharedProgram[] = [
  {
    id: 'shared-1',
    name: 'Arnold Split',
    color: PROGRAM_COLORS[3],
    sharedBy: 'Jake',
    splitDays: [
      { type: 'training', sessions: [{ label: 'Chest & Back', exercises: [{ name: 'Bench Press', sets: 4 }, { name: 'Incline Dumbbell Press', sets: 3 }, { name: 'Pull Ups', sets: 4 }, { name: 'Barbell Row', sets: 3 }] }] },
      { type: 'training', sessions: [{ label: 'Shoulders & Arms', exercises: [{ name: 'Overhead Press', sets: 4 }, { name: 'Lateral Raises', sets: 3 }, { name: 'Barbell Curls', sets: 3 }, { name: 'Skull Crushers', sets: 3 }] }] },
      { type: 'training', sessions: [{ label: 'Legs', exercises: [{ name: 'Squats', sets: 4 }, { name: 'Leg Press', sets: 3 }, { name: 'Leg Curls', sets: 3 }, { name: 'Calf Raises', sets: 4 }] }] },
      { type: 'rest' },
    ],
  },
  {
    id: 'shared-2',
    name: '5/3/1',
    color: PROGRAM_COLORS[4],
    sharedBy: 'Coach Dan',
    splitDays: [
      { type: 'training', sessions: [{ label: 'Squat', exercises: [{ name: 'Squats', sets: 3 }, { name: 'Leg Press', sets: 5 }, { name: 'Leg Curls', sets: 5 }] }] },
      { type: 'training', sessions: [{ label: 'Bench', exercises: [{ name: 'Bench Press', sets: 3 }, { name: 'Dumbbell Press', sets: 5 }, { name: 'Tricep Pushdown', sets: 5 }] }] },
      { type: 'rest' },
      { type: 'training', sessions: [{ label: 'Deadlift', exercises: [{ name: 'Deadlift', sets: 3 }, { name: 'Good Mornings', sets: 5 }, { name: 'Hanging Leg Raise', sets: 5 }] }] },
      { type: 'training', sessions: [{ label: 'OHP', exercises: [{ name: 'Overhead Press', sets: 3 }, { name: 'Chin Ups', sets: 5 }, { name: 'Face Pulls', sets: 5 }] }] },
      { type: 'rest' },
      { type: 'rest' },
    ],
  },
];

type ProgramContextType = {
  programs: Program[];
  activeId: string;
  sharedPrograms: SharedProgram[];
  addProgram: (name: string, color: string, splitDays: SplitDay[]) => string;
  deleteProgram: (id: string) => void;
  setActive: (id: string) => void;
  updateProgram: (id: string, name: string, color: string, splitDays: SplitDay[]) => void;
  addSharedProgram: (program: SharedProgram) => void;
  saveSharedProgram: (id: string) => void;
  removeSharedProgram: (id: string) => void;
};

const ProgramContext = createContext<ProgramContextType | null>(null);

const PROGRAMS_KEY = '@programs_v1';
const ACTIVE_KEY = '@programs_activeId_v1';
let _nextId = 4;

export function ProgramProvider({ children }: { children: React.ReactNode }) {
  const [programs, setPrograms] = useState<Program[]>(DEFAULT_PROGRAMS);
  const [activeId, setActiveId] = useState('1');
  const [sharedPrograms, setSharedPrograms] = useState<SharedProgram[]>(DEFAULT_SHARED);
  const [loaded, setLoaded] = useState(false);

  // Load persisted programs on mount
  useEffect(() => {
    (async () => {
      try {
        const [programsRaw, activeRaw] = await Promise.all([
          AsyncStorage.getItem(PROGRAMS_KEY),
          AsyncStorage.getItem(ACTIVE_KEY),
        ]);
        if (programsRaw) {
          const parsed: Program[] = JSON.parse(programsRaw);
          setPrograms(parsed);
          const maxId = Math.max(...parsed.map(p => Number(p.id)).filter(n => !isNaN(n)), 3);
          _nextId = maxId + 1;
        }
        if (activeRaw) setActiveId(activeRaw);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // Persist programs whenever they change (after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs)).catch(() => {});
  }, [programs, loaded]);

  // Persist active id
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(ACTIVE_KEY, activeId).catch(() => {});
  }, [activeId, loaded]);

  const addProgram = useCallback((name: string, color: string, splitDays: SplitDay[]): string => {
    const id = String(_nextId++);
    setPrograms(prev => [...prev, { id, name, color, splitDays }]);
    return id;
  }, []);

  const deleteProgram = useCallback((id: string) => {
    setPrograms(prev => prev.filter(p => p.id !== id));
    setActiveId(prev => prev === id ? '1' : prev);
  }, []);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const updateProgram = useCallback((id: string, name: string, color: string, splitDays: SplitDay[]) => {
    setPrograms(prev => prev.map(p => p.id === id ? { ...p, name, color, splitDays } : p));
  }, []);

  const addSharedProgram = useCallback((program: SharedProgram) => {
    setSharedPrograms(prev => {
      if (prev.some(p => p.id === program.id)) return prev;
      return [...prev, program];
    });
  }, []);

  const saveSharedProgram = useCallback((id: string) => {
    setSharedPrograms(prev => {
      const shared = prev.find(p => p.id === id);
      if (shared) {
        const newId = String(_nextId++);
        setPrograms(progs => {
          const color = shared.color || PROGRAM_COLORS[progs.length % PROGRAM_COLORS.length];
          return [...progs, { id: newId, name: shared.name, color, splitDays: shared.splitDays }];
        });
        return prev.filter(p => p.id !== id);
      }
      return prev;
    });
  }, []);

  const removeSharedProgram = useCallback((id: string) => {
    setSharedPrograms(prev => prev.filter(p => p.id !== id));
  }, []);

  return React.createElement(
    ProgramContext.Provider,
    { value: { programs, activeId, sharedPrograms, addProgram, deleteProgram, setActive, updateProgram, addSharedProgram, saveSharedProgram, removeSharedProgram } as ProgramContextType },
    children
  );
}

export function useProgramStore() {
  const ctx = useContext(ProgramContext);
  if (!ctx) throw new Error('useProgramStore must be used within ProgramProvider');
  return ctx;
}
