import { create } from 'zustand';
import { deviceById } from './data/network';
import type { Lang, ZoneId } from './types';
import { prompt, runCommand } from './sim/cli';
import { deriveFlags, scenarioById } from './sim/scenarios';
import { initialSimState, newSession, type CliSession, type SimState } from './sim/state';

export type Tab = 'explore' | 'learn' | 'scenarios';
export type DevTab = 'info' | 'security' | 'cli' | 'relations' | 'location';

export interface ScenarioRun {
  id: string;
  step: number;
  startedAt: number;
  finishedAt?: number;
  hintsUsed: number;
  shownHints: Record<string, number>;
  log: { kind: 'info' | 'ok' | 'warn'; text: { zh: string; en: string } }[];
  /** Step whose learning card is being shown. */
  lastDone?: string;
}

interface Store {
  lang: Lang;
  tab: Tab;
  selected: string | null;
  highlight: string[];
  floor: ZoneId | 'all';
  exploded: boolean;
  showFlows: boolean;
  showLabels: boolean;
  focusFlow: string | null;
  sim: SimState;
  sessions: Record<string, CliSession>;
  devTab: DevTab;
  topic: string | null;
  run: ScenarioRun | null;
  focusTick: number;

  setLang: (l: Lang) => void;
  setTab: (t: Tab) => void;
  select: (id: string | null, focus?: boolean) => void;
  setHighlight: (ids: string[]) => void;
  setFloor: (f: ZoneId | 'all') => void;
  toggle: (k: 'exploded' | 'showFlows' | 'showLabels') => void;
  setFocusFlow: (id: string | null) => void;
  openTerminal: (id: string) => void;
  setDevTab: (t: DevTab) => void;
  setTopic: (id: string | null) => void;
  exec: (deviceId: string, input: string) => void;
  startScenario: (id: string) => void;
  abortScenario: () => void;
  useHint: () => void;
  dismissLearn: () => void;
}

const savedLang = (): Lang => {
  try {
    const v = localStorage.getItem('cybermedic.lang');
    if (v === 'zh' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.startsWith('zh') ? 'zh' : 'en';
};

export const useStore = create<Store>((set, get) => ({
  lang: savedLang(),
  tab: 'explore',
  selected: null,
  highlight: [],
  floor: 'all',
  exploded: true,
  showFlows: true,
  showLabels: true,
  focusFlow: null,
  sim: initialSimState(),
  sessions: {},
  devTab: 'info',
  topic: null,
  run: null,
  focusTick: 0,

  setLang: (lang) => {
    try {
      localStorage.setItem('cybermedic.lang', lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    set({ lang });
  },
  setTab: (tab) => set({ tab }),
  select: (id, focus = false) => {
    const d = id ? deviceById(id) : null;
    set((st) => ({
      selected: id,
      floor: d && focus && st.floor !== 'all' && st.floor !== d.zone ? d.zone : st.floor,
      focusTick: focus ? st.focusTick + 1 : st.focusTick,
    }));
  },
  setHighlight: (highlight) => set({ highlight }),
  setFloor: (floor) => set({ floor }),
  toggle: (k) => set((st) => ({ [k]: !st[k] }) as Partial<Store>),
  setFocusFlow: (focusFlow) => set({ focusFlow }),
  openTerminal: (id) => {
    if (!get().sessions[id]) set((st) => ({ sessions: { ...st.sessions, [id]: newSession() } }));
    get().select(id, true);
    set({ devTab: 'cli' });
  },
  setDevTab: (devTab) => set({ devTab }),
  setTopic: (topic) => set({ topic }),

  exec: (deviceId, input) => {
    const st = get();
    const dev = deviceById(deviceId);
    if (!dev) return;
    const sim: SimState = structuredClone(st.sim);
    const ses: CliSession = structuredClone(st.sessions[deviceId] ?? newSession());
    const promptLine = { kind: 'in' as const, text: `${prompt(dev, ses)} ${input}` };
    deriveFlags(sim);
    const out = runCommand(dev, input, sim, ses, st.lang);
    deriveFlags(sim);
    if (input.trim() === 'clear' || input.trim() === 'cls') ses.lines = [];
    else ses.lines = [...ses.lines, promptLine, ...out].slice(-600);
    sim.version++;

    let run = st.run ? structuredClone(st.run) : null;
    if (run && !run.finishedAt) {
      const sc = scenarioById(run.id)!;
      // allow a single command to complete several steps in a row
      for (;;) {
        const step = sc.steps[run.step];
        if (!step) break;
        const fb = step.feedback?.(sim);
        if (fb && run.log[run.log.length - 1]?.text.en !== fb.en) run.log.push({ kind: 'warn', text: fb });
        if (!step.check(sim)) break;
        run.log.push({ kind: 'ok', text: { zh: `✔ ${step.title.zh}`, en: `✔ ${step.title.en}` } });
        run.lastDone = step.id;
        run.step++;
        if (run.step >= sc.steps.length) {
          run.finishedAt = Date.now();
          sim.compromised = [];
          break;
        }
      }
    }
    set({ sim, sessions: { ...st.sessions, [deviceId]: ses }, run });
  },

  startScenario: (id) => {
    const sc = scenarioById(id);
    if (!sc) return;
    const sim = initialSimState();
    sc.setup(sim);
    set({
      sim,
      sessions: {},
      devTab: 'info',
      run: { id, step: 0, startedAt: Date.now(), hintsUsed: 0, shownHints: {}, log: [{ kind: 'info', text: sc.intro }] },
      selected: sc.steps[0].device,
      tab: 'scenarios',
      floor: 'all',
      focusTick: get().focusTick + 1,
    });
  },
  abortScenario: () => set({ run: null, sim: initialSimState(), sessions: {} }),
  useHint: () => {
    const run = get().run;
    if (!run) return;
    const sc = scenarioById(run.id)!;
    const step = sc.steps[run.step];
    if (!step) return;
    const shown = run.shownHints[step.id] ?? 0;
    if (shown >= step.hints.length) return;
    set({ run: { ...run, hintsUsed: run.hintsUsed + 1, shownHints: { ...run.shownHints, [step.id]: shown + 1 } } });
  },
  dismissLearn: () => {
    const run = get().run;
    if (run) set({ run: { ...run, lastDone: undefined } });
  },
}));

export function scoreOf(run: ScenarioRun, now: number) {
  const secs = Math.floor(((run.finishedAt ?? now) - run.startedAt) / 1000);
  const timePenalty = Math.min(300, Math.floor(secs / 10) * 2);
  return { secs, score: Math.max(0, 1000 - run.hintsUsed * 100 - timePenalty) };
}
