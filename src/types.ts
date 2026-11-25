export type Lang = 'zh' | 'en';
/** A bilingual string. Every user-facing text in the data layer uses this. */
export interface L10n {
  zh: string;
  en: string;
}

export type DeviceKind =
  | 'internet'
  | 'attacker'
  | 'router'
  | 'firewall'
  | 'l3switch'
  | 'switch'
  | 'wlc'
  | 'ap'
  | 'server'
  | 'workstation'
  | 'iot'
  | 'siem'
  | 'phone'
  | 'rogue';

/** Which simulated shell a device exposes. */
export type CliFlavor = 'ios' | 'wlc' | 'firewall' | 'linux' | 'winserver' | 'windows' | 'embedded' | 'siem' | 'none';

export type ZoneId = 'outside' | 'b1' | 'f1' | 'f2' | 'f3';

export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  text: L10n;
  fix: L10n;
}

export interface Device {
  id: string;
  kind: DeviceKind;
  name: L10n;
  model: string;
  os: string;
  ip?: string;
  mac?: string;
  vlan?: number;
  zone: ZoneId;
  /** x / z position on the floor plate. y is derived from the zone. */
  pos: [number, number];
  /** Optional vertical offset (e.g. ceiling-mounted APs). */
  lift?: number;
  room: L10n;
  role: L10n;
  cli: CliFlavor;
  services?: string[];
  /** 0 (safe) .. 100 (very exposed) — a teaching heuristic, not a real CVSS. */
  risk: number;
  issues: SecurityIssue[];
  controls: L10n[];
  /** Hidden until a scenario reveals it (attacker, rogue AP...). */
  hidden?: boolean;
  topics?: string[];
}

export type LinkKind = 'trunk' | 'access' | 'wan' | 'wireless' | 'uplink';

export interface Link {
  id: string;
  a: string;
  b: string;
  aPort?: string;
  bPort?: string;
  kind: LinkKind;
  vlan?: number;
  hidden?: boolean;
}

export interface Flow {
  id: string;
  from: string;
  to: string;
  protocol: string;
  port: string;
  label: L10n;
  topic?: string;
  /** Attack flows are drawn red. */
  hostile?: boolean;
}

export interface Vlan {
  id: number;
  name: string;
  subnet: string;
  gateway: string;
  color: string;
  purpose: L10n;
}

export interface Topic {
  id: string;
  category: 'ccna' | 'security' | 'medical' | 'wireless';
  title: L10n;
  summary: L10n;
  points: L10n[];
  hospital: L10n;
  commands?: { device: string; cmd: string }[];
  devices: string[];
  vlans?: number[];
}
