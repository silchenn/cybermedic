import * as THREE from 'three';
import { DEVICES, LINKS, ZONES, deviceById, findPath, vlanById } from '../data/network';
import type { Device, Flow, ZoneId } from '../types';
import { blockedLinks } from '../sim/reach';
import type { SimState } from '../sim/state';

export const FLOOR_W = 44;
export const FLOOR_D = 28;
export const BUILDING_ZONES: ZoneId[] = ['b1', 'f1', 'f2', 'f3'];

export const zoneY = (z: ZoneId, exploded: boolean) => (z === 'outside' ? 0 : ZONES[z].y * (exploded ? 1.9 : 1));

export function wpos(d: Device, exploded: boolean): THREE.Vector3 {
  return new THREE.Vector3(d.pos[0], zoneY(d.zone, exploded) + 0.7 + (d.lift ?? 0), d.pos[1]);
}

export const KIND_COLOR: Record<Device['kind'], string> = {
  internet: '#e2e8f0',
  attacker: '#ef4444',
  router: '#22d3ee',
  firewall: '#f97316',
  l3switch: '#22d3ee',
  switch: '#67e8f9',
  wlc: '#a5f3fc',
  ap: '#e0f2fe',
  server: '#38bdf8',
  workstation: '#4ade80',
  iot: '#f472b6',
  siem: '#c084fc',
  phone: '#cbd5e1',
  rogue: '#ef4444',
};

export const deviceColor = (d: Device) => (d.vlan && d.kind !== 'ap' && d.kind !== 'wlc' ? vlanById(d.vlan)?.color : undefined) ?? KIND_COLOR[d.kind];

export const PROTO_COLOR: Record<string, string> = {
  HTTPS: '#4ade80',
  DNS: '#facc15',
  DHCP: '#fde68a',
  Kerberos: '#a3e635',
  HL7: '#f472b6',
  DICOM: '#a78bfa',
  RTSP: '#fbbf24',
  MQTT: '#fb923c',
  Syslog: '#c084fc',
  CAPWAP: '#22d3ee',
  Backup: '#38bdf8',
};
export const flowColor = (f: Flow) => (f.hostile ? '#ff3b3b' : Object.entries(PROTO_COLOR).find(([k]) => f.protocol.startsWith(k))?.[1] ?? '#e2e8f0');

/** Visible if not hidden, or revealed by the active scenario. */
export const isVisible = (id: string, s: SimState) => {
  const d = deviceById(id);
  if (d) return !d.hidden || s.revealed.includes(id);
  const l = LINKS.find((x) => x.id === id);
  return !!l && (!l.hidden || s.revealed.includes(id));
};

export function flowPath(f: Flow, s: SimState): string[] | null {
  const blocked = blockedLinks(s);
  // hostile flows are drawn even if the physical path is now cut, up to the cut point
  return findPath(f.from, f.to, new Set(s.revealed), f.hostile ? new Set() : blocked);
}

/** Route a link between floors through the riser shaft so cables look tidy. */
export function linkPoints(a: Device, b: Device, exploded: boolean): THREE.Vector3[] {
  const pa = wpos(a, exploded);
  const pb = wpos(b, exploded);
  if (a.zone === b.zone || a.zone === 'outside' || b.zone === 'outside') return [pa, pb];
  const riserX = -19.5;
  const riserZ = -11;
  return [pa, new THREE.Vector3(riserX, pa.y, riserZ), new THREE.Vector3(riserX, pb.y, riserZ), pb];
}

export function pathPoints(ids: string[], exploded: boolean): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const seg = linkPoints(deviceById(ids[i])!, deviceById(ids[i + 1])!, exploded);
    if (i > 0) seg.shift();
    pts.push(...seg);
  }
  if (ids.length === 1) pts.push(wpos(deviceById(ids[0])!, exploded));
  return pts;
}

export const allDevices = DEVICES;
