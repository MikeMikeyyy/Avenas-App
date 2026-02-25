// Shared program state using React context

import React, { createContext, useContext, useState, useCallback } from 'react';

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
  '#47DDFF', // cyan
  '#FF6B6B', // coral
  '#A78BFA', // purple
  '#34D399', // emerald
  '#FBBF24', // amber
  '#F472B6', // pink
  '#60A5FA', // blue
  '#FB923C', // orange
  '#4ADE80', // green
  '#E879F9', // fuchsia
  '#F87171', // red
  '#38BDF8', // sky
  '#C084FC', // violet
  '#86EFAC', // light green
  '#FDE68A', // yellow
  '#FDA4AF', // rose
  '#67E8F9', // light cyan
  '#FCA5A1', // light red
  '#A5F3FC', // pale cyan
  '#D8B4FE', // lavender
  '#6EE7B7', // mint
  '#FCD34D', // gold
  '#F9A8D4', // light pink
  '#93C5FD', // periwinkle
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

let _nextId = 4;

export function ProgramProvider({ children }: { children: React.ReactNode }) {
  const [programs, setPrograms] = useState<Program[]>(DEFAULT_PROGRAMS);
  const [activeId, setActiveId] = useState('1');
  const [sharedPrograms, setSharedPrograms] = useState<SharedProgram[]>(DEFAULT_SHARED);

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
