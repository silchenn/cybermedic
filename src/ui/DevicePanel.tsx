import { DEVICES, FLOWS, LINKS, ZONES, deviceById, vlanById } from '../data/network';
import { topicById } from '../data/knowledge';
import { tr, ui } from '../i18n/ui';
import { blockedLinks } from '../sim/reach';
import { useStore, type DevTab } from '../store';
import type { Device } from '../types';
import { Terminal } from './Terminal';

const KIND_LABEL: Record<Device['kind'], { zh: string; en: string }> = {
  internet: { zh: '外部网络', en: 'External network' },
  attacker: { zh: '攻击者', en: 'Threat actor' },
  router: { zh: '路由器', en: 'Router' },
  firewall: { zh: '防火墙', en: 'Firewall' },
  l3switch: { zh: '三层交换机', en: 'L3 switch' },
  switch: { zh: '二层接入交换机', en: 'L2 access switch' },
  wlc: { zh: '无线控制器', en: 'Wireless controller' },
  ap: { zh: '无线 AP', en: 'Access point' },
  server: { zh: '服务器', en: 'Server' },
  workstation: { zh: '工作站', en: 'Workstation' },
  iot: { zh: '医疗/楼宇物联网', en: 'Medical / building IoT' },
  siem: { zh: '安全运营平台', en: 'Security platform' },
  phone: { zh: '移动终端', en: 'Mobile client' },
  rogue: { zh: '恶意设备', en: 'Malicious device' },
};

export function DevicePanel() {
  const selected = useStore((s) => s.selected);
  const lang = useStore((s) => s.lang);
  const tab = useStore((s) => s.devTab);
  const setTab = useStore((s) => s.setDevTab);
  const sim = useStore((s) => s.sim);
  const select = useStore((s) => s.select);
  const d = selected ? deviceById(selected) : null;
  if (!d) return null;
  const compromised = sim.compromised.includes(d.id);
  const tabs: DevTab[] = ['info', 'security', 'cli', 'relations', 'location'];
  const v = vlanById(d.vlan);

  return (
    <aside className="panel right">
      <header className="dp-head">
        <div>
          <div className="dp-kind">{tr(KIND_LABEL[d.kind], lang)}</div>
          <h2>
            {d.name[lang]} {compromised && <span className="badge bad">{ui('compromised', lang)}</span>}
          </h2>
          <div className="dp-id">
            <code>{d.id}</code>
            {d.ip && <code>{d.ip}</code>}
            {v && (
              <span className="vlan-chip" style={{ borderColor: v.color, color: v.color }}>
                VLAN {v.id} {v.name}
              </span>
            )}
          </div>
        </div>
        <button className="icon" aria-label={ui('close', lang)} onClick={() => select(null)}>
          ×
        </button>
      </header>
      <nav className="tabs small">
        {tabs.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {ui(t, lang)}
          </button>
        ))}
      </nav>
      <div className="dp-body">
        {tab === 'info' && <Info d={d} />}
        {tab === 'security' && <Security d={d} />}
        {tab === 'cli' && (d.cli === 'none' ? <p className="muted">{ui('noCli', lang)}</p> : <Terminal dev={d} />)}
        {tab === 'relations' && <Relations d={d} blocked={blockedLinks(sim)} />}
        {tab === 'location' && <Location d={d} />}
      </div>
    </aside>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === '') return null;
  return (
    <div className="kv">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Info({ d }: { d: Device }) {
  const lang = useStore((s) => s.lang);
  const setTopic = useStore((s) => s.setTopic);
  const setTab = useStore((s) => s.setTab);
  const setTabD = useStore((s) => s.setDevTab);
  return (
    <div>
      <p className="lead">{d.role[lang]}</p>
      <Row k={ui('model', lang)} v={d.model} />
      <Row k={ui('os', lang)} v={d.os} />
      <Row k={ui('ip', lang)} v={d.ip} />
      <Row k={ui('mac', lang)} v={d.mac} />
      <Row k={ui('vlan', lang)} v={d.vlan ? `${d.vlan} · ${vlanById(d.vlan)?.subnet}` : undefined} />
      <Row k={ui('services', lang)} v={d.services?.join(' · ')} />
      <Row k={ui('room', lang)} v={d.room[lang]} />
      {d.cli !== 'none' && (
        <button className="btn" onClick={() => setTabD('cli')}>
          ⌨ {ui('openCli', lang)}
        </button>
      )}
      {!!d.topics?.length && (
        <>
          <h4>{ui('topics', lang)}</h4>
          <div className="chips">
            {d.topics.map((id) => {
              const t = topicById(id);
              return t ? (
                <button
                  key={id}
                  className="chip"
                  onClick={() => {
                    setTopic(id);
                    setTab('learn');
                  }}
                >
                  {t.title[lang]}
                </button>
              ) : null;
            })}
          </div>
        </>
      )}
    </div>
  );
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function Security({ d }: { d: Device }) {
  const lang = useStore((s) => s.lang);
  const riskColor = d.risk >= 75 ? '#ef4444' : d.risk >= 50 ? '#f97316' : d.risk >= 30 ? '#facc15' : '#4ade80';
  return (
    <div>
      <div className="risk">
        <div className="risk-top">
          <span>{ui('risk', lang)}</span>
          <b style={{ color: riskColor }}>{d.risk}/100</b>
        </div>
        <div className="bar">
          <i style={{ width: `${d.risk}%`, background: riskColor }} />
        </div>
        <small className="muted">{ui('riskNote', lang)}</small>
      </div>
      <h4>{ui('issues', lang)}</h4>
      {d.issues.length === 0 && <p className="muted">{ui('noIssues', lang)}</p>}
      {[...d.issues]
        .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
        .map((i, k) => (
          <div key={k} className={`issue sev-${i.severity}`}>
            <div className="sev">{i.severity.toUpperCase()}</div>
            <div>{i.text[lang]}</div>
            <div className="fix">
              <b>{ui('fix', lang)}：</b>
              {i.fix[lang]}
            </div>
          </div>
        ))}
      {!!d.controls.length && (
        <>
          <h4>{ui('controls', lang)}</h4>
          <ul className="ticks">
            {d.controls.map((c, i) => (
              <li key={i}>{c[lang]}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Relations({ d, blocked }: { d: Device; blocked: Set<string> }) {
  const lang = useStore((s) => s.lang);
  const select = useStore((s) => s.select);
  const sim = useStore((s) => s.sim);
  const focusFlow = useStore((s) => s.focusFlow);
  const setFocusFlow = useStore((s) => s.setFocusFlow);
  const links = LINKS.filter((l) => (l.a === d.id || l.b === d.id) && (!l.hidden || sim.revealed.includes(l.id)));
  const flows = FLOWS.filter((f) => f.from === d.id || f.to === d.id);
  const peers = d.vlan ? DEVICES.filter((x) => x.vlan === d.vlan && x.id !== d.id && (!x.hidden || sim.revealed.includes(x.id))) : [];
  return (
    <div>
      <h4>{ui('physical', lang)}</h4>
      <ul className="rel">
        {links.map((l) => {
          const other = l.a === d.id ? l.b : l.a;
          const myPort = l.a === d.id ? l.aPort : l.bPort;
          const theirPort = l.a === d.id ? l.bPort : l.aPort;
          return (
            <li key={l.id} className={blocked.has(l.id) ? 'down' : ''}>
              <button className="link" onClick={() => select(other, true)}>
                {other}
              </button>
              <span className="muted">
                {myPort ?? '—'} ↔ {theirPort ?? '—'} · {l.kind}
                {l.vlan ? ` · VLAN ${l.vlan}` : ''}
                {blocked.has(l.id) ? ' · DOWN' : ''}
              </span>
            </li>
          );
        })}
      </ul>
      <h4>{ui('logical', lang)}</h4>
      {flows.length === 0 && <p className="muted">—</p>}
      <ul className="rel">
        {flows.map((f) => (
          <li key={f.id} className={focusFlow === f.id ? 'on' : ''}>
            <button className="link" onClick={() => setFocusFlow(focusFlow === f.id ? null : f.id)}>
              {f.from === d.id ? '→' : '←'} {f.from === d.id ? f.to : f.from}
            </button>
            <span className="muted">
              {f.protocol} · {f.port}
            </span>
            <div className="small">{f.label[lang]}</div>
          </li>
        ))}
      </ul>
      {!!peers.length && (
        <>
          <h4>
            {ui('sameVlan', lang)} ({d.vlan})
          </h4>
          <div className="chips">
            {peers.map((p) => (
              <button key={p.id} className="chip" onClick={() => select(p.id, true)}>
                {p.id}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Location({ d }: { d: Device }) {
  const lang = useStore((s) => s.lang);
  const select = useStore((s) => s.select);
  const setFloor = useStore((s) => s.setFloor);
  const z = ZONES[d.zone];
  const others = DEVICES.filter((x) => x.zone === d.zone && !x.hidden);
  // tiny 2D floor plan
  const W = 300;
  const H = 190;
  const sx = (x: number) => ((x + 24) / 48) * W;
  const sz = (y: number) => ((y + 15) / 30) * H;
  return (
    <div>
      <Row k={ui('zone', lang)} v={z.name[lang]} />
      <Row k={ui('room', lang)} v={d.room[lang]} />
      <Row k={ui('coords', lang)} v={`x ${d.pos[0]}, z ${d.pos[1]}${d.lift ? `, +${d.lift}m` : ''}`} />
      <p className="muted small">{z.desc[lang]}</p>
      {d.zone !== 'outside' && (
        <svg viewBox={`0 0 ${W} ${H}`} className="plan">
          <rect x={sx(-22)} y={sz(-14)} width={sx(22) - sx(-22)} height={sz(14) - sz(-14)} className="plan-floor" />
          {others.map((o) => (
            <g key={o.id} onClick={() => select(o.id, true)} style={{ cursor: 'pointer' }}>
              <circle cx={sx(o.pos[0])} cy={sz(o.pos[1])} r={o.id === d.id ? 6 : 3.5} className={o.id === d.id ? 'plan-me' : 'plan-dot'} />
              {o.id === d.id && (
                <text x={sx(o.pos[0]) + 8} y={sz(o.pos[1]) + 4} className="plan-label">
                  {o.id}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      <div className="row-btns">
        <button className="btn" onClick={() => select(d.id, true)}>
          ◎ {ui('focus', lang)}
        </button>
        {d.zone !== 'outside' && (
          <button className="btn ghost" onClick={() => setFloor(d.zone)}>
            ▤ {z.name[lang]}
          </button>
        )}
      </div>
    </div>
  );
}
