import { create } from 'zustand'

export type Point = { x: number; y: number }
export type Wall = { start: Point; end: Point }
export type Opening = {
  wallIndex: number
  t: number
  kind: 'door' | 'window'
  width: number
}
export type Label = { x: number; y: number; text: string }

type Snapshot = { walls: Wall[]; openings: Opening[]; labels: Label[] }

type State = Snapshot & {
  past: Snapshot[]
  future: Snapshot[]
  addWall: (w: Wall) => void
  addOpening: (o: Opening) => void
  addLabel: (l: Label) => void
    deleteOpening: (index: number) => void
  setOpenings: (openings: Opening[]) => void
  deleteWall: (index: number) => void
  deleteLabel: (index: number) => void
  commitHistory: () => void
  setWalls: (walls: Wall[]) => void
  reset: () => void
  load: (walls: Wall[], openings: Opening[], labels: Label[]) => void
  undo: () => void
  redo: () => void
}

const snap = (s: Snapshot): Snapshot => ({
  walls: s.walls,
  openings: s.openings,
  labels: s.labels,
})

export const useStore = create<State>((set) => ({
  walls: [],
  openings: [],
  labels: [],
  past: [],
  future: [],

  addWall: (w) =>
    set((s) => ({ past: [...s.past, snap(s)], walls: [...s.walls, w], future: [] })),

  addOpening: (o) =>
    set((s) => ({ past: [...s.past, snap(s)], openings: [...s.openings, o], future: [] })),

  addLabel: (l) =>
    set((s) => ({ past: [...s.past, snap(s)], labels: [...s.labels, l], future: [] })),

  deleteWall: (index) =>
    set((s) => ({
      past: [...s.past, snap(s)],
      walls: s.walls.filter((_, i) => i !== index),
      openings: s.openings
        .filter((o) => o.wallIndex !== index)
        .map((o) => (o.wallIndex > index ? { ...o, wallIndex: o.wallIndex - 1 } : o)),
      future: [],
    })),

  deleteLabel: (index) =>
    set((s) => ({
      past: [...s.past, snap(s)],
      labels: s.labels.filter((_, i) => i !== index),
      future: [],
    })),
      deleteOpening: (index) =>
    set((s) => ({
      past: [...s.past, snap(s)],
      openings: s.openings.filter((_, i) => i !== index),
      future: [],
    })),

  // no history here: the caller runs commitHistory() once at the start of a drag
  setOpenings: (openings) => set({ openings }),

  commitHistory: () =>
    set((s) => ({ past: [...s.past, snap(s)], future: [] })),

  setWalls: (walls) => set({ walls }),

  reset: () =>
    set((s) => ({
      past: [...s.past, snap(s)],
      walls: [],
      openings: [],
      labels: [],
      future: [],
    })),

  load: (walls, openings, labels) =>
    set((s) => ({ past: [...s.past, snap(s)], walls, openings, labels, future: [] })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return s
      const prev = s.past[s.past.length - 1]
      return { ...prev, past: s.past.slice(0, -1), future: [snap(s), ...s.future] }
    }),

  redo: () =>
    set((s) => {
      if (!s.future.length) return s
      const next = s.future[0]
      return { ...next, past: [...s.past, snap(s)], future: s.future.slice(1) }
    }),
}))

const KEY = 'floorplan-v1'

try {
  const saved = localStorage.getItem(KEY)
  if (saved) {
    const data = JSON.parse(saved)
    useStore.setState({
      walls: data.walls ?? [],
      openings: data.openings ?? [],
      labels: data.labels ?? [],
    })
  }
} catch {
  // ignore corrupted data
}

useStore.subscribe((s) => {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ walls: s.walls, openings: s.openings, labels: s.labels })
    )
  } catch {
    // ignore storage errors
  }
})