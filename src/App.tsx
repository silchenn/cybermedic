import { Suspense, useEffect } from 'react';
import { ui } from './i18n/ui';
import { Scene } from './scene/Scene';
import { scenarioById } from './sim/scenarios';
import { useStore, type Tab } from './store';
import { DevicePanel } from './ui/DevicePanel';
import { Sidebar } from './ui/Sidebar';

const REPO = 'https://github.com/silchenn/cybermedic';

export default function App() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const run = useStore((s) => s.run);
  const sim = useStore((s) => s.sim);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = ui('appTitle', lang);
  }, [lang]);

  const live = run && !run.finishedAt && scenarioById(run.id)!.attackFlows(sim).length > 0;
  const tabs: Tab[] = ['explore', 'learn', 'scenarios'];

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden>
            <rect width="64" height="64" rx="12" fill="#0b1220" />
            <path d="M26 12h12v14h14v12H38v14H26V38H12V26h14z" fill="#22d3ee" />
          </svg>
          <div>
            <b>CyberMedic</b>
            <span>{ui('appSub', lang)}</span>
          </div>
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {ui(t, lang)}
              {t === 'scenarios' && run && !run.finishedAt && <i className="dot" />}
            </button>
          ))}
        </nav>
        <div className="right-tools">
          <div className="seg lang">
            <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>
              中文
            </button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
              EN
            </button>
          </div>
          <a className="gh" href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub">
            <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </header>
      <main className="stage">
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
        {live && <div className="alert-banner">● {ui('attackLive', lang)} — {scenarioById(run!.id)!.title[lang]}</div>}
        <div className="help">{ui('help', lang)}</div>
        <Sidebar />
        <DevicePanel />
        <LearnCard />
      </main>
    </div>
  );
}

function LearnCard() {
  const lang = useStore((s) => s.lang);
  const run = useStore((s) => s.run);
  const dismiss = useStore((s) => s.dismissLearn);
  if (!run?.lastDone) return null;
  const sc = scenarioById(run.id)!;
  const step = sc.steps.find((s) => s.id === run.lastDone);
  if (!step) return null;
  return (
    <div className="modal-wrap" onClick={dismiss}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="phase">✔ {ui('stepDone', lang)} · {step.phase[lang]}</div>
        <h2>{step.title[lang]}</h2>
        <h4>{ui('whatLearned', lang)}</h4>
        <p>{step.learn[lang]}</p>
        <button className="btn primary" onClick={dismiss}>
          {lang === 'zh' ? '继续 →' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
