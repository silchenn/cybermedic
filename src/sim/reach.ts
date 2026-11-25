import { DEVICES, LINKS, deviceById, findPath } from '../data/network';
import type { Device } from '../types';
import type { SimState } from './state';

export const deviceByIp = (ip: string): Device | undefined =>
  DEVICES.find((d) => d.ip === ip) ?? (ip === '10.0.0.1' || ip === '198.51.100.10' ? deviceById('FW-EDGE') : undefined);

/** Links disabled because one of their ports is administratively down. */
export function blockedLinks(s: SimState): Set<string> {
  const out = new Set<string>();
  for (const lk of LINKS) {
    if (lk.aPort && s.shutdownPorts[lk.a]?.includes(lk.aPort)) out.add(lk.id);
    if (lk.bPort && s.shutdownPorts[lk.b]?.includes(lk.bPort)) out.add(lk.id);
  }
  // a contained rogue AP cannot keep its clients
  if (s.contained.length) out.add('L-rogue-pda');
  return out;
}

export interface Reach {
  ok: boolean;
  path: string[];
  reason?: { zh: string; en: string };
}

const INTERNAL_OK: Record<number, string[] | 'any'> = {
  10: 'any',
  20: 'any',
  30: ['SRV-PACS', 'SRV-AD', 'SRV-EHR'],
  40: ['SRV-EHR'],
  60: ['SRV-FILE'],
  70: ['INTERNET'],
  99: 'any',
  50: ['SRV-EHR', 'INTERNET'],
};

/** Very small policy model: physical path + segmentation rules + firewall blocks. */
export function reach(srcId: string, dstId: string, s: SimState, port?: number): Reach {
  const revealed = new Set(s.revealed);
  const path = findPath(srcId, dstId, revealed, blockedLinks(s));
  if (!path) return { ok: false, path: [], reason: { zh: '物理/二层路径不可达（端口关闭或链路断开）', en: 'No L1/L2 path (port shut or link down)' } };
  const src = deviceById(srcId)!;
  const dst = deviceById(dstId)!;
  if (dst.id === 'ATTACKER' && s.fwBlocked.includes(dst.ip!)) {
    return { ok: false, path, reason: { zh: '被防火墙出站策略拒绝', en: 'Denied by firewall egress policy' } };
  }
  if (src.vlan && dst.zone !== 'outside') {
    const rule = INTERNAL_OK[src.vlan];
    if (rule && rule !== 'any' && !rule.includes(dst.id) && dst.kind !== 'l3switch') {
      return { ok: false, path, reason: { zh: `VLAN ${src.vlan} 的分段策略不允许访问 ${dst.id}`, en: `Segmentation policy for VLAN ${src.vlan} denies ${dst.id}` } };
    }
  }
  if (src.vlan === 20 && dst.vlan === 10 && port === 445 && smbBlockedFromVlan20(s)) {
    return { ok: false, path, reason: { zh: '核心交换机 Vlan20 入方向 ACL 拒绝 SMB', en: 'Core Vlan20 inbound ACL denies SMB' } };
  }
  return { ok: true, path };
}

export function smbBlockedFromVlan20(s: SimState): boolean {
  const v = vlan20AclIsSafe(s);
  return v === 'ok' || v === 'blocks-all';
}

/** True when the ACL on Vlan20 has a deny for SMB followed by a permit — i.e. it does not break the EHR. */
export function vlan20AclIsSafe(s: SimState): 'none' | 'blocks-all' | 'ineffective' | 'ok' {
  const name = s.aclBindings['Vlan20:in'];
  if (!name) return 'none';
  const rules = s.acls[name] ?? [];
  const idxDeny = rules.findIndex((r) => /^deny tcp .*(eq )?(445|smb)\b/.test(r));
  const idxPermit = rules.findIndex((r) => /^permit ip any any/.test(r));
  if (idxDeny < 0) return idxPermit >= 0 ? 'ineffective' : 'blocks-all';
  if (idxPermit < 0) return 'blocks-all';
  if (idxPermit < idxDeny) return 'ineffective';
  return 'ok';
}
