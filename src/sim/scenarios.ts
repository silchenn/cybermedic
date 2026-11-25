import { l } from '../data/network';
import type { Flow, L10n } from '../types';
import { smbBlockedFromVlan20, vlan20AclIsSafe } from './reach';
import type { SimState } from './state';

export interface Step {
  id: string;
  phase: L10n;
  title: L10n;
  brief: L10n;
  objective: L10n;
  /** Device the player should open. Used for the "go to device" button. */
  device: string;
  hints: L10n[];
  check: (s: SimState) => boolean;
  /** Optional warning when the player did something risky. */
  feedback?: (s: SimState) => L10n | null;
  learn: L10n;
}

export interface Scenario {
  id: string;
  title: L10n;
  tagline: L10n;
  difficulty: 1 | 2 | 3;
  minutes: number;
  mitre: string[];
  intro: L10n;
  setup: (s: SimState) => void;
  steps: Step[];
  attackFlows: (s: SimState) => Flow[];
  debrief: L10n[];
}

const C2 = '203.0.113.66';

const lateralBlocked = (s: SimState) => smbBlockedFromVlan20(s) || (s.shutdownPorts['ACC-SW-1F'] ?? []).includes('Gi1/0/5');

export const SCENARIOS: Scenario[] = [
  {
    id: 'ransomware',
    title: l('凌晨三点的勒索软件', 'Ransomware at 3 AM'),
    tagline: l('钓鱼邮件 → C2 → 横向移动 → 加密共享盘。你是值班安全工程师。', 'Phishing → C2 → lateral movement → encrypted shares. You are the on-call security engineer.'),
    difficulty: 2,
    minutes: 15,
    mitre: ['T1566.001 Phishing', 'T1071.001 Web C2', 'T1021.002 SMB/Admin Shares', 'T1486 Data Encrypted for Impact', 'T1490 Inhibit Recovery'],
    intro: l(
      '2026-11-25 03:14。SOC 值班手机响起：EDR 在 2F 护士站电脑 WS-NURSE-03 上发现 Outlook 启动了未签名程序，防火墙威胁情报命中 C2 地址。病区仍在正常运行，你每多耽误一分钟，被加密的数据就越多。按 NIST 800-61 流程：检测 → 遏制 → 根除 → 恢复。',
      '2026-11-25 03:14. The SOC pager goes off: EDR saw Outlook spawn an unsigned binary on 2F nurse PC WS-NURSE-03, and firewall threat intel matched a C2 address. Wards are running; every minute you wait, more data gets encrypted. Follow NIST 800-61: detect → contain → eradicate → recover.',
    ),
    setup: (s) => {
      s.flags['ransom_active'] = true;
      s.compromised = ['WS-NURSE-03'];
      s.revealed.push('ATTACKER', 'L-c2');
    },
    steps: [
      {
        id: 'r1', phase: l('检测与分析', 'Detect & analyse'), device: 'WS-NURSE-03',
        title: l('确认可疑外联', 'Confirm the suspicious connection'),
        brief: l('先别急着动手 —— 告警可能是误报。登录 WS-NURSE-03，确认是否真的存在到外部可疑地址的连接。', 'Do not act blindly — alerts can be false positives. Log into WS-NURSE-03 and confirm whether there really is a connection to a suspicious external address.'),
        objective: l('在 WS-NURSE-03 上查看网络连接', 'Inspect network connections on WS-NURSE-03'),
        hints: [l('Windows 上查看所有 TCP 连接和对应 PID 的命令是 netstat，加 -ano 参数。', 'On Windows, netstat with -ano lists every TCP connection and its PID.'), l('输入：netstat -ano', 'Type: netstat -ano')],
        check: (s) => !!s.flags['netstat:WS-NURSE-03'],
        learn: l('你看到 PID 6120 连接 203.0.113.66:443 并访问文件服务器 445 端口。可以再用 tasklist 看进程名。分析可疑连接时要记录：时间、源/目的 IP 端口、PID、进程 —— 这些都是取证证据。', 'PID 6120 talks to 203.0.113.66:443 and the file server on 445. tasklist shows the process name. Record time, IPs/ports, PID and process — all of it is evidence.'),
      },
      {
        id: 'r2', phase: l('遏制', 'Contain'), device: 'ACC-SW-2F',
        title: l('在网络层隔离主机', 'Isolate the host at the network'),
        brief: l('确认感染。不要拔电源或关机 —— 内存里的加密密钥和恶意进程是宝贵证据。正确做法是在接入交换机上关掉它的端口。WS-NURSE-03 接在 ACC-SW-2F 的 Gi1/0/12。', 'Infection confirmed. Do NOT pull power — memory holds encryption keys and the live process, both precious evidence. Shut its switch port instead: WS-NURSE-03 is on ACC-SW-2F Gi1/0/12.'),
        objective: l('关闭 ACC-SW-2F 的 Gi1/0/12 端口', 'Shut ACC-SW-2F port Gi1/0/12'),
        hints: [l('先进入全局配置模式，再进入接口配置模式，最后执行 shutdown。', 'Enter global config, then interface config, then shutdown.'), l('依次输入：conf t → interface gi1/0/12 → shutdown', 'Type: conf t → interface gi1/0/12 → shutdown')],
        check: (s) => (s.shutdownPorts['ACC-SW-2F'] ?? []).includes('Gi1/0/12'),
        feedback: (s) => ((s.shutdownPorts['ACC-SW-2F'] ?? []).includes('Gi1/0/1') ? l('你关掉了 Gi1/0/1 —— 那是 2F 病区 AP 的口！整层的输液泵和 PDA 都掉线了。用 no shutdown 恢复它。', 'You shut Gi1/0/1 — the 2F ward AP! Every pump and PDA on the floor dropped. Restore it with no shutdown.') : null),
        learn: l('端口 shutdown 是最快、可逆的遏制手段。在有 NAC/802.1X 的环境里，也可以通过 RADIUS CoA 把主机动态放入隔离 VLAN，或用 EDR 的"网络隔离"功能。', 'Shutting the port is the fastest reversible containment. With NAC/802.1X you could push the host into a quarantine VLAN via RADIUS CoA, or use EDR network isolation.'),
      },
      {
        id: 'r3', phase: l('遏制', 'Contain'), device: 'FW-EDGE',
        title: l('在边界阻断 C2', 'Block the C2 at the perimeter'),
        brief: l(`攻击者可能已经感染了其他机器。在边界防火墙的出站策略 OUTSIDE_OUT 中拒绝所有去往 C2 地址 ${C2} 的流量，切断全院任何主机与它的联系。`, `Other machines may already be infected. Deny all traffic to the C2 ${C2} in the firewall egress policy OUTSIDE_OUT so no host in the hospital can reach it.`),
        objective: l(`在 FW-EDGE 上拒绝去往 ${C2} 的出站流量`, `Deny outbound traffic to ${C2} on FW-EDGE`),
        hints: [l('防火墙也需要先进入配置模式（conf t）。', 'The firewall also needs configuration mode (conf t).'), l(`输入：conf t → access-list OUTSIDE_OUT extended deny ip any host ${C2}`, `Type: conf t → access-list OUTSIDE_OUT extended deny ip any host ${C2}`)],
        check: (s) => s.fwBlocked.includes(C2),
        learn: l('出站过滤 (egress filtering) 经常被忽视。本院原来是 permit any any，这正是 C2 能畅通无阻的原因。同时应把该 IP/域名加入内部 DNS 的 RPZ 黑名单和 EDR 的 IOC 列表。', 'Egress filtering is often neglected — this hospital had permit any any, which is why the C2 worked. Also add the IP/domain to the internal DNS RPZ and EDR IOC lists.'),
      },
      {
        id: 'r4', phase: l('检测与分析', 'Detect & analyse'), device: 'SIEM-01',
        title: l('确定影响范围', 'Scope the incident'),
        brief: l('文件服务器还在报大量改名告警 —— 但护士站已经断网了，是谁在加密？到 SIEM 上按源 IP 10.20.20.53 还原时间线。', 'The file server is still flagging mass renames — but the nurse PC is offline. Who is encrypting? Rebuild the timeline in SIEM for source 10.20.20.53.'),
        objective: l('在 SIEM 上检索 10.20.20.53 的事件', 'Search SIEM for events from 10.20.20.53'),
        hints: [l('SIEM 支持 search src=<ip> 和 timeline <ip>。', 'SIEM supports search src=<ip> and timeline <ip>.'), l('输入：search src=10.20.20.53', 'Type: search src=10.20.20.53')],
        check: (s) => !!s.flags['siem:10.20.20.53'],
        learn: l('时间线显示：钓鱼邮件 02:44 → 执行 02:47 → C2 02:49 → 用 nurse.wang 凭据登录 1F 挂号电脑 02:58 → 03:12 开始加密。这就是"横向移动 (Lateral Movement)"。统一的 NTP 时间让这条时间线能拼起来。', 'Timeline: phish 02:44 → execution 02:47 → C2 02:49 → nurse.wang creds used on the 1F registration PC 02:58 → encryption 03:12. That is lateral movement — and NTP-synced clocks make the timeline possible.'),
      },
      {
        id: 'r5', phase: l('遏制', 'Contain'), device: 'CORE-SW1',
        title: l('在 VLAN 间切断 SMB 横向移动', 'Cut SMB lateral movement between VLANs'),
        brief: l('临床终端 (VLAN 20) 访问服务器区 (VLAN 10) 的 SMB 445 必须立即阻断，但不能影响护士访问电子病历 (HTTPS 443)！在核心交换机上创建扩展 ACL，挂在 interface vlan 20 的入方向。', 'Block SMB 445 from clinical endpoints (VLAN 20) to servers (VLAN 10) now — without breaking EHR access (HTTPS 443)! Create an extended ACL on the core and apply it inbound on interface vlan 20.'),
        objective: l('ACL：先 deny tcp … eq 445，再 permit ip any any，应用到 Vlan20 in', 'ACL: deny tcp … eq 445, then permit ip any any, applied to Vlan20 in'),
        hints: [
          l('ACL 从上到下匹配，末尾隐含 deny any —— 记得最后加一条 permit。', 'ACLs match top-down with an implicit deny at the end — remember a final permit.'),
          l('conf t → ip access-list extended BLOCK-SMB → deny tcp any any eq 445 → permit ip any any → exit', 'conf t → ip access-list extended BLOCK-SMB → deny tcp any any eq 445 → permit ip any any → exit'),
          l('interface vlan 20 → ip access-group BLOCK-SMB in', 'interface vlan 20 → ip access-group BLOCK-SMB in'),
        ],
        check: (s) => vlan20AclIsSafe(s) === 'ok',
        feedback: (s) => {
          const v = vlan20AclIsSafe(s);
          if (v === 'blocks-all') return l('⚠ 你的 ACL 没有 permit 语句 —— 隐含的 deny any 把 VLAN 20 所有流量都挡了，全院护士无法打开电子病历！在 ACL 末尾加 permit ip any any。', '⚠ Your ACL has no permit — the implicit deny drops ALL VLAN 20 traffic and no nurse can open the EHR! Add permit ip any any at the end.');
          if (v === 'ineffective') return l('⚠ permit ip any any 排在 deny 之前（或没有 deny 445），SMB 仍然放行。用 no <序号> 删掉再按正确顺序添加。', '⚠ permit ip any any is above the deny (or there is no deny 445) so SMB still passes. Remove with no <seq> and re-add in the right order.');
          return null;
        },
        learn: l('扩展 ACL 放在离源最近的位置。真实环境还应长期执行"最小权限"：只有需要的服务器才开放 SMB，终端之间禁止 SMB/RDP（防横向移动）。', 'Place extended ACLs close to the source. Long-term: least privilege — SMB only where needed, and no SMB/RDP between endpoints.'),
      },
      {
        id: 'r6', phase: l('恢复', 'Recover'), device: 'SRV-BACKUP',
        title: l('从不可变备份恢复', 'Restore from immutable backup'),
        brief: l('横向移动已被阻断。文件服务器上 18 204 个文件被加密。不要付赎金 —— 本院有不可变备份。注意：入侵开始于 02:47，必须选择在此之前的干净快照。', 'Lateral movement is stopped; 18,204 files are encrypted. Do not pay — the hospital has immutable backups. The intrusion began at 02:47, so pick a clean snapshot from before that.'),
        objective: l('列出快照并把 SRV-FILE 恢复到干净的快照', 'List snapshots and restore SRV-FILE to a clean one'),
        hints: [l('先 backup list 查看快照列表和状态。', 'Run backup list to see snapshots and status.'), l('输入：backup restore SRV-FILE --snapshot snap-20261124-2300', 'Type: backup restore SRV-FILE --snapshot snap-20261124-2300')],
        check: (s) => s.restored['SRV-FILE'] === 'snap-20261124-2300' || s.restored['SRV-FILE'] === 'snap-20261123-2300',
        learn: l('3-2-1-1-0 原则：3 份副本、2 种介质、1 份异地、1 份离线/不可变、0 恢复错误。RPO=上次快照时间，之后的数据要靠停机期间的纸质记录补录。', '3-2-1-1-0: 3 copies, 2 media, 1 off-site, 1 offline/immutable, 0 restore errors. RPO = last snapshot; later data is re-entered from downtime paper forms.'),
      },
    ],
    attackFlows: (s) => {
      const out: Flow[] = [];
      if (!s.fwBlocked.includes(C2) && !(s.shutdownPorts['ACC-SW-2F'] ?? []).includes('Gi1/0/12'))
        out.push({ id: 'A-c2', from: 'WS-NURSE-03', to: 'ATTACKER', protocol: 'HTTPS C2', port: 'TCP 443', label: l('C2 心跳与指令', 'C2 beacon & tasking'), hostile: true });
      if (s.compromised.includes('WS-REG-01') && !lateralBlocked(s))
        out.push({ id: 'A-smb', from: 'WS-REG-01', to: 'SRV-FILE', protocol: 'SMB', port: 'TCP 445', label: l('加密共享盘', 'Encrypting shares'), hostile: true });
      if (!s.flags['siem:10.20.20.53'] && (s.shutdownPorts['ACC-SW-2F'] ?? []).includes('Gi1/0/12') === false)
        out.push({ id: 'A-lat', from: 'WS-NURSE-03', to: 'WS-REG-01', protocol: 'SMB/PsExec', port: 'TCP 445', label: l('横向移动', 'Lateral movement'), hostile: true });
      return out;
    },
    debrief: [
      l('根除：重装两台被感染的终端（不要"清理"后继续用），重置 nurse.wang 等所有可能泄露的凭据，检查是否有新建的计划任务/服务。', 'Eradicate: re-image both infected endpoints (do not "clean and reuse"), reset every exposed credential, hunt for new scheduled tasks/services.'),
      l('合规：涉及患者健康信息 (PHI) 的事件，需按当地法规通报（如美国 HIPAA 违规通知、中国《网络安全法》《数据安全法》及卫健委要求），并保留证据链。', 'Compliance: incidents touching PHI must be reported per local law (e.g. HIPAA breach notification, China\'s Cybersecurity/Data Security Laws) with a preserved chain of custody.'),
      l('事后改进：出站默认拒绝；邮件附件沙箱；终端之间禁止 SMB；特权账号分层；每月恢复演练。', 'Lessons learned: default-deny egress, attachment sandboxing, no endpoint-to-endpoint SMB, tiered admin accounts, monthly restore drills.'),
    ],
  },
  {
    id: 'evil-twin',
    title: l('大厅里的 Evil Twin', 'Evil Twin in the lobby'),
    tagline: l('有人在候诊区伪造了 HIS-Staff 热点，正在窃取医护人员的域账号。', 'Someone in the waiting area is impersonating HIS-Staff and harvesting staff domain credentials.'),
    difficulty: 1,
    minutes: 10,
    mitre: ['T1557 Adversary-in-the-Middle', 'T1499 Deauth (Wi-Fi DoS)', 'T1078 Valid Accounts'],
    intro: l(
      '2026-11-25 09:45。2F 病区多名护士反映 PDA 频繁掉线，重新连上后系统提示"证书不受信任"，有人点了"继续"。几分钟后 WIPS 发出告警。你需要找到伪造热点、遏制它、处置被盗账号并加固无线网络。',
      '2026-11-25 09:45. Several 2F nurses report their PDAs keep dropping; on reconnect they saw a "certificate not trusted" prompt, and someone tapped "Continue". Minutes later WIPS raises an alert. Find the rogue AP, contain it, handle the stolen account and harden the WLAN.',
    ),
    setup: (s) => {
      s.flags['rogue_active'] = true;
      s.revealed.push('ROGUE-AP', 'L-rogue-pda');
      s.compromised = ['MOB-NURSE-LI'];
    },
    steps: [
      {
        id: 'e1', phase: l('检测', 'Detect'), device: 'WLC-01',
        title: l('查看流氓 AP 列表', 'Review detected rogue APs'),
        brief: l('WLC 汇总了所有 AP（尤其是 3F 的 Monitor 模式 AP）扫描到的陌生热点。先看看有哪些。', 'The WLC aggregates unknown APs seen by every AP — especially the 3F Monitor-mode AP. See what is out there.'),
        objective: l('在 WLC-01 上查看 rogue AP 汇总', 'Show the rogue AP summary on WLC-01'),
        hints: [l('命令以 show wireless wps rogue 开头。', 'The command starts with show wireless wps rogue.'), l('输入：show wireless wps rogue ap summary', 'Type: show wireless wps rogue ap summary')],
        check: (s) => !!s.flags['rogue_summary'],
        learn: l('邻居咖啡店的热点是 Unclassified，药企厂商的是 Friendly，但 02de.adbe.ef01 广播的是我们自己的 SSID —— 典型的 SSID 冒充 (Evil Twin)。注意 02 开头说明是"本地管理"的随机 MAC。', 'The café is Unclassified, the pharma vendor Friendly, but 02de.adbe.ef01 broadcasts OUR SSID — classic impersonation. A leading 02 means a locally administered (randomised) MAC.'),
      },
      {
        id: 'e2', phase: l('分析', 'Analyse'), device: 'WLC-01',
        title: l('定位伪造热点', 'Locate the rogue'),
        brief: l('查看这个恶意 BSSID 的详细信息：哪些 AP 听到了它、信号强度多少？据此判断它的物理位置。', 'Get the details for the malicious BSSID: which APs hear it and how strongly? Use that to estimate its physical location.'),
        objective: l('查看 02de.adbe.ef01 的详细信息', 'Show details for 02de.adbe.ef01'),
        hints: [l('把 summary 换成 detail 并加上 MAC 地址。', 'Replace summary with detail and add the MAC.'), l('输入：show wireless wps rogue ap detail 02de.adbe.ef01', 'Type: show wireless wps rogue ap detail 02de.adbe.ef01')],
        check: (s) => !!s.flags['rogue_detail'],
        learn: l('RSSI -38 dBm 说明离 1F 大厅 AP 非常近。多个 AP 的 RSSI 可以三角定位。现实中保卫科在候诊区座椅下找到了一个装着便携路由器的背包。', 'RSSI -38 dBm means it is very close to the 1F lobby AP; several APs\' RSSI allows triangulation. In reality security found a backpack with a travel router under a waiting-room seat.'),
      },
      {
        id: 'e3', phase: l('遏制', 'Contain'), device: 'WLC-01',
        title: l('无线遏制伪造热点', 'Contain the rogue over the air'),
        brief: l('在保卫人员赶到之前，让合法 AP 对伪造热点发起遏制，阻止更多人连上去。', 'Until security arrives, have legitimate APs contain the rogue so no one else connects.'),
        objective: l('对 02de.adbe.ef01 启用 containment', 'Enable containment against 02de.adbe.ef01'),
        hints: [l('这是一个全局配置命令（先 conf t）。', 'This is a global config command (conf t first).'), l('输入：conf t → wireless wps rogue ap mac-address 02de.adbe.ef01 contain', 'Type: conf t → wireless wps rogue ap mac-address 02de.adbe.ef01 contain')],
        check: (s) => s.contained.includes('02deadbeef01'),
        learn: l('遏制会对伪造热点和它的客户端发 Deauth。它只能临时止血；在有些地区，对他人设备发 Deauth 是违法的，只能在确认是冒充本院 SSID 的恶意热点时使用。', 'Containment deauths the rogue and its clients. It only stops the bleeding; in some regions deauthing others is illegal — use it only on confirmed impersonation of your own SSID.'),
      },
      {
        id: 'e4', phase: l('分析', 'Analyse'), device: 'WLC-01',
        title: l('找出受害者', 'Identify victims'),
        brief: l('谁连上过这个伪造热点？他们的凭据可能已经泄露。', 'Who connected to the rogue? Their credentials may be exposed.'),
        objective: l('查看伪造热点上的客户端', 'List clients seen on the rogue'),
        hints: [l('把 ap 换成 client。', 'Replace ap with client.'), l('输入：show wireless wps rogue client summary', 'Type: show wireless wps rogue client summary')],
        check: (s) => !!s.flags['rogue_clients'],
        learn: l('PEAP-MSCHAPv2 如果不校验 RADIUS 服务器证书，伪造热点可以拿到 MSCHAPv2 挑战-响应，离线破解出密码。也可以在 SIEM 里搜 10.20.20.88 看到异地 VPN 登录尝试。', 'If PEAP-MSCHAPv2 does not validate the RADIUS certificate, the rogue captures the MSCHAPv2 challenge/response and cracks it offline. Search 10.20.20.88 in SIEM to see the remote VPN attempts.'),
      },
      {
        id: 'e5', phase: l('根除', 'Eradicate'), device: 'SRV-AD',
        title: l('重置泄露的账号', 'Reset the exposed account'),
        brief: l('攻击者已经开始用 nurse.li 的账号尝试登录 VPN 门户。立即在域控上重置她的密码。', 'The attacker is already trying nurse.li on the VPN portal. Reset her password on the domain controller now.'),
        objective: l('重置 nurse.li 的域密码', 'Reset nurse.li\'s domain password'),
        hints: [l('PowerShell AD 模块：Set-ADAccountPassword，需要 -Reset 参数。', 'AD PowerShell: Set-ADAccountPassword with -Reset.'), l('输入：Set-ADAccountPassword -Identity nurse.li -Reset', 'Type: Set-ADAccountPassword -Identity nurse.li -Reset')],
        check: (s) => s.resetUsers.includes('nurse.li'),
        learn: l('还应吊销她的会话与令牌、对 VPN 强制 MFA、检查邮箱转发规则 —— 攻击者拿到账号后常常先设邮件转发。', 'Also revoke sessions/tokens, enforce MFA on VPN and check mailbox forwarding rules — attackers often add forwarding first.'),
      },
      {
        id: 'e6', phase: l('加固', 'Harden'), device: 'WLC-01',
        title: l('强制 PMF 防 Deauth', 'Enforce PMF against deauth'),
        brief: l('攻击者靠伪造 Deauth 帧把 PDA 从合法 AP 踢下来。为 HIS-Staff 强制启用 802.11w 管理帧保护。', 'The attacker used forged deauth frames to kick PDAs off legitimate APs. Enforce 802.11w Protected Management Frames on HIS-Staff.'),
        objective: l('HIS-Staff 设置 security pmf mandatory', 'Set security pmf mandatory on HIS-Staff'),
        hints: [l('在全局配置下进入 wlan 配置模式。', 'Enter WLAN config mode from global config.'), l('输入：conf t → wlan HIS-Staff → security pmf mandatory', 'Type: conf t → wlan HIS-Staff → security pmf mandatory')],
        check: (s) => s.pmf['HIS-Staff'] === 'mandatory',
        learn: l('PMF 解决的是"踢线"，解决不了"冒充"。根治 Evil Twin 要靠客户端严格校验 RADIUS 证书（MDM 下发 CA 并锁定服务器名），最好升级到 EAP-TLS 证书认证 + WPA3-Enterprise。', 'PMF fixes deauth, not impersonation. The real cure is strict RADIUS certificate validation on clients (MDM-pushed CA + pinned server name), ideally EAP-TLS + WPA3-Enterprise.'),
      },
    ],
    attackFlows: (s) => {
      if (s.contained.length) return [];
      return [{ id: 'A-rogue', from: 'MOB-NURSE-LI', to: 'ROGUE-AP', protocol: 'EAP (PEAP)', port: '802.11', label: l('窃取 PEAP 凭据', 'Harvesting PEAP credentials'), hostile: true }];
    },
    debrief: [
      l('物理处置：保卫科取回设备并保全证据（拍照、记录时间、装袋、签字），必要时报警。', 'Physical: security recovers the device and preserves evidence (photos, times, bagging, signatures); involve law enforcement as needed.'),
      l('长期：EAP-TLS + WPA3-Enterprise、MDM 强制证书校验、WIPS 自动遏制冒充 SSID 的热点、员工培训："证书警告 = 报告 IT，不要点继续"。', 'Long term: EAP-TLS + WPA3-Enterprise, MDM-enforced cert validation, WIPS auto-containment for SSID impersonation, training: "certificate warning = call IT, never tap Continue".'),
    ],
  },
];

export const scenarioById = (id: string) => SCENARIOS.find((x) => x.id === id);

/** Recomputes derived flags after every command. */
export function deriveFlags(s: SimState) {
  s.flags['lateral_blocked'] = lateralBlocked(s);
}
