// Shared program state using React context

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './authStore';

export type Exercise = { name: string; sets: number; warmupSets?: number; mode?: 'reps' | 'hold'; targetReps?: string };
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
  '#47DDFF', // Cyan
  '#00BFFF', // Deep Sky Blue
  '#1E90FF', // Dodger Blue
  '#7B68EE', // Medium Slate Blue
  '#6C5CE7', // Indigo
  '#A855F7', // Vivid Purple
  '#BA55D3', // Medium Orchid
  '#9370DB', // Medium Purple
  '#FF6EC7', // Hot Pink
  '#FF1493', // Deep Pink
  '#FF82AB', // Pale Pink
  '#E74C3C', // Red
  '#FF7675', // Soft Red
  '#FF7F50', // Coral
  '#FF9500', // Orange
  '#F39C12', // Sunflower
  '#FFD700', // Gold
  '#54FF9F', // Sea Green
  '#2ECC71', // Emerald
  '#32CD32', // Lime Green
  '#228B22', // Forest Green
  '#76EEC6', // Aquamarine
  '#98F5FF', // Light Cyan
  '#00CED1', // Turquoise
] as const;

export type Program = {
  id: string;
  name: string;
  color: string;
  splitDays: SplitDay[];
  archived?: boolean;
  sharedBy?: string; // set when the program was saved from a community share
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
  archiveProgram: (id: string) => void;
  restoreProgram: (id: string) => void;
  setActive: (id: string) => void;
  updateProgram: (id: string, name: string, color: string, splitDays: SplitDay[]) => void;
  addSharedProgram: (program: SharedProgram) => void;
  saveSharedProgram: (id: string) => void;
  removeSharedProgram: (id: string) => void;
};

const ProgramContext = createContext<ProgramContextType | null>(null);

const PROGRAMS_KEY = '@programs_v1';
const ACTIVE_KEY = '@programs_activeId_v1';
const SHARED_KEY = '@programs_shared_v1';
let _nextId = 1;

export function ProgramProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [activeId, setActiveId] = useState('');
  const [sharedPrograms, setSharedPrograms] = useState<SharedProgram[]>([]);
  const [loaded, setLoaded] = useState(false);
  const firestoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted programs on mount
  useEffect(() => {
    (async () => {
      try {
        const [programsRaw, activeRaw, sharedRaw] = await Promise.all([
          AsyncStorage.getItem(PROGRAMS_KEY),
          AsyncStorage.getItem(ACTIVE_KEY),
          AsyncStorage.getItem(SHARED_KEY),
        ]);
        if (programsRaw) {
          const parsed: Program[] = JSON.parse(programsRaw);
          setPrograms(parsed);
          const maxId = Math.max(...parsed.map(p => Number(p.id)).filter(n => !isNaN(n)), 0);
          _nextId = maxId + 1;
        }
        if (activeRaw) setActiveId(activeRaw);
        if (sharedRaw) setSharedPrograms(JSON.parse(sharedRaw));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // Clear state when user logs out so the next account starts fresh
  useEffect(() => {
    if (!user) {
      setPrograms([]);
      setActiveId('');
      setSharedPrograms([]);
      _nextId = 1;
      AsyncStorage.multiRemove([PROGRAMS_KEY, ACTIVE_KEY, SHARED_KEY]).catch(() => {});
    }
  }, [user?.uid]);

  // When a user logs in, fetch their programs from Firestore (cloud overrides local cache)
  useEffect(() => {
    if (!loaded || !user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'data', 'programs'));
        if (snap.exists()) {
          const data = snap.data();
          const fsPrograms: Program[] = data.programs ?? [];
          const fsActiveId: string = data.activeId ?? '';
          const fsShared: SharedProgram[] = data.sharedPrograms ?? [];
          setPrograms(fsPrograms);
          if (fsPrograms.length > 0) {
            const maxId = Math.max(...fsPrograms.map(p => Number(p.id)).filter(n => !isNaN(n)), 0);
            _nextId = maxId + 1;
          }
          setActiveId(fsActiveId);
          setSharedPrograms(fsShared);
          // Keep local cache in sync
          AsyncStorage.setItem(PROGRAMS_KEY, JSON.stringify(fsPrograms)).catch(() => {});
          AsyncStorage.setItem(ACTIVE_KEY, fsActiveId).catch(() => {});
          AsyncStorage.setItem(SHARED_KEY, JSON.stringify(fsShared)).catch(() => {});
        } else {
          // New user — clear any stale data from a previous account on this device
          setPrograms([]);
          setActiveId('');
          setSharedPrograms([]);
          _nextId = 1;
          AsyncStorage.multiRemove([PROGRAMS_KEY, ACTIVE_KEY, SHARED_KEY]).catch(() => {});
        }
      } catch {}
    })();
  }, [loaded, user?.uid]);

  // Persist programs to AsyncStorage whenever they change (after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs)).catch(() => {});
  }, [programs, loaded]);

  // Persist active id to AsyncStorage
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(ACTIVE_KEY, activeId).catch(() => {});
  }, [activeId, loaded]);

  // Persist shared programs to AsyncStorage
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(SHARED_KEY, JSON.stringify(sharedPrograms)).catch(() => {});
  }, [sharedPrograms, loaded]);

  // Sync programs + activeId to Firestore (debounced 1.5s) whenever they change
  useEffect(() => {
    if (!loaded || !user) return;
    if (firestoreTimer.current) clearTimeout(firestoreTimer.current);
    firestoreTimer.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'users', user.uid, 'data', 'programs'), {
          programs,
          activeId,
          sharedPrograms,
          updatedAt: serverTimestamp(),
        });
      } catch {}
    }, 1500);
    return () => {
      if (firestoreTimer.current) clearTimeout(firestoreTimer.current);
    };
  }, [programs, activeId, sharedPrograms, loaded, user?.uid]);

  const addProgram = useCallback((name: string, color: string, splitDays: SplitDay[]): string => {
    const id = String(_nextId++);
    setPrograms(prev => [...prev, { id, name, color, splitDays }]);
    return id;
  }, []);

  const deleteProgram = useCallback((id: string) => {
    setPrograms(prev => prev.filter(p => p.id !== id));
    setActiveId(prev => {
      if (prev !== id) return prev;
      const remaining = programs.filter(p => p.id !== id && !p.archived);
      return remaining[0]?.id ?? programs.find(p => p.id !== id)?.id ?? '';
    });
  }, [programs]);

  const archiveProgram = useCallback((id: string) => {
    setPrograms(prev => prev.map(p => p.id === id ? { ...p, archived: true } : p));
    setActiveId(prev => {
      if (prev !== id) return prev;
      const remaining = programs.filter(p => p.id !== id && !p.archived);
      return remaining[0]?.id ?? programs.find(p => p.id !== id)?.id ?? '';
    });
  }, [programs]);

  const restoreProgram = useCallback((id: string) => {
    setPrograms(prev => prev.map(p => p.id === id ? { ...p, archived: false } : p));
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
      if (!shared) return prev;
      return prev.filter(p => p.id !== id);
    });
    setPrograms(prev => {
      const shared = prev.find(p => p.id === id);
      // Don't duplicate if somehow already in programs
      if (shared) return prev;
      const sharedItem = sharedPrograms.find(p => p.id === id);
      if (!sharedItem) return prev;
      const newId = String(_nextId++);
      const color = sharedItem.color || PROGRAM_COLORS[prev.length % PROGRAM_COLORS.length];
      return [...prev, { id: newId, name: sharedItem.name, color, splitDays: sharedItem.splitDays, sharedBy: sharedItem.sharedBy }];
    });
  }, [sharedPrograms]);

  const removeSharedProgram = useCallback((id: string) => {
    setSharedPrograms(prev => prev.filter(p => p.id !== id));
  }, []);

  return React.createElement(
    ProgramContext.Provider,
    { value: { programs, activeId, sharedPrograms, addProgram, deleteProgram, archiveProgram, restoreProgram, setActive, updateProgram, addSharedProgram, saveSharedProgram, removeSharedProgram } as ProgramContextType },
    children
  );
}

export function useProgramStore() {
  const ctx = useContext(ProgramContext);
  if (!ctx) throw new Error('useProgramStore must be used within ProgramProvider');
  return ctx;
}
