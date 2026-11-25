import { useEffect, useState } from 'react';
import { DEVICES, VLANS, ZONES } from '../data/network';
import { CATEGORIES, TOPICS, topicById } from '../data/knowledge';
import { ui } from '../i18n/ui';
import { SCENARIOS, scenarioById } from '../sim/scenarios';
import { scoreOf, useStore } from '../store';
import type { ZoneId } from '../types';

export function Sidebar() {
  const tab = useStore((s) => s.tab);
  return <aside className="panel left">{tab === 'explore' ? <Explore /> : tab === 'learn' ? <Learn /> : <Scenarios />}</aside>;
}

/* ───────── Explore ───────── */

function Explore() {
  const lang = useStore((s) => s.lang);
  const floor = useStore((s) => s.floor);
  const setFloor = useStore((s) => s.setFloor);
  const exploded = useStore((s) => s.exploded);
  const showFlows = useStore((s) => s.showFlows);
  const showLabels = useStore((s) => s.showLabels);
  const toggle = useStore((s) => s.toggle);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected);
  const sim = useStore((s) => s.sim);
  const setHighlight = useStore((s) => s.setHighlight);
  const highlight = useStore((s) => s.highlight);
  const zones: (ZoneId | 'all')[] = ['all', 'f3', 'f2', 'f1', 'b1', 'outside'];

  return (
    <div>
      <h3>{ui('floors', lang)}</h3>
      <div className="seg">
        {zones.map((z) => (
          <button key={z} className={floor === z ? 'on' : ''} onClick={() => setFloor(z)}>
            {z === 'all' ? ui('all', lang) : z === 'outside' ? (lang === 'zh' ? '院外' : 'Out') : z.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="toggles">
        <label>
          <input type="checkbox" checked={exploded} onChange={() => toggle('exploded')} /> {ui('explode', lang)}
        </label>
        <label>
          <input type="checkbox" checked={showFlows} onChange={() => toggle('showFlows')} /> {ui('flows', lang)}
        </label>
        <label>
          <input type="checkbox" checked={showLabels} onChange={() => toggle('showLabels')} /> {ui('labels', lang)}
        </label>
      </div>

      <h3>{ui('vlans', lang)}</h3>
      <ul className="vlans">
        {VLANS.map((v) => {
          const ids = DEVICES.filter((d) => d.vlan === v.id).map((d) => d.id);
          const on = highlight.length > 0 && ids.every((i) => highlight.includes(i)) && highlight.length === ids.length;
          return (
            <li key={v.id} className={on ? 'on' : ''} onClick={() => setHighlight(on ? [] : ids)} title={v.purpose[lang]}>
              <i style={{ background: v.color }} />
              <b>{v.id}</b>
              <span>{v.name}</span>
              <code>{v.subnet}</code>
            </li>
          );
        })}
      </ul>

      {(['outside', 'b1', 'f1', 'f2', 'f3'] as ZoneId[]).map((z) => {
        const list = DEVICES.filter((d) => d.zone === z && (!d.hidden || sim.revealed.includes(d.id)));
        return (
          <div key={z} className="dev-group">
            <h4>{ZONES[z].name[lang]}</h4>
            <ul className="devlist">
              {list.map((d) => (
                <li key={d.id} className={`${selected === d.id ? 'on' : ''} ${sim.compromised.includes(d.id) ? 'bad' : ''}`} onClick={() => select(d.id, true)}>
                  <code>{d.id}</code>
                  <span>{d.name[lang]}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="muted small">{ui('disclaimer', lang)}</p>
    </div>
  );
}

/* ───────── Learn ───────── */

function Learn() {
  const lang = useStore((s) => s.lang);
  const topic = useStore((s) => s.topic);
  const setTopic = useStore((s) => s.setTopic);
  const setHighlight = useStore((s) => s.setHighlight);
  const openTerminal = useStore((s) => s.openTerminal);
  const exec = useStore((s) => s.exec);
  const select = useStore((s) => s.select);
  const t = topic ? topicById(topic) : null;

  useEffect(() => {
    if (t) setHighlight(t.devices);
    return () => setHighlight([]);
  }, [t, setHighlight]);

  if (t) {
    return (
      <div>
        <button className="back" onClick={() => setTopic(null)}>
          ← {ui('learn', lang)}
        </button>
        <div className="cat">{CATEGORIES[t.category][lang]}</div>
        <h2>{t.title[lang]}</h2>
        <p className="lead">{t.summary[lang]}</p>
        <ul className="points">
          {t.points.map((p, i) => (
            <li key={i}>{p[lang]}</li>
          ))}
        </ul>
        <div className="callout">
          <b>🏥 {ui('inHospital', lang)}</b>
          <p>{t.hospital[lang]}</p>
        </div>
        {!!t.commands?.length && (
          <>
            <h4>{ui('commands', lang)}</h4>
            <ul className="cmds">
              {t.commands.map((c, i) => (
                <li key={i}>
                  <button
                    className="cmd"
                    onClick={() => {
                      openTerminal(c.device);
                      exec(c.device, c.cmd);
                    }}
                  >
                    <span className="muted">{c.device}</span>
                    <code>{c.cmd}</code>
                    <span className="go">▶</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <h4>{ui('showOnMap', lang)}</h4>
        <div className="chips">
          {t.devices.map((id) => (
            <button key={id} className="chip" onClick={() => select(id, true)}>
              {id}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {(Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((cat) => (
        <div key={cat}>
          <h3>{CATEGORIES[cat][lang]}</h3>
          <ul className="topics">
            {TOPICS.filter((x) => x.category === cat).map((x) => (
              <li key={x.id} onClick={() => setTopic(x.id)} onMouseEnter={() => setHighlight(x.devices)} onMouseLeave={() => setHighlight([])}>
                <b>{x.title[lang]}</b>
                <span>{x.summary[lang]}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ───────── Scenarios ───────── */

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [active]);
  return now;
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function Scenarios() {
  const lang = useStore((s) => s.lang);
  const run = useStore((s) => s.run);
  const start = useStore((s) => s.startScenario);
  if (run) return <RunPanel />;
  return (
    <div>
      <h3>{ui('scenarios', lang)}</h3>
      {SCENARIOS.map((sc) => (
        <div key={sc.id} className="card">
          <h2>{sc.title[lang]}</h2>
          <p>{sc.tagline[lang]}</p>
          <div className="meta">
            <span>
              {ui('difficulty', lang)} {'●'.repeat(sc.difficulty)}
              {'○'.repeat(3 - sc.difficulty)}
            </span>
            <span>
              ~{sc.minutes} {ui('minutes', lang)}
            </span>
            <span>
              {sc.steps.length} {ui('step', lang)}
            </span>
          </div>
          <div className="mitre">
            {sc.mitre.map((m) => (
              <code key={m}>{m}</code>
            ))}
          </div>
          <button className="btn primary" onClick={() => start(sc.id)}>
            ▶ {ui('start', lang)}
          </button>
        </div>
      ))}
      <p className="muted small">{ui('disclaimer', lang)}</p>
    </div>
  );
}

function RunPanel() {
  const lang = useStore((s) => s.lang);
  const run = useStore((s) => s.run)!;
  const abort = useStore((s) => s.abortScenario);
  const useHint = useStore((s) => s.useHint);
  const openTerminal = useStore((s) => s.openTerminal);
  const sc = scenarioById(run.id)!;
  const now = useNow(!run.finishedAt);
  const { secs, score } = scoreOf(run, now);
  const step = sc.steps[run.step];
  const shown = step ? run.shownHints[step.id] ?? 0 : 0;

  return (
    <div>
      <div className="run-head">
        <h2>{sc.title[lang]}</h2>
        <div className="hud">
          <span>
            {ui('time', lang)} <b>{mmss(secs)}</b>
          </span>
          <span>
            {ui('score', lang)} <b>{score}</b>
          </span>
          <span>
            {ui('step', lang)} <b>{Math.min(run.step + 1, sc.steps.length)}/{sc.steps.length}</b>
          </span>
        </div>
        <ol className="progress">
          {sc.steps.map((s, i) => (
            <li key={s.id} className={i < run.step ? 'done' : i === run.step ? 'cur' : ''} title={s.title[lang]} />
          ))}
        </ol>
      </div>

      {run.finishedAt ? (
        <div className="victory">
          <h2>🛡 {ui('victory', lang)}</h2>
          <p>
            {ui('score', lang)}: <b>{score}</b> · {ui('time', lang)}: <b>{mmss(secs)}</b> · {lang === 'zh' ? '使用提示' : 'hints'}: <b>{run.hintsUsed}</b>
          </p>
          <h4>{ui('debrief', lang)}</h4>
          <ul className="points">
            {sc.debrief.map((d, i) => (
              <li key={i}>{d[lang]}</li>
            ))}
          </ul>
          <h4>{ui('mitre', lang)}</h4>
          <div className="mitre">
            {sc.mitre.map((m) => (
              <code key={m}>{m}</code>
            ))}
          </div>
          <button className="btn primary" onClick={abort}>
            {ui('again', lang)}
          </button>
        </div>
      ) : (
        step && (
          <div className="step">
            <div className="phase">
              {ui('phase', lang)} · {step.phase[lang]}
            </div>
            <h3>{step.title[lang]}</h3>
            <p>{step.brief[lang]}</p>
            <div className="objective">
              <b>🎯 {ui('objective', lang)}</b> {step.objective[lang]}
            </div>
            <div className="row-btns">
              <button className="btn primary" onClick={() => openTerminal(step.device)}>
                ⌨ {ui('goDevice', lang)}: {step.device}
              </button>
              <button className="btn ghost" disabled={shown >= step.hints.length} onClick={useHint}>
                💡 {ui('hint', lang)}
              </button>
            </div>
            {step.hints.slice(0, shown).map((h, i) => (
              <div key={i} className="hint">
                {h[lang]}
              </div>
            ))}
          </div>
        )
      )}

      <h4>{lang === 'zh' ? '事件日志' : 'Incident log'}</h4>
      <ul className="log">
        {[...run.log].reverse().map((e, i) => (
          <li key={i} className={e.kind}>
            {e.text[lang]}
          </li>
        ))}
      </ul>
      {!run.finishedAt && (
        <button className="btn danger" onClick={abort}>
          {ui('abort', lang)}
        </button>
      )}
    </div>
  );
}
