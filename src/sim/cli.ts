import { DEVICES, LINKS, VLANS, deviceById, vlanById } from '../data/network';
import type { Device, Lang } from '../types';
import { deviceByIp, reach } from './reach';
import type { CliSession, SimState } from './state';

/* ───────────────────────── helpers ───────────────────────── */

type Line = CliSession['lines'][number];
interface Ctx {
  dev: Device;
  s: SimState;
  ses: CliSession;
  lang: Lang;
  out: Line[];
}

const say = (c: Ctx, text: string, kind: Line['kind'] = 'out') => {
  for (const t of text.split('\n')) c.out.push({ kind, text: t });
};
const sys = (c: Ctx, zh: string, en: string) => say(c, c.lang === 'zh' ? zh : en, 'sys');
const err = (c: Ctx, text: string) => say(c, text, 'err');
const flag = (c: Ctx, k: string) => {
  c.s.flags[k] = true;
};

/** Cisco-style abbreviation matcher. Literal words prefix-match; <x> captures a token; <...> captures the rest. */
function m(tokens: string[], pattern: string): string[] | null {
  const pt = pattern.split(' ');
  const caps: string[] = [];
  for (let i = 0; i < pt.length; i++) {
    const p = pt[i];
    if (p === '<...>') {
      if (i >= tokens.length) return null;
      caps.push(tokens.slice(i).join(' '));
      return caps;
    }
    const t = tokens[i];
    if (t === undefined) return null;
    if (p.startsWith('<')) {
      caps.push(t);
      continue;
    }
    if (!p.startsWith(t.toLowerCase())) return null;
  }
  return tokens.length === pt.length ? caps : null;
}

export function normIface(raw: string): string | null {
  const s = raw.replace(/\s+/g, '').toLowerCase();
  let mm = s.match(/^(gi|gigabitethernet|g)(\d+\/\d+\/\d+|\d+\/\d+)$/);
  if (mm) return `Gi${mm[2]}`;
  mm = s.match(/^(te|tengigabitethernet|t)(\d+\/\d+\/\d+)$/);
  if (mm) return `Te${mm[2]}`;
  mm = s.match(/^(vlan|vl|v)(\d+)$/);
  if (mm) return `Vlan${mm[2]}`;
  return null;
}

export const normMac = (raw: string) => raw.toLowerCase().replace(/[^0-9a-f]/g, '');
const ROGUE_MAC = '02deadbeef01';
const dotted = (mac: string) => {
  const h = normMac(mac);
  return `${h.slice(0, 4)}.${h.slice(4, 8)}.${h.slice(8, 12)}`;
};
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length));

/* ───────────────────────── switch data model ───────────────────────── */

interface PortInfo {
  name: string;
  peer?: Device;
  vlan: number | 'trunk' | 'routed';
  connected: boolean;
  shut: boolean;
}

function ports(dev: Device, s: SimState): PortInfo[] {
  const shut = s.shutdownPorts[dev.id] ?? [];
  const map = new Map<string, PortInfo>();
  const count = dev.kind === 'l3switch' ? 24 : 24;
  for (let i = 1; i <= count; i++) map.set(`Gi1/0/${i}`, { name: `Gi1/0/${i}`, vlan: 1, connected: false, shut: false });
  for (let i = 1; i <= (dev.kind === 'l3switch' ? 4 : 2); i++) map.set(`Te1/1/${i}`, { name: `Te1/1/${i}`, vlan: 1, connected: false, shut: false });
  for (const lk of LINKS) {
    let port: string | undefined;
    let peerId: string | undefined;
    if (lk.a === dev.id && lk.aPort) [port, peerId] = [lk.aPort, lk.b];
    else if (lk.b === dev.id && lk.bPort) [port, peerId] = [lk.bPort, lk.a];
    if (!port || !peerId) continue;
    map.set(port, {
      name: port,
      peer: deviceById(peerId),
      vlan: lk.kind === 'trunk' ? 'trunk' : lk.kind === 'uplink' ? 'routed' : lk.vlan ?? 1,
      connected: true,
      shut: false,
    });
  }
  // unused access ports parked in the black-hole VLAN
  for (const p of map.values()) {
    if (!p.connected && p.name.startsWith('Gi')) p.vlan = 999;
    p.shut = shut.includes(p.name) || (!p.connected && p.name.startsWith('Gi') && dev.kind === 'switch');
    if (shut.includes(p.name)) p.shut = true;
  }
  return [...map.values()];
}

const userShut = (dev: Device, s: SimState) => s.shutdownPorts[dev.id] ?? [];

/* ───────────────────────── prompt ───────────────────────── */

export function prompt(dev: Device, ses: CliSession): string {
  const h = dev.id;
  switch (dev.cli) {
    case 'ios':
    case 'wlc':
    case 'firewall': {
      const sfx: Record<CliSession['mode'], string> = {
        user: '>',
        exec: '#',
        config: '(config)#',
        'config-if': '(config-if)#',
        'config-acl': '(config-ext-nacl)#',
        'config-wlan': '(config-wlan)#',
      };
      return h + sfx[ses.mode];
    }
    case 'linux':
      return `root@${h.toLowerCase()}:~#`;
    case 'windows':
      return `C:\\Users\\nurse>`;
    case 'winserver':
      return `PS C:\\Users\\Administrator>`;
    case 'siem':
      return 'soc@siem>';
    case 'embedded':
      return `${h.toLowerCase()}$`;
    default:
      return '>';
  }
}

export function banner(dev: Device, lang: Lang): string[] {
  const zh = lang === 'zh';
  switch (dev.cli) {
    case 'ios':
    case 'wlc':
      return [`*** ${dev.id} — RenXin General Hospital ***`, 'Authorized access only. All activity is logged to SIEM-01.', zh ? '（输入 ? 查看可用命令）' : '(type ? for help)'];
    case 'firewall':
      return [`${dev.id} ${dev.os}`, zh ? '（输入 ? 查看可用命令）' : '(type ? for help)'];
    case 'linux':
      return [`Welcome to ${dev.os} (${dev.id})`, zh ? '（输入 help 查看可用命令）' : '(type help for commands)'];
    case 'windows':
      return [`Microsoft Windows [${dev.os}]`, zh ? '（输入 help 查看可用命令）' : '(type help for commands)'];
    case 'winserver':
      return [`Windows PowerShell — ${dev.id} (${dev.os})`, zh ? '（输入 help 查看可用命令）' : '(type help for commands)'];
    case 'siem':
      return ['RenXin SOC — SIEM query console', zh ? '（输入 help 查看可用命令）' : '(type help for commands)'];
    case 'embedded':
      return [`${dev.model} service shell`, `firmware: ${dev.os}`, zh ? '（输入 help 查看可用命令）' : '(type help for commands)'];
    default:
      return [];
  }
}

/* ───────────────────────── entry point ───────────────────────── */

export function runCommand(dev: Device, input: string, s: SimState, ses: CliSession, lang: Lang): Line[] {
  const c: Ctx = { dev, s, ses, lang, out: [] };
  const raw = input.trim();
  if (!raw) return c.out;
  ses.history.push(raw);
  const tokens = raw.split(/\s+/);
  switch (dev.cli) {
    case 'ios':
    case 'wlc':
      ios(c, tokens, raw);
      break;
    case 'firewall':
      firewall(c, tokens, raw);
      break;
    case 'linux':
      linux(c, tokens, raw);
      break;
    case 'windows':
      windows(c, tokens, raw);
      break;
    case 'winserver':
      winserver(c, tokens, raw);
      break;
    case 'siem':
      siem(c, tokens, raw);
      break;
    case 'embedded':
      embedded(c, tokens, raw);
      break;
    default:
      sys(c, '该设备没有可登录的命令行。', 'This device has no CLI.');
  }
  return c.out;
}

/* ───────────────────────── shared: ping / traceroute ───────────────────────── */

function resolveTarget(arg: string): Device | undefined {
  const byIp = deviceByIp(arg);
  if (byIp) return byIp;
  const name = arg.toLowerCase().replace(/\.renxin\.local$/, '');
  const alias: Record<string, string> = { ehr: 'SRV-EHR', pacs: 'SRV-PACS', dc01: 'SRV-AD', ad: 'SRV-AD', fs01: 'SRV-FILE', backup: 'SRV-BACKUP', siem: 'SIEM-01', portal: 'DMZ-WEB', 'www.renxin-hospital.example': 'DMZ-WEB' };
  return deviceById(alias[name] ?? arg.toUpperCase());
}

function ping(c: Ctx, target: string, style: 'ios' | 'win' | 'linux') {
  const dst = resolveTarget(target);
  if (!dst || !dst.ip) {
    if (style === 'win') say(c, `Ping request could not find host ${target}.`);
    else if (style === 'linux') say(c, `ping: ${target}: Name or service not known`);
    else say(c, `% Unrecognized host or address, or protocol not running.`);
    return;
  }
  const r = reach(c.dev.id, dst.id, c.s);
  if (style === 'ios') {
    say(c, `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${dst.ip}, timeout is 2 seconds:`);
    say(c, r.ok ? '!!!!!' : '.....', r.ok ? 'ok' : 'err');
    say(c, r.ok ? 'Success rate is 100 percent (5/5), round-trip min/avg/max = 1/1/3 ms' : 'Success rate is 0 percent (0/5)');
  } else if (style === 'win') {
    say(c, `\nPinging ${dst.ip} with 32 bytes of data:`);
    for (let i = 0; i < 4; i++) say(c, r.ok ? `Reply from ${dst.ip}: bytes=32 time=${1 + i}ms TTL=${dst.zone === 'outside' ? 52 : 63}` : 'Request timed out.', r.ok ? 'out' : 'err');
    say(c, `\nPing statistics for ${dst.ip}:\n    Packets: Sent = 4, Received = ${r.ok ? 4 : 0}, Lost = ${r.ok ? 0 : 4} (${r.ok ? 0 : 100}% loss)`);
  } else {
    say(c, `PING ${dst.ip} 56(84) bytes of data.`);
    for (let i = 0; i < 3; i++) say(c, r.ok ? `64 bytes from ${dst.ip}: icmp_seq=${i + 1} ttl=63 time=0.${4 + i} ms` : `From ${c.dev.ip} icmp_seq=${i + 1} Destination Host Unreachable`, r.ok ? 'out' : 'err');
    say(c, `--- ${dst.ip} ping statistics ---\n3 packets transmitted, ${r.ok ? 3 : 0} received, ${r.ok ? 0 : 100}% packet loss`);
  }
  if (!r.ok && r.reason) sys(c, `[模拟器] 原因：${r.reason.zh}`, `[sim] reason: ${r.reason.en}`);
}

function hopIp(d: Device, prevVlan?: number): string {
  if (d.kind === 'l3switch' && prevVlan) return vlanById(prevVlan)?.gateway ?? d.ip!;
  return d.ip ?? '*';
}

function trace(c: Ctx, target: string) {
  const dst = resolveTarget(target);
  if (!dst || !dst.ip) return err(c, `Unable to resolve target system name ${target}.`);
  const r = reach(c.dev.id, dst.id, c.s);
  say(c, `Tracing route to ${dst.id.toLowerCase()} [${dst.ip}] over a maximum of 30 hops:`);
  // only L3 hops are shown — switches/APs are transparent at layer 3
  const l3 = r.path.slice(1).map((id) => deviceById(id)!).filter((d) => ['l3switch', 'router', 'firewall', 'server', 'siem', 'workstation', 'iot', 'internet', 'attacker', 'phone'].includes(d.kind) || d.id === dst.id);
  let n = 1;
  for (const d of l3) {
    if (d.kind === 'internet') {
      say(c, `  ${n++}    8 ms    7 ms    8 ms  198.51.100.1`);
      continue;
    }
    if (!r.ok && d.id === dst.id) break;
    say(c, `  ${n++}    <1 ms   <1 ms   <1 ms  ${hopIp(d, c.dev.vlan)}`);
  }
  if (!r.ok) {
    say(c, `  ${n}     *        *        *     Request timed out.`, 'err');
    if (r.reason) sys(c, `[模拟器] 原因：${r.reason.zh}`, `[sim] reason: ${r.reason.en}`);
  } else say(c, '\nTrace complete.');
  sys(c, '[知识点] 二层交换机和 AP 对三层是透明的，不会出现在路由跟踪里。', '[tip] L2 switches and APs are transparent at L3 and never show up in a traceroute.');
}

/* ───────────────────────── Cisco IOS / WLC ───────────────────────── */

const IOS_HELP_EXEC = [
  'show version | show running-config | show vlan brief | show interfaces status',
  'show interfaces trunk | show ip interface brief | show ip route | show mac address-table',
  'show cdp neighbors | show spanning-tree | show access-lists | show port-security | show logging',
  'ping <ip> | traceroute <ip> | configure terminal | exit',
];
const WLC_HELP = [
  'show ap summary | show wlan summary | show wlan id <n> | show wireless client summary',
  'show wireless wps rogue ap summary | show wireless wps rogue ap detail <mac>',
  'show wireless wps rogue client summary | configure terminal',
  '(config) wireless wps rogue ap mac-address <mac> contain',
  '(config) wlan <name>  →  security pmf mandatory | optional | disabled',
];
const IOS_HELP_CONFIG = [
  'interface <name>          e.g. interface gi1/0/12 | interface vlan 20',
  'ip access-list extended <NAME>',
  'vlan <id>  |  do <exec command>  |  end  |  exit',
];
const IOS_HELP_IF = ['shutdown | no shutdown | description <text>', 'switchport access vlan <id> | switchport mode access|trunk', 'ip access-group <NAME> in|out  (SVI only) | exit | end'];
const IOS_HELP_ACL = ['permit|deny <proto> <src> <dst> [eq <port>]   e.g. deny tcp any any eq 445', 'permit ip any any | exit | end'];

function ios(c: Ctx, t: string[], raw: string) {
  const { ses } = c;
  const isWlc = c.dev.cli === 'wlc';
  if (raw === '?' || m(t, 'help')) {
    const h =
      ses.mode === 'config' ? IOS_HELP_CONFIG : ses.mode === 'config-if' ? IOS_HELP_IF : ses.mode === 'config-acl' ? IOS_HELP_ACL : ses.mode === 'config-wlan' ? ['security pmf mandatory|optional|disabled', 'shutdown | no shutdown | exit | end'] : isWlc ? WLC_HELP : IOS_HELP_EXEC;
    h.forEach((x) => say(c, '  ' + x));
    return;
  }
  if (m(t, 'end')) {
    ses.mode = 'exec';
    return;
  }
  if (m(t, 'exit')) {
    if (ses.mode === 'config') ses.mode = 'exec';
    else if (ses.mode === 'exec') sys(c, '（会话保持打开，可以关闭终端面板）', '(session stays open — close the terminal panel)');
    else ses.mode = 'config';
    return;
  }
  if (t[0] === 'do' && ses.mode !== 'exec') return iosExec(c, t.slice(1), true);
  if (ses.mode === 'exec') return iosExec(c, t, false);
  if (ses.mode === 'config') return iosConfig(c, t, raw);
  if (ses.mode === 'config-if') return iosIf(c, t);
  if (ses.mode === 'config-acl') return iosAcl(c, t, raw);
  if (ses.mode === 'config-wlan') return wlanCfg(c, t);
}

function iosExec(c: Ctx, t: string[], viaDo: boolean) {
  const { dev, s } = c;
  let a: string[] | null;
  if (!viaDo && (m(t, 'configure terminal') || m(t, 'conf t'))) {
    c.ses.mode = 'config';
    say(c, 'Enter configuration commands, one per line.  End with CNTL/Z.');
    return;
  }
  if (m(t, 'enable')) return;
  if (m(t, 'show version')) {
    say(c, `${dev.os}\n${dev.id} uptime is 87 days, 4 hours, 12 minutes\nModel: ${dev.model}\nBase MAC: ${dev.mac ?? '-'}`);
    return;
  }
  if (c.dev.cli === 'wlc' && wlcExec(c, t)) return;
  if (m(t, 'show vlan brief') || m(t, 'show vlan')) {
    if (dev.kind === 'router') return err(c, '% Invalid input detected at \'^\' marker.');
    say(c, 'VLAN Name                             Status    Ports\n---- -------------------------------- --------- -------------------------------');
    const ps = ports(dev, s);
    for (const v of [{ id: 1, name: 'default' }, ...VLANS, { id: 999, name: 'BLACKHOLE' }]) {
      const members = ps.filter((p) => p.vlan === v.id).map((p) => p.name);
      say(c, `${pad(String(v.id), 5)}${pad(v.name, 33)}active    ${members.slice(0, 4).join(', ')}${members.length > 4 ? `, +${members.length - 4}` : ''}`);
    }
    return;
  }
  if (m(t, 'show interfaces status') || m(t, 'show int status')) {
    say(c, 'Port       Name                 Status       Vlan    Duplex  Speed Type');
    for (const p of ports(dev, s)) {
      const st = userShut(dev, s).includes(p.name) ? 'disabled' : p.connected ? 'connected' : p.shut ? 'disabled' : 'notconnect';
      say(c, `${pad(p.name, 11)}${pad(p.peer?.id ?? '', 21)}${pad(st, 13)}${pad(String(p.vlan), 8)}a-full  a-1000 10/100/1000BaseTX`, st === 'disabled' && p.connected ? 'err' : 'out');
    }
    return;
  }
  if (m(t, 'show interfaces trunk') || m(t, 'show int trunk')) {
    say(c, 'Port        Mode         Encapsulation  Status        Native vlan');
    const tr = ports(dev, s).filter((p) => p.vlan === 'trunk');
    tr.forEach((p) => say(c, `${pad(p.name, 12)}on           802.1q         trunking      998`));
    say(c, '\nPort        Vlans allowed on trunk');
    tr.forEach((p) => say(c, `${pad(p.name, 12)}${p.peer?.kind === 'wlc' ? '20,40,70,99' : '10,20,30,40,60,70,99'}`));
    sys(c, '[知识点] Native VLAN 设为未使用的 998，防止 VLAN Hopping。', '[tip] Native VLAN is the unused 998 to prevent VLAN hopping.');
    return;
  }
  if (m(t, 'show ip interface brief') || m(t, 'show ip int brief') || m(t, 'show ip int br')) {
    say(c, 'Interface              IP-Address      OK? Method Status                Protocol');
    if (dev.kind === 'l3switch') {
      for (const v of VLANS.filter((v) => v.id !== 50)) say(c, `${pad('Vlan' + v.id, 23)}${pad(v.gateway, 16)}YES NVRAM  up                    up`);
      say(c, `${pad('Gi1/0/1', 23)}${pad('10.0.0.2', 16)}YES NVRAM  up                    up`);
    } else if (dev.kind === 'router') {
      say(c, `${pad('Gi0/0/0', 23)}${pad('198.51.100.2', 16)}YES NVRAM  up                    up`);
      say(c, `${pad('Gi0/0/1', 23)}${pad('198.51.100.9', 16)}YES NVRAM  up                    up`);
    } else say(c, `${pad('Vlan99', 23)}${pad(dev.ip ?? 'unassigned', 16)}YES NVRAM  up                    up`);
    for (const p of ports(dev, s).filter((p) => p.connected)) {
      const down = userShut(dev, s).includes(p.name);
      say(c, `${pad(p.name, 23)}${pad('unassigned', 16)}YES unset  ${pad(down ? 'administratively down' : 'up', 22)}${down ? 'down' : 'up'}`, down ? 'err' : 'out');
    }
    return;
  }
  if (m(t, 'show ip route')) {
    say(c, 'Codes: C - connected, S - static, O - OSPF, * - candidate default\n');
    if (dev.kind === 'l3switch') {
      say(c, 'Gateway of last resort is 10.0.0.1 to network 0.0.0.0\n\nS*    0.0.0.0/0 [1/0] via 10.0.0.1');
      say(c, 'C     10.0.0.0/30 is directly connected, GigabitEthernet1/0/1');
      for (const v of VLANS.filter((v) => v.id !== 50)) say(c, `C     ${v.subnet} is directly connected, Vlan${v.id}`);
    } else if (dev.kind === 'router') {
      say(c, 'Gateway of last resort is 198.51.100.1 to network 0.0.0.0\n\nS*    0.0.0.0/0 [1/0] via 198.51.100.1');
      say(c, 'C     198.51.100.0/30 is directly connected, GigabitEthernet0/0/0\nC     198.51.100.8/29 is directly connected, GigabitEthernet0/0/1\nS     198.51.100.10/32 [1/0] via 198.51.100.10');
    } else say(c, `Default gateway is 10.99.99.1`);
    return;
  }
  if (m(t, 'show mac address-table') || m(t, 'show mac addr')) {
    say(c, '          Mac Address Table\n-------------------------------------------\nVlan    Mac Address       Type        Ports\n----    -----------       --------    -----');
    for (const p of ports(dev, s).filter((p) => p.connected && p.peer?.mac && !userShut(dev, s).includes(p.name))) {
      say(c, `${pad(String(p.vlan === 'trunk' ? 99 : p.vlan), 8)}${pad(dotted(p.peer!.mac!), 18)}${pad('DYNAMIC', 12)}${p.name}`);
    }
    return;
  }
  if (m(t, 'show cdp neighbors') || m(t, 'show cdp nei')) {
    say(c, 'Device ID        Local Intrfce     Holdtme    Capability  Platform       Port ID');
    for (const p of ports(dev, s).filter((p) => p.connected && p.peer && ['switch', 'l3switch', 'ap', 'wlc', 'router'].includes(p.peer.kind))) {
      say(c, `${pad(p.peer!.id, 17)}${pad(p.name, 18)}${pad('152', 11)}${pad(p.peer!.kind === 'ap' ? 'T B I' : 'R S I', 12)}${pad(p.peer!.model.split(' ')[0], 15)}${p.vlan === 'trunk' ? 'Te1/1/1' : 'Gi0'}`);
    }
    return;
  }
  if (m(t, 'show spanning-tree') || m(t, 'show span')) {
    const core = deviceById('CORE-SW1')!;
    say(c, `VLAN0020\n  Spanning tree enabled protocol rstp\n  Root ID    Priority    4116\n             Address     ${dotted(core.mac!)}`);
    say(c, dev.id === core.id ? '             This bridge is the root' : `             Cost        2\n             Port        Te1/1/1`);
    say(c, '\nInterface           Role Sts Cost      Prio.Nbr Type');
    for (const p of ports(dev, s).filter((p) => p.connected && (p.vlan === 20 || p.vlan === 'trunk'))) {
      say(c, `${pad(p.name, 20)}${dev.id === core.id || p.vlan !== 'trunk' ? 'Desg FWD' : 'Root FWD'} 4         128.1    P2p${p.vlan === 20 ? ' Edge' : ''}`);
    }
    sys(c, '[知识点] 核心交换机优先级 4096 是根桥；接终端的口是 Edge (PortFast)。', '[tip] Core priority 4096 makes it root; host ports are Edge (PortFast).');
    return;
  }
  if (m(t, 'show access-lists') || m(t, 'show ip access-lists') || m(t, 'show access-list')) {
    if (dev.id !== 'CORE-SW1') return say(c, '');
    for (const [name, rules] of Object.entries(s.acls)) {
      say(c, `Extended IP access list ${name}`);
      rules.forEach((r, i) => say(c, `    ${(i + 1) * 10} ${r}`));
    }
    const b = Object.entries(s.aclBindings);
    if (b.length) b.forEach(([k, v]) => sys(c, `[绑定] ${v} → interface ${k.replace(':', ' ')}`, `[bound] ${v} → interface ${k.replace(':', ' ')}`));
    return;
  }
  if (m(t, 'show port-security')) {
    say(c, 'Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action\n                (Count)       (Count)          (Count)');
    for (const p of ports(dev, s).filter((p) => p.connected && typeof p.vlan === 'number' && p.vlan !== 99)) say(c, `${pad(p.name, 13)}${pad('1', 15)}${pad('1', 13)}${pad('0', 19)}Restrict`);
    return;
  }
  if (m(t, 'show logging') || m(t, 'show log')) {
    say(c, 'Syslog logging: enabled\n    Logging to 10.10.10.60 (udp port 514)\nLog Buffer:');
    say(c, `Nov 24 22:58:01: %SYS-5-CONFIG_I: Configured from console by netadmin on vty0 (10.99.99.200)`);
    for (const p of userShut(dev, s)) say(c, `Nov 25 03:2x:xx: %LINK-5-CHANGED: Interface ${p}, changed state to administratively down`, 'err');
    if (s.flags['ransom_active'] && dev.id === 'CORE-SW1') say(c, 'Nov 25 03:14:22: %SW_DAI-4-DHCP_SNOOPING_DENY: 0 Invalid ARPs\nNov 25 03:16:40: %ACL-6-LOG: Vlan20 tcp 10.20.20.53 -> 10.10.10.40:445, 1832 packets');
    return;
  }
  if (m(t, 'show running-config') || m(t, 'show run')) return runningConfig(c);
  if ((a = m(t, 'ping <ip>'))) return ping(c, a[0], 'ios');
  if ((a = m(t, 'traceroute <ip>')) || (a = m(t, 'tracert <ip>'))) return trace(c, a[0]);
  err(c, `% Invalid input detected at '^' marker.`);
  sys(c, '输入 ? 查看此模式下可用的命令。', 'Type ? to list commands for this mode.');
}

function runningConfig(c: Ctx) {
  const { dev, s } = c;
  const L: string[] = ['Building configuration...', '', '!', `hostname ${dev.id}`, '!', 'service password-encryption', 'aaa new-model', 'ip domain name renxin.local', 'ip ssh version 2', '!'];
  if (dev.kind !== 'router' && dev.kind !== 'wlc') {
    L.push('spanning-tree mode rapid-pvst', dev.kind === 'l3switch' ? 'spanning-tree vlan 1-999 priority 4096' : 'spanning-tree portfast bpduguard default', 'ip dhcp snooping', 'ip dhcp snooping vlan 20,30,40,60', 'ip arp inspection vlan 20,30,40', '!');
    for (const v of VLANS) L.push(`vlan ${v.id}`, ` name ${v.name}`);
    L.push('vlan 999', ' name BLACKHOLE', '!');
    for (const p of ports(dev, s).filter((p) => p.connected || userShut(dev, s).includes(p.name))) {
      L.push(`interface ${p.name}`);
      if (p.peer) L.push(` description ${p.peer.id}`);
      if (p.vlan === 'trunk') L.push(' switchport mode trunk', ' switchport trunk native vlan 998', ' ip dhcp snooping trust');
      else if (p.vlan === 'routed') L.push(' no switchport', ' ip address 10.0.0.2 255.255.255.252');
      else L.push(' switchport mode access', ` switchport access vlan ${p.vlan}`, ' switchport port-security', ' spanning-tree portfast');
      if (userShut(dev, s).includes(p.name)) L.push(' shutdown');
      L.push('!');
    }
    L.push('interface range Gi1/0/16 - 19 , Gi1/0/22 - 24', ' switchport access vlan 999', ' shutdown', '!');
  }
  if (dev.kind === 'l3switch') {
    for (const v of VLANS.filter((v) => v.id !== 50)) {
      L.push(`interface Vlan${v.id}`, ` ip address ${v.gateway} 255.255.255.0`);
      if (v.id !== 10 && v.id !== 99) L.push(' ip helper-address 10.10.10.10');
      for (const dir of ['in', 'out']) if (s.aclBindings[`Vlan${v.id}:${dir}`]) L.push(` ip access-group ${s.aclBindings[`Vlan${v.id}:${dir}`]} ${dir}`);
      L.push('!');
    }
    L.push('ip routing', 'ip route 0.0.0.0 0.0.0.0 10.0.0.1', '!');
    for (const [n, rules] of Object.entries(s.acls)) L.push(`ip access-list extended ${n}`, ...rules.map((r) => ' ' + r), '!');
  }
  if (dev.kind === 'router') L.push('interface GigabitEthernet0/0/0', ' description ISP-CIRCUIT', ' ip address 198.51.100.2 255.255.255.252', ' ip verify unicast source reachable-via rx', '!', 'ip route 0.0.0.0 0.0.0.0 198.51.100.1', '!', 'snmp-server community public RO', '!');
  if (dev.kind === 'wlc') {
    L.push('wlan HIS-Staff 1 HIS-Staff', ' security wpa akm dot1x', ` security pmf ${s.pmf['HIS-Staff']}`, ' no shutdown', 'wlan Med-IoT 2 Med-IoT', ' security wpa akm psk', ' mac-filtering MAB', ' no shutdown', 'wlan Guest 3 Guest', ' no security wpa', ' security web-auth', ' peer-blocking drop', ' no shutdown', '!');
    for (const mac of s.contained) L.push(`wireless wps rogue ap mac-address ${dotted(mac)} contain`);
  }
  L.push('logging host 10.10.10.60', 'ntp server 10.10.10.10', 'snmp-server group NETOPS v3 priv', '!', 'line vty 0 15', ' transport input ssh', ' access-class MGMT-ONLY in', '!', 'end');
  L.forEach((x) => say(c, x));
}

function iosConfig(c: Ctx, t: string[], raw: string) {
  const { dev, s, ses } = c;
  let a: string[] | null;
  if ((a = m(t, 'interface <...>')) || (a = m(t, 'int <...>'))) {
    const name = normIface(a[0]);
    if (!name) return err(c, '% Invalid interface type and number');
    if (name.startsWith('Vlan') && dev.kind !== 'l3switch' && dev.kind !== 'switch') return err(c, '% Invalid interface');
    if (!name.startsWith('Vlan') && !ports(dev, s).some((p) => p.name === name)) return err(c, `% Interface ${name} does not exist on ${dev.id}`);
    ses.mode = 'config-if';
    ses.iface = name;
    return;
  }
  if ((a = m(t, 'ip access-list extended <name>'))) {
    if (dev.kind !== 'l3switch') return sys(c, '本模拟器只在 CORE-SW1 上建模 ACL（VLAN 间路由点）。', 'ACLs are modelled on CORE-SW1 only (the inter-VLAN routing point).');
    ses.mode = 'config-acl';
    ses.acl = a[0].toUpperCase();
    s.acls[ses.acl] ??= [];
    return;
  }
  if (c.dev.cli === 'wlc') {
    if ((a = m(t, 'wireless wps rogue ap mac-address <mac> contain')) || (a = m(t, 'wireless wps rogue ap mac-address <mac> mode contain'))) {
      const mac = normMac(a[0]);
      if (mac.length !== 12) return err(c, '% Invalid MAC address');
      if (!s.flags['rogue_active'] || mac !== ROGUE_MAC) {
        say(c, `% Rogue AP ${dotted(mac)} not found in rogue table`, 'err');
        return;
      }
      if (!s.contained.includes(mac)) s.contained.push(mac);
      say(c, `Rogue AP ${dotted(mac)} containment level 2 initiated (AP-1F-LOBBY, AP-3F-LAB)`, 'ok');
      sys(c, '[知识点] 遏制 = 由合法 AP 向伪造热点及其客户端发送 Deauth。部分国家/地区对此有法规限制，只能在自己场地内使用。', '[tip] Containment = legitimate APs send deauths to the rogue and its clients. Regulations may restrict this — use only on your own premises.');
      return;
    }
    if ((a = m(t, 'wlan <name>')) || (a = m(t, 'wlan <name> <id> <ssid>'))) {
      const name = Object.keys(s.pmf).find((k) => k.toLowerCase() === a![0].toLowerCase());
      if (!name) return err(c, `% WLAN ${a[0]} not found. Existing: ${Object.keys(s.pmf).join(', ')}`);
      ses.mode = 'config-wlan';
      ses.wlan = name;
      return;
    }
  }
  if ((a = m(t, 'vlan <id>'))) return sys(c, `VLAN ${a[0]} 已存在或已创建（模拟器中 VLAN 表为只读）。`, `VLAN ${a[0]} accepted (the VLAN table is read-only in this simulator).`);
  if (m(t, 'hostname <x>')) return sys(c, '模拟器中设备名固定。', 'Hostnames are fixed in the simulator.');
  err(c, `% Invalid input detected at '^' marker.`);
  sys(c, `输入 ? 查看配置模式命令。（你输入的是：${raw}）`, `Type ? for config-mode commands. (you typed: ${raw})`);
}

function iosIf(c: Ctx, t: string[]) {
  const { dev, s, ses } = c;
  const name = ses.iface!;
  let a: string[] | null;
  if (m(t, 'shutdown') || m(t, 'shut')) {
    const list = (s.shutdownPorts[dev.id] ??= []);
    if (!list.includes(name)) list.push(name);
    say(c, `%LINK-5-CHANGED: Interface ${name}, changed state to administratively down`, 'ok');
    const peer = ports(dev, s).find((p) => p.name === name)?.peer;
    if (peer) sys(c, `[模拟器] ${peer.id} 已从网络断开（设备保持开机，内存证据得以保留）。`, `[sim] ${peer.id} is now cut off (still powered on — memory evidence preserved).`);
    return;
  }
  if (m(t, 'no shutdown') || m(t, 'no shut')) {
    s.shutdownPorts[dev.id] = (s.shutdownPorts[dev.id] ?? []).filter((p) => p !== name);
    say(c, `%LINK-3-UPDOWN: Interface ${name}, changed state to up`, 'ok');
    return;
  }
  if ((a = m(t, 'ip access-group <name> <dir>'))) {
    if (!name.startsWith('Vlan') || dev.kind !== 'l3switch') return err(c, '% ACLs can only be applied on SVIs in this simulator');
    const acl = a[0].toUpperCase();
    const dir = a[1].toLowerCase();
    if (dir !== 'in' && dir !== 'out') return err(c, '% Direction must be in or out');
    if (!s.acls[acl]) sys(c, `警告：ACL ${acl} 尚不存在，空 ACL 在 IOS 中等同于 permit any。`, `Warning: ACL ${acl} does not exist yet; an empty ACL acts as permit any in IOS.`);
    s.aclBindings[`${name}:${dir}`] = acl;
    say(c, `ACL ${acl} applied to ${name} ${dir}`, 'ok');
    return;
  }
  if (m(t, 'no ip access-group <name> <dir>')) {
    delete s.aclBindings[`${name}:${t[4]?.toLowerCase()}`];
    return;
  }
  if (m(t, 'description <...>') || m(t, 'switchport <...>') || m(t, 'spanning-tree <...>') || m(t, 'no <...>')) {
    sys(c, '已接受（该配置在模拟器中仅作展示）。', 'Accepted (display-only in this simulator).');
    return;
  }
  if (m(t, 'interface <...>') || m(t, 'int <...>')) {
    ses.mode = 'config';
    return iosConfig(c, t, t.join(' '));
  }
  err(c, `% Invalid input detected at '^' marker.`);
}

function iosAcl(c: Ctx, t: string[], raw: string) {
  const { s, ses } = c;
  const line = raw.trim().toLowerCase().replace(/^\d+\s+/, '');
  if (/^(permit|deny)\s+(ip|tcp|udp|icmp)\s+\S+/.test(line)) {
    s.acls[ses.acl!].push(line.replace(/\s+/g, ' '));
    if (/^deny tcp .* eq smb$/.test(line)) sys(c, '提示：IOS 中 445 端口没有关键字名，建议写 eq 445。', 'Note: IOS has no keyword for 445; prefer eq 445.');
    return;
  }
  if (m(t, 'no <...>')) {
    const target = line.slice(3);
    s.acls[ses.acl!] = s.acls[ses.acl!].filter((r, i) => r !== target && String((i + 1) * 10) !== target);
    return;
  }
  if (m(t, 'interface <...>') || m(t, 'int <...>')) {
    ses.mode = 'config';
    return iosConfig(c, t, raw);
  }
  err(c, `% Invalid input detected at '^' marker.`);
  sys(c, '格式：deny tcp any any eq 445 / permit ip any any', 'Format: deny tcp any any eq 445 / permit ip any any');
}

/* ───────────────────────── WLC ───────────────────────── */

function wlcExec(c: Ctx, t: string[]): boolean {
  const { s } = c;
  let a: string[] | null;
  if (m(t, 'show ap summary')) {
    say(c, 'AP Name          Model        Ethernet MAC    Radio MAC       IP Address     State     Mode');
    for (const ap of DEVICES.filter((d) => d.kind === 'ap')) say(c, `${pad(ap.id, 17)}${pad('C9120AXI', 13)}${pad(dotted(ap.mac!), 16)}${pad(dotted(ap.mac!.replace(/00$/, 'a0')), 16)}${pad(ap.ip!, 15)}Registered ${ap.id === 'AP-3F-LAB' ? 'Monitor' : 'Local'}`);
    return true;
  }
  if (m(t, 'show wlan summary')) {
    say(c, 'ID   Profile Name      SSID          Status  Security');
    say(c, `1    HIS-Staff         HIS-Staff     UP      [WPA2][802.1x][AES] PMF:${s.pmf['HIS-Staff']}`);
    say(c, '2    Med-IoT           Med-IoT       UP      [WPA2][PSK][AES] + MAB');
    say(c, '3    Guest             RenXin-Guest  UP      [Web Auth] peer-blocking');
    return true;
  }
  if ((a = m(t, 'show wlan id <n>'))) {
    const name = ['HIS-Staff', 'Med-IoT', 'Guest'][Number(a[0]) - 1];
    if (!name) return say(c, '% WLAN not found', 'err'), true;
    say(c, `WLAN Profile Name : ${name}\nStatus            : Enabled\nInterface (VLAN)  : ${name === 'HIS-Staff' ? 20 : name === 'Med-IoT' ? 40 : 70}\nProtected Management Frame (802.11w): ${s.pmf[name]}\nAAA override      : ${name === 'HIS-Staff' ? 'Enabled (RADIUS 10.10.10.10)' : 'Disabled'}`);
    return true;
  }
  if (m(t, 'show wireless client summary')) {
    say(c, 'MAC Address    AP Name          WLAN  State    Protocol  Method   VLAN');
    for (const lk of LINKS.filter((l) => l.kind === 'wireless' && !l.hidden)) {
      const cl = deviceById(lk.b)!;
      if (lk.id === 'L-2f-pda' && s.flags['rogue_active'] && !s.contained.length) continue;
      say(c, `${pad(dotted(cl.mac!), 15)}${pad(lk.a, 17)}${pad(String(lk.vlan === 20 ? 1 : lk.vlan === 40 ? 2 : 3), 6)}Run      11ax(5)   ${pad(lk.vlan === 20 ? 'Dot1x' : lk.vlan === 40 ? 'MAB' : 'WebAuth', 9)}${lk.vlan}`);
    }
    if (s.flags['rogue_active'] && !s.contained.length) sys(c, '[注意] 李护士的 PDA (6c2f.8a00.2088) 不在合法 AP 上 —— 它去哪了？', '[!] Nurse Li\'s PDA (6c2f.8a00.2088) is missing from legitimate APs — where did it go?');
    return true;
  }
  if (m(t, 'show wireless wps rogue ap summary')) {
    flag(c, 'rogue_summary');
    say(c, 'Number of rogue APs detected: ' + (s.flags['rogue_active'] ? 3 : 2) + '\n');
    say(c, 'MAC Address     Classification  State       #APs  #Clients  SSID              Highest RSSI');
    if (s.flags['rogue_active']) say(c, `${pad(dotted(ROGUE_MAC), 16)}${pad('Malicious', 16)}${pad(s.contained.includes(ROGUE_MAC) ? 'Contained' : 'Alert', 12)}2     ${s.contained.includes(ROGUE_MAC) ? 0 : 1}         ${pad('HIS-Staff', 18)}-38`, 'err');
    say(c, `${pad('a8b1.dd03.11f0', 16)}${pad('Unclassified', 16)}${pad('Alert', 12)}1     4         ${pad('Cafe_Lucky_5G', 18)}-79`);
    say(c, `${pad('f0d2.f1aa.0042', 16)}${pad('Friendly', 16)}${pad('Alert', 12)}1     0         ${pad('PHARMA-VENDOR', 18)}-83`);
    if (s.flags['rogue_active']) sys(c, '[分析] 有一个陌生 BSSID 在广播我们自己的 SSID "HIS-Staff"，信号还非常强（-38 dBm）。', '[analysis] An unknown BSSID is broadcasting OUR SSID "HIS-Staff" with a very strong signal (-38 dBm).');
    return true;
  }
  if ((a = m(t, 'show wireless wps rogue ap detail <mac>')) || (a = m(t, 'show wireless wps rogue ap detailed <mac>'))) {
    const mac = normMac(a[0]);
    if (mac !== ROGUE_MAC || !s.flags['rogue_active']) {
      say(c, `Rogue ${a[0]}: detected by 1 AP, RSSI -79..-83 dBm, no clients on our network.`);
      return true;
    }
    flag(c, 'rogue_detail');
    say(c, `Rogue BSSID           : ${dotted(mac)}\nSSID                  : HIS-Staff\nChannel               : 36 (5 GHz)\nEncryption            : WPA2-Enterprise (fake RADIUS)\nFirst seen            : 2026-11-25 09:41:07\nClassification        : Malicious (rule: SSID-IMPERSONATION)\n\nDetecting AP           Radio  RSSI   SNR   Channel\n-------------------    -----  -----  ----  -------\nAP-1F-LOBBY            5G     -38    52    36\nAP-3F-LAB (monitor)    5G     -71    19    36`);
    sys(c, '[分析] 1F 大厅 AP 收到的信号最强 → 伪造热点就在 1F 候诊区附近。可以通知保卫科现场排查。', '[analysis] Strongest at the 1F lobby AP → the rogue is near the 1F waiting area. Send security to search physically.');
    return true;
  }
  if (m(t, 'show wireless wps rogue client summary')) {
    flag(c, 'rogue_clients');
    say(c, 'MAC Address     Rogue BSSID     State        Last seen  User (from our RADIUS logs)');
    if (s.flags['rogue_active']) say(c, `${pad('6c2f.8a00.2088', 16)}${pad(dotted(ROGUE_MAC), 16)}${pad(s.contained.length ? 'Contained' : 'Associated', 13)}0 s        nurse.li (MOB-NURSE-LI)`, 'err');
    else say(c, '(none)');
    if (s.flags['rogue_active']) sys(c, '[分析] 李护士的 PDA 在伪造热点上做过 PEAP 认证 —— 必须假设她的域账号已泄露。', '[analysis] Nurse Li\'s PDA performed PEAP against the rogue — assume her domain credentials are compromised.');
    return true;
  }
  return false;
}

function wlanCfg(c: Ctx, t: string[]) {
  const { s, ses } = c;
  let a: string[] | null;
  if ((a = m(t, 'security pmf <mode>'))) {
    const mode = a[0].toLowerCase();
    if (!['mandatory', 'optional', 'disabled'].includes(mode)) return err(c, '% PMF mode: mandatory | optional | disabled');
    s.pmf[ses.wlan!] = mode as 'mandatory';
    say(c, `WLAN ${ses.wlan}: 802.11w PMF set to ${mode}`, 'ok');
    if (mode === 'mandatory') sys(c, '[知识点] 强制 PMF 后伪造的 Deauth/Disassoc 帧会被客户端丢弃。注意老旧医疗设备可能不支持 PMF，需先验证兼容性。', '[tip] With PMF mandatory, forged deauth/disassoc frames are dropped. Old medical devices may not support PMF — test compatibility first.');
    return;
  }
  if (m(t, 'shutdown') || m(t, 'no shutdown') || m(t, 'security <...>')) return sys(c, '已接受（仅展示）。', 'Accepted (display-only).');
  err(c, `% Invalid input detected at '^' marker.`);
}

/* ───────────────────────── Firewall ───────────────────────── */

function firewall(c: Ctx, t: string[], raw: string) {
  const { s, ses } = c;
  let a: string[] | null;
  if (raw === '?' || m(t, 'help')) {
    ['show version | show interface | show access-list | show nat | show conn | show log', 'configure terminal', '(config) access-list OUTSIDE_OUT extended deny ip any host <ip>', '(config) no access-list OUTSIDE_OUT extended deny ip any host <ip>', 'ping <ip> | exit | end'].forEach((x) => say(c, '  ' + x));
    return;
  }
  if (m(t, 'end') || (m(t, 'exit') && ses.mode !== 'exec')) {
    ses.mode = 'exec';
    return;
  }
  if (m(t, 'configure terminal') || m(t, 'conf t')) {
    ses.mode = 'config';
    return;
  }
  const isDeny = (a = m(t, 'access-list <name> extended deny ip any host <ip>')) || (a = m(t, 'access-list <name> deny ip any host <ip>'));
  if (isDeny) {
    if (ses.mode !== 'config') return err(c, "ERROR: Command requires configuration mode. Use 'configure terminal'.");
    const ip = a![a!.length - 1];
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return err(c, 'ERROR: invalid IP address');
    if (a![0].toUpperCase() !== 'OUTSIDE_OUT') sys(c, `注意：出站策略组名为 OUTSIDE_OUT（你写的是 ${a![0]}），已按 OUTSIDE_OUT 处理。`, `Note: the egress policy is named OUTSIDE_OUT (you wrote ${a![0]}); applied to OUTSIDE_OUT.`);
    if (!s.fwBlocked.includes(ip)) s.fwBlocked.push(ip);
    say(c, `access-list OUTSIDE_OUT line 1 extended deny ip any host ${ip} (hitcnt=0) inserted`, 'ok');
    return;
  }
  if ((a = m(t, 'no access-list <name> extended deny ip any host <ip>'))) {
    s.fwBlocked = s.fwBlocked.filter((x) => x !== a![1]);
    return say(c, 'removed', 'ok');
  }
  if (m(t, 'show version')) return say(c, `${c.dev.os}\nModel: ${c.dev.model}\nInterfaces: outside 198.51.100.10/29, inside 10.0.0.1/30, dmz 172.16.50.1/24`);
  if (m(t, 'show interface') || m(t, 'show int')) return say(c, 'Interface  Name     Security  IP\nGi1/1      outside  0         198.51.100.10\nGi1/2      inside   100       10.0.0.1\nGi1/3      dmz      50        172.16.50.1');
  if (m(t, 'show access-list') || m(t, 'show access-lists')) {
    say(c, 'access-list OUTSIDE_IN; 2 elements\n  line 1 extended permit tcp any host 172.16.50.10 eq https (hitcnt=48211)\n  line 2 extended deny ip any any log (hitcnt=90231)');
    say(c, `access-list DMZ_IN; 2 elements\n  line 1 extended permit tcp host 172.16.50.10 host 10.10.10.20 eq 8443 (hitcnt=5120)\n  line 2 extended deny ip any any log`);
    say(c, `access-list OUTSIDE_OUT; ${s.fwBlocked.length + 1} elements`);
    s.fwBlocked.forEach((ip, i) => say(c, `  line ${i + 1} extended deny ip any host ${ip} (hitcnt=${s.flags['ransom_active'] ? 37 : 0})`, 'ok'));
    say(c, `  line ${s.fwBlocked.length + 1} extended permit ip any any (hitcnt=1882044)`, s.fwBlocked.length ? 'out' : 'err');
    if (!s.fwBlocked.length) sys(c, '[风险] 出站全放行（permit any any）。', '[risk] Egress is permit any any.');
    return;
  }
  if (m(t, 'show nat')) return say(c, 'Auto NAT Policies (Section 2)\n1 (inside) to (outside) source dynamic INSIDE-NETS interface   translate_hits = 1882044\n2 (dmz) to (outside) source static PORTAL 198.51.100.11   translate_hits = 48211\n3 (guest) to (outside) source dynamic GUEST-NET interface   translate_hits = 220391');
  if (m(t, 'show conn')) {
    say(c, '3127 in use, 9921 most used');
    say(c, 'TCP outside 203.0.113.80:51022 dmz 172.16.50.10:443, idle 0:00:01, flags UIO');
    say(c, 'TCP outside 142.250.4.1:443 guest 192.168.70.101:50112, idle 0:00:04, flags UIO');
    if (s.flags['ransom_active'] && !s.fwBlocked.includes('203.0.113.66')) say(c, 'TCP outside 203.0.113.66:443 inside 10.20.20.53:49733, idle 0:00:00, bytes 48213077, flags UIO', 'err');
    say(c, 'TCP outside 198.51.100.200:8883 inside 10.60.60.30:40122, idle 0:01:10, flags UIO');
    return;
  }
  if (m(t, 'show log') || m(t, 'show logging')) {
    say(c, '%FW-6-302013: Built inbound TCP connection for outside:203.0.113.80/51022 to dmz:172.16.50.10/443');
    if (s.flags['ransom_active']) {
      say(c, '%FW-6-302013: Built outbound TCP connection for outside:203.0.113.66/443 to inside:10.20.20.53/49733', 'err');
      say(c, '%FW-4-THREAT: Threat-intel match: 203.0.113.66 category=C2 confidence=high (action=alert only)', 'err');
    }
    for (const ip of s.fwBlocked) say(c, `%FW-4-106023: Deny tcp src inside:10.20.20.53/49790 dst outside:${ip}/443 by access-group "OUTSIDE_OUT"`, 'ok');
    return;
  }
  if ((a = m(t, 'ping <ip>'))) return ping(c, a[0], 'ios');
  err(c, 'ERROR: % Invalid input detected');
  sys(c, '输入 ? 查看可用命令。', 'Type ? for commands.');
}

/* ───────────────────────── Linux ───────────────────────── */

const SNAPSHOTS = [
  { id: 'snap-20261123-2300', time: '2026-11-23 23:00', status: 'OK (immutable)' },
  { id: 'snap-20261124-2300', time: '2026-11-24 23:00', status: 'OK (immutable)' },
  { id: 'snap-20261125-0300', time: '2026-11-25 03:00', status: 'SUSPECT: 41% files changed, high entropy' },
];

function linux(c: Ctx, t: string[], raw: string) {
  const { dev, s } = c;
  const cmd = t[0];
  let a: string[] | null;
  switch (cmd) {
    case 'help':
      say(c, 'ls  pwd  whoami  hostname  uname -a  ip a  ss -tlnp  ps aux  cat <file>  tail <file>\nnslookup <name>  dig <name>  ping <ip>  systemctl status <svc>  clear');
      if (dev.id === 'SRV-BACKUP') say(c, 'backup list  |  backup verify <snapshot>  |  backup restore <host> --snapshot <id>');
      return;
    case 'whoami':
      return say(c, 'root');
    case 'hostname':
      return say(c, dev.id.toLowerCase());
    case 'pwd':
      return say(c, '/root');
    case 'uname':
      return say(c, `Linux ${dev.id.toLowerCase()} 5.15.0-125-generic #135 SMP x86_64 GNU/Linux`);
    case 'ls':
      return say(c, dev.id === 'SRV-EHR' ? 'hl7-engine  ehr-app  backup.sh' : dev.id === 'SRV-BACKUP' ? 'catalog.db  restore.log' : 'notes.txt');
    case 'ip':
    case 'ifconfig':
      return say(c, `1: lo: <LOOPBACK,UP> inet 127.0.0.1/8\n2: ens160: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n    link/ether ${dev.mac}\n    inet ${dev.ip}/24 brd ${dev.ip!.replace(/\d+$/, '255')} scope global ens160`);
    case 'ss':
    case 'netstat': {
      say(c, 'State   Local Address:Port   Process');
      for (const sv of dev.services ?? []) {
        const p = sv.match(/(\d+)/)?.[1];
        if (p) say(c, `LISTEN  0.0.0.0:${pad(p, 15)}users:(("${sv.split(' ')[0].toLowerCase()}",pid=${1000 + Number(p) % 900}))`);
      }
      return;
    }
    case 'ps':
      return say(c, 'USER  PID  %CPU COMMAND\nroot    1   0.0 /sbin/init\nroot  812   0.1 /usr/sbin/sshd -D\n' + (dev.id === 'SRV-EHR' ? 'ehr  1420   8.2 java -jar ehr-app.jar\nhl7  1501   1.1 /opt/hl7-engine/mllp-listener --port 2575' : dev.id === 'SRV-PACS' ? 'pacs 1300   4.0 dcmqrscp --port 104' : 'app  1200   0.4 service'));
    case 'cat':
      if (t[1] === '/etc/resolv.conf') return say(c, 'search renxin.local\nnameserver 10.10.10.10');
      if (t[1] === '/etc/hosts') return say(c, `127.0.0.1 localhost\n${dev.ip} ${dev.id.toLowerCase()}.renxin.local`);
      if (t[1] === '/etc/os-release') return say(c, `PRETTY_NAME="${dev.os}"`);
      return err(c, `cat: ${t[1] ?? ''}: No such file or directory`);
    case 'tail':
      if (dev.id === 'SRV-EHR' && t.some((x) => x.includes('hl7'))) {
        say(c, 'MSH|^~\\&|VITALVIEW|WARD2|EHR|RENXIN|20261125031500||ORU^R01|MSG00981|P|2.5');
        say(c, 'PID|1||MRN0042117^^^RENXIN||ZHANG^SAN||19580312|M');
        say(c, 'OBX|1|NM|8867-4^Heart rate^LN||78|/min|||||F');
        say(c, 'OBX|2|NM|59408-5^SpO2^LN||97|%|||||F');
        sys(c, '[知识点] 这是明文 HL7 v2 ORU 消息：MSH 消息头、PID 患者信息、OBX 观察值。任何能嗅探这段网络的人都能看到患者数据。', '[tip] Cleartext HL7 v2 ORU: MSH header, PID patient, OBX observations. Anyone sniffing this segment can read PHI.');
        return;
      }
      return say(c, 'Nov 25 03:00:01 systemd[1]: Started daily cleanup.');
    case 'nslookup':
    case 'dig':
      return dnsLookup(c, t[1]);
    case 'ping':
      return t[1] ? ping(c, t[t.length - 1], 'linux') : err(c, 'usage: ping <host>');
    case 'systemctl':
      return say(c, `● ${t[2] ?? 'service'}.service\n   Active: active (running) since Fri 2026-08-29 02:11:04`);
    case 'clear':
      return;
    case 'backup':
      if (dev.id !== 'SRV-BACKUP') return err(c, 'bash: backup: command not found');
      if (m(t, 'backup list')) {
        flag(c, 'backup_list');
        say(c, 'HOST       SNAPSHOT              TIME               STATUS');
        for (const sn of SNAPSHOTS) say(c, `SRV-FILE   ${pad(sn.id, 22)}${pad(sn.time, 19)}${sn.status}`, sn.status.startsWith('SUSPECT') ? 'err' : 'out');
        say(c, 'SRV-EHR    snap-20261124-2300    2026-11-24 23:00   OK (immutable)');
        return;
      }
      if ((a = m(t, 'backup verify <id>'))) {
        const sn = SNAPSHOTS.find((x) => x.id === a![0]);
        if (!sn) return err(c, 'snapshot not found');
        return say(c, sn.status.startsWith('OK') ? `${sn.id}: checksum OK, entropy normal, 0 ransom notes found` : `${sn.id}: 18 204 files with extension .rxlock, README_RESTORE.txt found ← encrypted data!`, sn.status.startsWith('OK') ? 'ok' : 'err');
      }
      if ((a = m(t, 'backup restore <host> --snapshot <id>')) || (a = m(t, 'backup restore <host> <id>'))) {
        const host = a[0].toUpperCase();
        const sn = SNAPSHOTS.find((x) => x.id === a![1]);
        if (host !== 'SRV-FILE') return err(c, `restore: no protected data for host ${host}`);
        if (!sn) return err(c, `restore: snapshot ${a[1]} not found (run: backup list)`);
        if (sn.status.startsWith('SUSPECT')) {
          say(c, `restore: WARNING snapshot ${sn.id} was taken after the intrusion and contains encrypted files. Aborted.`, 'err');
          sys(c, '入侵开始于 2026-11-25 02:47 —— 要选择在此之前的快照。', 'The intrusion began 2026-11-25 02:47 — choose a snapshot from before that.');
          return;
        }
        if (s.flags['ransom_active'] && !s.flags['lateral_blocked']) {
          say(c, 'restore: target SRV-FILE still receiving encrypted writes over SMB from 10.20.20.21. Stop the lateral movement first.', 'err');
          return;
        }
        s.restored['SRV-FILE'] = sn.id;
        s.compromised = s.compromised.filter((x) => x !== 'SRV-FILE');
        say(c, `restore: SRV-FILE ← ${sn.id}  [##########] 100%  1.8 TB in 41 min (simulated)\nrestore: completed. RPO = ${sn.time} → data written after that must be re-entered from downtime paper forms.`, 'ok');
        return;
      }
      return err(c, 'usage: backup list | backup verify <id> | backup restore <host> --snapshot <id>');
    default:
      err(c, `bash: ${cmd}: command not found`);
      sys(c, '输入 help 查看可用命令。', 'Type help for commands.');
  }
  void raw;
}

function dnsLookup(c: Ctx, name?: string) {
  if (!name) return err(c, 'usage: nslookup <name>');
  const d = resolveTarget(name);
  say(c, 'Server:  dc01.renxin.local\nAddress: 10.10.10.10\n');
  if (name.includes('update-cdn-sync')) {
    say(c, `Non-authoritative answer:\nName:    ${name}\nAddress: 203.0.113.66`, 'err');
    sys(c, '[分析] 这个可疑域名解析到了 C2 地址 203.0.113.66。', '[analysis] This suspicious domain resolves to the C2 address 203.0.113.66.');
    return;
  }
  if (!d?.ip) return err(c, `*** dc01.renxin.local can't find ${name}: Non-existent domain`);
  say(c, `Name:    ${name.includes('.') ? name : name.toLowerCase() + '.renxin.local'}\nAddress: ${d.ip}`);
}

/* ───────────────────────── Windows workstation ───────────────────────── */

function windows(c: Ctx, t: string[], raw: string) {
  const { dev, s } = c;
  const cmd = t[0].toLowerCase();
  const infected = s.compromised.includes(dev.id);
  const v = vlanById(dev.vlan);
  switch (cmd) {
    case 'help':
      return say(c, 'ipconfig [/all]  netstat -ano  tasklist  whoami  hostname  systeminfo\nnslookup <name>  ping <ip>  tracert <ip>  arp -a  cls');
    case 'whoami':
      return say(c, dev.id === 'WS-NURSE-03' ? 'renxin\\nurse.wang' : 'renxin\\reg.desk3');
    case 'hostname':
      return say(c, dev.id);
    case 'systeminfo':
      return say(c, `Host Name: ${dev.id}\nOS Name: Microsoft ${dev.os}\nDomain: renxin.local\nHotfix(s): ${dev.os.includes('10') ? '112 installed. Last: 2025-10-14' : '87 installed. Last: 2026-11-11'}`);
    case 'ipconfig':
      if (t[1]?.toLowerCase() === '/all') {
        flag(c, `ipconfig:${dev.id}`);
        return say(c, `Ethernet adapter Ethernet:\n   Connection-specific DNS Suffix  : renxin.local\n   Physical Address. . . . . . . . : ${dev.mac!.toUpperCase().replace(/:/g, '-')}\n   DHCP Enabled. . . . . . . . . . : Yes\n   IPv4 Address. . . . . . . . . . : ${dev.ip}(Preferred)\n   Subnet Mask . . . . . . . . . . : 255.255.255.0\n   Lease Obtained. . . . . . . . . : Tuesday, November 25, 2026 07:02:11\n   Default Gateway . . . . . . . . : ${v?.gateway}\n   DHCP Server . . . . . . . . . . : 10.10.10.10\n   DNS Servers . . . . . . . . . . : 10.10.10.10`);
      }
      return say(c, `Ethernet adapter Ethernet:\n   IPv4 Address. . . . . . . . . . : ${dev.ip}\n   Subnet Mask . . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . . : ${v?.gateway}`);
    case 'netstat': {
      flag(c, `netstat:${dev.id}`);
      say(c, '\nActive Connections\n\n  Proto  Local Address          Foreign Address        State           PID');
      say(c, `  TCP    ${pad(dev.ip + ':49712', 23)}${pad('10.10.10.20:443', 23)}${pad('ESTABLISHED', 16)}4120`);
      say(c, `  TCP    ${pad(dev.ip + ':49690', 23)}${pad('10.10.10.10:389', 23)}${pad('ESTABLISHED', 16)}712`);
      if (infected) {
        say(c, `  TCP    ${pad(dev.ip + ':49733', 23)}${pad('203.0.113.66:443', 23)}${pad(s.fwBlocked.includes('203.0.113.66') ? 'SYN_SENT' : 'ESTABLISHED', 16)}6120`, 'err');
        say(c, `  TCP    ${pad(dev.ip + ':49801', 23)}${pad('10.10.10.40:445', 23)}${pad('ESTABLISHED', 16)}6120`, 'err');
        sys(c, '[分析] PID 6120 与境外 IP 203.0.113.66:443 保持连接，同时在访问文件服务器 445 端口。用 tasklist 看看它是什么进程。', '[analysis] PID 6120 holds a session to 203.0.113.66:443 and is hitting the file server on 445. Run tasklist to see what it is.');
      }
      return;
    }
    case 'tasklist':
      flag(c, `tasklist:${dev.id}`);
      say(c, 'Image Name                     PID Session Name   Mem Usage\n========================= ======== ============== ============\nexplorer.exe                  3120 Console          98,112 K\nHIS-Client.exe                4120 Console         212,480 K\nOUTLOOK.EXE                   5532 Console         180,220 K');
      if (infected) {
        say(c, 'invoice_viewer.exe            6120 Console          44,920 K', 'err');
        say(c, 'powershell.exe                6188 Console          71,004 K', 'err');
        sys(c, '[分析] invoice_viewer.exe 是从钓鱼邮件附件启动的，父进程是 OUTLOOK.EXE。不要关机 —— 先在交换机上隔离这台主机。', '[analysis] invoice_viewer.exe was launched from a phishing attachment (parent OUTLOOK.EXE). Do not power off — isolate the host at the switch.');
      }
      return;
    case 'arp':
      say(c, `\nInterface: ${dev.ip} --- 0xb\n  Internet Address      Physical Address      Type\n  ${pad(v!.gateway, 22)}00-1a-2b-00-01-00     dynamic\n  10.20.20.255          ff-ff-ff-ff-ff-ff     static`);
      sys(c, '[知识点] 网关的 MAC 是核心交换机的 SVI MAC。若这里突然变成别的 MAC，可能遭到了 ARP 欺骗。', '[tip] The gateway MAC is the core switch SVI. If it suddenly changes, suspect ARP spoofing.');
      return;
    case 'nslookup':
      return dnsLookup(c, t[1]);
    case 'ping':
      return t[1] ? ping(c, t[1], 'win') : err(c, 'Usage: ping <target>');
    case 'tracert':
      return t[1] ? trace(c, t[1]) : err(c, 'Usage: tracert <target>');
    case 'cls':
      return;
    default:
      err(c, `'${t[0]}' is not recognized as an internal or external command,\noperable program or batch file.`);
      sys(c, '输入 help 查看可用命令。', 'Type help for commands.');
  }
  void raw;
}

/* ───────────────────────── Windows Server (PowerShell) ───────────────────────── */

function winserver(c: Ctx, t: string[], raw: string) {
  const { dev, s } = c;
  const lc = raw.toLowerCase();
  if (lc === 'help') {
    say(c, 'ipconfig | Get-NetTCPConnection | Get-SmbSession | Get-SmbOpenFile');
    if (dev.id === 'SRV-AD') say(c, 'Get-ADUser <user> | Set-ADAccountPassword -Identity <user> -Reset\nGet-DnsServerResourceRecord -ZoneName renxin.local | Get-DhcpServerv4Scope');
    return;
  }
  if (lc.startsWith('ipconfig')) return say(c, `IPv4 Address . . . : ${dev.ip}\nDefault Gateway  . : 10.10.10.1`);
  if (lc.startsWith('ping')) return ping(c, t[1], 'win');
  if (lc.startsWith('nslookup')) return dnsLookup(c, t[1]);
  if (lc.startsWith('get-nettcpconnection')) {
    say(c, 'LocalAddress  LocalPort RemoteAddress  RemotePort State');
    for (const sv of dev.services ?? []) {
      const p = sv.match(/(\d+)/)?.[1];
      if (p) say(c, `${pad('0.0.0.0', 14)}${pad(p, 10)}${pad('0.0.0.0', 15)}${pad('0', 11)}Listen`);
    }
    return;
  }
  if (dev.id === 'SRV-FILE' && (lc.startsWith('get-smbsession') || lc.startsWith('get-smbopenfile'))) {
    flag(c, 'smb_sessions');
    say(c, 'ClientComputerName  ClientUserName      NumOpens');
    say(c, '10.60.60.20         RENXIN\\svc-cctv      2');
    if (s.compromised.includes('WS-REG-01') && !s.flags['lateral_blocked']) {
      say(c, '10.20.20.21         RENXIN\\nurse.wang    1 832', 'err');
      say(c, '\\\\SRV-FILE\\Wards\\Roster_Dec.xlsx.rxlock\n\\\\SRV-FILE\\Pharmacy\\stock.xlsx.rxlock\n\\\\SRV-FILE\\Wards\\README_RESTORE.txt', 'err');
      sys(c, '[分析] nurse.wang 的账号正在从 1F 挂号电脑 10.20.20.21 加密共享盘 —— 攻击者已横向移动。', '[analysis] nurse.wang\'s account is encrypting shares from the 1F registration PC 10.20.20.21 — lateral movement.');
    }
    return;
  }
  if (dev.id === 'SRV-AD') {
    let mm = raw.match(/^get-aduser\s+(-identity\s+)?(\S+)/i);
    if (mm) {
      const u = mm[2].toLowerCase();
      return say(c, `DistinguishedName : CN=${u},OU=Clinical,DC=renxin,DC=local\nEnabled           : True\nSamAccountName    : ${u}\nPasswordLastSet   : ${s.resetUsers.includes(u) ? '2026-11-25 (just now)' : '2026-06-02 08:11:40'}`);
    }
    mm = raw.match(/^set-adaccountpassword\s+(-identity\s+)?(\S+)(.*)$/i);
    if (mm) {
      const u = mm[2].toLowerCase();
      if (!/-reset/i.test(mm[3])) return err(c, 'Set-ADAccountPassword : add -Reset to set a new password without the old one.');
      if (!s.resetUsers.includes(u)) s.resetUsers.push(u);
      say(c, `Please enter the desired password for 'CN=${u},OU=Clinical,DC=renxin,DC=local'\nPassword: ****************\n[OK] Password reset. All Kerberos tickets for ${u} invalidated at next renewal.`, 'ok');
      sys(c, '[知识点] 现实中还要：强制下次登录改密、吊销该用户的会话/令牌、检查是否有异常登录 (事件 4624/4625)。', '[tip] In reality also: force change at next logon, revoke sessions/tokens, review logons (events 4624/4625).');
      return;
    }
    if (lc.startsWith('get-dnsserverresourcerecord')) {
      say(c, 'HostName   RecordType  RecordData');
      for (const d of DEVICES.filter((d) => d.zone === 'b1' && d.ip)) say(c, `${pad(d.id.toLowerCase(), 11)}${pad('A', 12)}${d.ip}`);
      say(c, `${pad('ehr', 11)}${pad('CNAME', 12)}srv-ehr.renxin.local.\n${pad('pacs', 11)}${pad('CNAME', 12)}srv-pacs.renxin.local.`);
      return;
    }
    if (lc.startsWith('get-dhcpserverv4scope')) {
      say(c, 'ScopeId        SubnetMask     Name       State   StartRange     EndRange');
      for (const v of VLANS.filter((v) => [20, 30, 40, 60, 70].includes(v.id))) say(c, `${pad(v.subnet.split('/')[0], 15)}${pad('255.255.255.0', 15)}${pad(v.name, 11)}Active  ${pad(v.subnet.replace('0/24', '100'), 15)}${v.subnet.replace('0/24', '250')}`);
      return;
    }
  }
  err(c, `${t[0]} : The term '${t[0]}' is not recognized as the name of a cmdlet.`);
  sys(c, '输入 help 查看可用命令。', 'Type help for commands.');
}

/* ───────────────────────── Embedded / IoT ───────────────────────── */

function embedded(c: Ctx, t: string[], raw: string) {
  const { dev } = c;
  if (m(t, 'help') || raw === '?') return say(c, 'show info | show config | show services | show log | ping <ip>');
  if (m(t, 'show info')) return say(c, `Model     : ${dev.model}\nFirmware  : ${dev.os}\nMAC       : ${dev.mac}\nIP        : ${dev.ip} (DHCP reservation)\nVLAN      : ${dev.vlan}\nLocation  : ${dev.room.en}`);
  if (m(t, 'show config')) {
    say(c, `ip.mode=dhcp\nserver.primary=${dev.id.includes('CT') || dev.id.includes('CAM') ? (dev.id.includes('CT') ? '10.10.10.30:104' : '10.10.10.40:554') : '10.10.10.20:2575'}\nadmin.user=admin\nadmin.password=${dev.risk >= 80 ? 'admin   <-- factory default!' : '********'}`);
    if (dev.risk >= 80) sys(c, '[风险] 默认凭据。很多医疗/IoT 设备出厂密码公开在说明书上。', '[risk] Default credentials — many medical/IoT manuals publish them.');
    return;
  }
  if (m(t, 'show services')) {
    (dev.services ?? []).forEach((sv) => say(c, `  ${sv}`, /telnet|23/i.test(sv) ? 'err' : 'out'));
    if ((dev.services ?? []).some((sv) => /telnet/i.test(sv))) sys(c, '[风险] Telnet 明文传输，应在网络侧阻断。', '[risk] Telnet is cleartext — block it on the network.');
    return;
  }
  if (m(t, 'show log')) return say(c, '2026-11-25 03:00:00 heartbeat ok\n2026-11-25 03:05:00 heartbeat ok');
  const a = m(t, 'ping <ip>');
  if (a) return ping(c, a[0], 'linux');
  err(c, 'unknown command (type help)');
}

/* ───────────────────────── SIEM ───────────────────────── */

function siem(c: Ctx, t: string[], raw: string) {
  const { s } = c;
  if (m(t, 'help')) return say(c, 'alerts                      list open alerts\nsearch src=<ip>             events from a source IP\nsearch dst=<ip>             events to a destination IP\ntimeline <ip>               ordered story for a host');
  if (m(t, 'alerts')) {
    say(c, 'ID     TIME              SEV       RULE                                  HOST');
    if (s.flags['ransom_active']) {
      say(c, 'A-9001 2026-11-25 02:47  CRITICAL  EDR: Office spawned unsigned binary   WS-NURSE-03', 'err');
      say(c, 'A-9002 2026-11-25 02:49  HIGH      Threat-intel: C2 beacon 203.0.113.66  WS-NURSE-03', 'err');
      say(c, 'A-9003 2026-11-25 03:12  CRITICAL  Mass file rename *.rxlock             SRV-FILE', 'err');
    }
    if (s.flags['rogue_active']) say(c, 'A-9101 2026-11-25 09:41  HIGH      WIPS: SSID impersonation HIS-Staff    WLC-01', 'err');
    say(c, 'A-8120 2026-11-24 14:02  LOW       BMS outbound MQTT to vendor cloud     IOT-BMS-01');
    say(c, 'A-8099 2026-11-23 10:15  MEDIUM    Telnet login to camera                IOT-CAM-01');
    return;
  }
  const mm = raw.match(/^(search\s+(src|dst)=|timeline\s+)(\S+)/i);
  if (mm) {
    const ip = mm[3];
    flag(c, `siem:${ip}`);
    if (ip === '10.20.20.53' && s.flags['ransom_active']) {
      say(c, 'TIME      SOURCE         EVENT');
      say(c, '02:44:10  MAIL-GW        nurse.wang received "Invoice_Nov.zip" from billing@renxin-hosp1tal.example');
      say(c, '02:47:03  EDR            OUTLOOK.EXE → invoice_viewer.exe (unsigned)', 'err');
      say(c, '02:47:30  DNS            query update-cdn-sync.example → 203.0.113.66', 'err');
      say(c, '02:49:12  FW-EDGE        outbound 10.20.20.53 → 203.0.113.66:443 (permitted)', 'err');
      say(c, '02:58:44  WinEvent 4624  nurse.wang logon type 3 from 10.20.20.53 → WS-REG-01 (10.20.20.21)', 'err');
      say(c, '03:01:09  EDR            WS-REG-01: psexec-like service created', 'err');
      say(c, '03:12:00  SRV-FILE       10.20.20.21 renamed 18 204 files → *.rxlock', 'err');
      sys(c, '[结论] 攻击者在你隔离护士站之前，已用 nurse.wang 的凭据横向移动到 1F 挂号电脑 (10.20.20.21)，现在正从那里加密文件服务器！隔离一台主机不够，要在 VLAN 层面切断 SMB。', '[finding] Before you isolated the nurse PC, the attacker used nurse.wang\'s credentials to move to the 1F registration PC (10.20.20.21) and is encrypting the file server from there! Isolating one host is not enough — cut SMB at the VLAN level.');
      if (!s.compromised.includes('WS-REG-01')) s.compromised.push('WS-REG-01');
      if (!s.compromised.includes('SRV-FILE')) s.compromised.push('SRV-FILE');
      return;
    }
    if (ip === '10.20.20.21' && s.flags['ransom_active']) {
      say(c, '02:58:44  WinEvent 4624  nurse.wang logon type 3 from 10.20.20.53\n03:12:00  SRV-FILE       mass rename via SMB', 'err');
      return;
    }
    if ((ip === '10.20.20.88' || ip.includes('nurse.li')) && s.flags['rogue_active']) {
      say(c, '09:41:52  WLC-01   6c2f.8a00.2088 disassociated from AP-2F-WARD (reason 7, deauth flood)\n09:41:55  WIPS     client seen on rogue 02de.adbe.ef01\n09:58:30  SRV-AD   4625 logon failure nurse.li from 198.51.100.77 (VPN portal)', 'err');
      return;
    }
    say(c, `(no notable events for ${ip} in the last 24h)`);
    return;
  }
  err(c, 'unknown query (type help)');
}
