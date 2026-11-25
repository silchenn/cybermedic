import type { Topic } from '../types';
import { l } from './network';

export const CATEGORIES = {
  ccna: l('CCNA 网络基础', 'CCNA fundamentals'),
  wireless: l('无线网络', 'Wireless'),
  security: l('安全与应急响应', 'Security & IR'),
  medical: l('医疗行业协议', 'Healthcare protocols'),
} as const;

export const TOPICS: Topic[] = [
  // ───────── CCNA ─────────
  {
    id: 'osi', category: 'ccna', title: l('OSI 七层 / TCP-IP 模型', 'OSI & TCP/IP models'),
    summary: l('把网络通信拆成分层职责，排障时自下而上逐层确认。', 'Splits communication into layers; troubleshoot bottom-up.'),
    points: [
      l('L1 物理（网线、光纤、射频）→ L2 数据链路（MAC、交换机、VLAN）→ L3 网络（IP、路由器）→ L4 传输（TCP/UDP 端口）→ L7 应用（HTTP、DNS、HL7、DICOM）。', 'L1 physical (copper, fibre, RF) → L2 data link (MAC, switches, VLANs) → L3 network (IP, routers) → L4 transport (TCP/UDP ports) → L7 application (HTTP, DNS, HL7, DICOM).'),
      l('封装：数据 → 段 → 包 → 帧 → 比特。', 'Encapsulation: data → segment → packet → frame → bits.'),
      l('TCP 三次握手 SYN / SYN-ACK / ACK；UDP 无连接，适合 DNS、语音。', 'TCP 3-way handshake SYN / SYN-ACK / ACK; UDP is connectionless — DNS, voice.'),
    ],
    hospital: l('监护仪掉线：先看网线/信号(L1)，再看是否在正确 VLAN(L2)、能否 ping 网关(L3)、2575 端口是否被 ACL 挡住(L4)、最后看 HL7 消息格式(L7)。', 'Monitor offline? Check cable/RF (L1), correct VLAN (L2), gateway ping (L3), ACL on 2575 (L4), then HL7 message format (L7).'),
    devices: ['IOT-MON-01', 'ACC-SW-2F', 'CORE-SW1', 'SRV-EHR'],
    commands: [{ device: 'WS-NURSE-03', cmd: 'ping 10.10.10.20' }, { device: 'WS-NURSE-03', cmd: 'tracert 10.10.10.20' }],
  },
  {
    id: 'subnetting', category: 'ccna', title: l('IP 编址与子网划分', 'IPv4 addressing & subnetting'),
    summary: l('每个 VLAN 一个子网；/24 = 256 个地址、254 个可用主机。', 'One subnet per VLAN; a /24 = 256 addresses, 254 usable hosts.'),
    points: [
      l('私有地址：10.0.0.0/8、172.16.0.0/12、192.168.0.0/16（RFC 1918）。', 'Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC 1918).'),
      l('可用主机 = 2^(32-前缀) − 2。/26 = 62 台，/30 = 2 台（点对点链路）。', 'Usable hosts = 2^(32-prefix) − 2. /26 = 62, /30 = 2 (point-to-point).'),
      l('本院规划：10.<VLAN>.<VLAN>.0/24，看 IP 就知道属于哪个 VLAN。', 'This hospital uses 10.<VLAN>.<VLAN>.0/24 — the IP tells you the VLAN.'),
    ],
    hospital: l('输液泵 10.40.40.31 → 一眼就知道在 VLAN 40 Med-IoT。好的编址规划能让应急响应快很多。', 'Pump 10.40.40.31 is obviously VLAN 40 Med-IoT. Good addressing speeds up incident response.'),
    devices: ['CORE-SW1'], vlans: [10, 20, 30, 40, 50, 60, 70, 99],
    commands: [{ device: 'CORE-SW1', cmd: 'show ip interface brief' }],
  },
  {
    id: 'vlan', category: 'ccna', title: l('VLAN 与 802.1Q Trunk', 'VLANs & 802.1Q trunking'),
    summary: l('在一台交换机上划分多个二层广播域，把医护、IoT、访客彼此隔开。', 'Multiple L2 broadcast domains on one switch — separates clinical, IoT and guests.'),
    points: [
      l('Access 口只属于一个 VLAN；Trunk 口用 802.1Q 标签同时承载多个 VLAN。', 'An access port belongs to one VLAN; a trunk carries many using 802.1Q tags.'),
      l('Native VLAN 不打标签 —— 改成未使用的 VLAN 防止 VLAN Hopping。', 'The native VLAN is untagged — set it to an unused VLAN to stop VLAN hopping.'),
      l('switchport trunk allowed vlan 只放行需要的 VLAN。', 'Prune trunks with switchport trunk allowed vlan.'),
    ],
    hospital: l('同一层楼里，护士站电脑(VLAN 20)和监护仪(VLAN 40)插在同一台交换机，但二层完全隔离，监护仪被感染也无法直接扫描护士电脑。', 'On one floor the nurse PC (VLAN 20) and the monitor (VLAN 40) share a switch but are isolated at L2 — an infected monitor cannot scan the PC directly.'),
    devices: ['ACC-SW-1F', 'ACC-SW-2F', 'ACC-SW-3F', 'CORE-SW1'], vlans: [20, 40, 60],
    commands: [{ device: 'ACC-SW-2F', cmd: 'show vlan brief' }, { device: 'ACC-SW-2F', cmd: 'show interfaces trunk' }],
  },
  {
    id: 'inter-vlan', category: 'ccna', title: l('VLAN 间路由 (SVI)', 'Inter-VLAN routing (SVIs)'),
    summary: l('VLAN 之间通信必须经过三层设备；核心交换机为每个 VLAN 建一个 SVI 当网关。', 'VLANs talk only through L3; the core switch has an SVI per VLAN as the gateway.'),
    points: [
      l('interface vlan 20 + ip address 10.20.20.1 255.255.255.0 = VLAN 20 的网关。', 'interface vlan 20 + ip address 10.20.20.1/24 = the VLAN 20 gateway.'),
      l('另一种方式是单臂路由 (Router-on-a-stick) 子接口 Gi0/0.20。', 'The alternative is router-on-a-stick sub-interfaces like Gi0/0.20.'),
      l('VLAN 间路由点是放 ACL 做"东西向"访问控制的最佳位置。', 'The inter-VLAN routing point is the ideal place for east-west ACLs.'),
    ],
    hospital: l('护士站 → 电子病历要跨 VLAN 20→10。勒索剧本里，你会在 VLAN 20 的 SVI 上挂 ACL 阻断 SMB 横向移动。', 'Nurse → EHR crosses VLAN 20→10. In the ransomware drill you attach an ACL to the VLAN 20 SVI to stop SMB lateral movement.'),
    devices: ['CORE-SW1', 'WS-NURSE-03', 'SRV-EHR'],
    commands: [{ device: 'CORE-SW1', cmd: 'show ip interface brief' }, { device: 'CORE-SW1', cmd: 'show ip route' }],
  },
  {
    id: 'stp', category: 'ccna', title: l('生成树 STP / RSTP', 'Spanning Tree (STP/RSTP)'),
    summary: l('防止二层环路导致广播风暴；全院网络瘫痪最常见的"非攻击"原因之一。', 'Prevents L2 loops and broadcast storms — a classic non-malicious hospital outage.'),
    points: [
      l('选举根桥（优先级+MAC 最小）→ 各交换机选根端口 → 每段选指定端口 → 其余阻塞。', 'Elect root bridge (lowest priority+MAC) → root ports → designated ports → block the rest.'),
      l('PortFast 让接终端的口立即转发；BPDU Guard 收到 BPDU 就 err-disable。', 'PortFast forwards edge ports instantly; BPDU Guard err-disables on any BPDU.'),
      l('Root Guard 防止私接交换机抢根桥。', 'Root Guard stops a rogue switch from becoming root.'),
    ],
    hospital: l('护工把一根网线两头都插进墙口 → 没有 BPDU Guard 时整层楼的监护仪告警全部中断。', 'A cleaner plugs both ends of a cable into wall jacks → without BPDU Guard, a whole floor loses monitor alarms.'),
    devices: ['CORE-SW1', 'ACC-SW-1F', 'ACC-SW-2F', 'ACC-SW-3F'],
    commands: [{ device: 'CORE-SW1', cmd: 'show spanning-tree' }],
  },
  {
    id: 'routing', category: 'ccna', title: l('静态路由与 OSPF', 'Static routing & OSPF'),
    summary: l('路由表决定包往哪走；默认路由 0.0.0.0/0 指向互联网出口。', 'The routing table decides next hops; 0.0.0.0/0 points to the Internet.'),
    points: [
      l('最长前缀匹配优先；管理距离：直连 0、静态 1、OSPF 110。', 'Longest prefix wins; AD: connected 0, static 1, OSPF 110.'),
      l('OSPF 是链路状态协议，按带宽算 cost；单区域用 area 0。', 'OSPF is link-state, cost from bandwidth; single area = area 0.'),
      l('分院场景常用 OSPF 或 SD-WAN 动态选路。', 'Branch clinics often use OSPF or SD-WAN for dynamic path selection.'),
    ],
    hospital: l('核心交换机有一条默认路由指向防火墙 inside 口 10.0.0.1。', 'The core has a default route to the firewall inside interface 10.0.0.1.'),
    devices: ['RTR-EDGE', 'CORE-SW1', 'FW-EDGE'],
    commands: [{ device: 'CORE-SW1', cmd: 'show ip route' }, { device: 'RTR-EDGE', cmd: 'show ip route' }],
  },
  {
    id: 'dhcp', category: 'ccna', title: l('DHCP 与 DHCP 中继', 'DHCP & DHCP relay'),
    summary: l('DORA：Discover → Offer → Request → Ack 自动分配 IP。', 'DORA: Discover → Offer → Request → Ack.'),
    points: [
      l('DHCP 广播不能跨 VLAN，网关上要配 ip helper-address 指向 DHCP 服务器。', 'DHCP broadcasts do not cross VLANs — set ip helper-address on the gateway.'),
      l('DHCP Snooping 只信任上联口，阻止私接路由器发地址（流氓 DHCP）。', 'DHCP snooping trusts only uplinks, blocking rogue DHCP servers.'),
      l('医疗设备通常用 DHCP 保留地址，方便防火墙按 IP 写策略。', 'Medical devices usually get DHCP reservations so firewall rules can use IPs.'),
    ],
    hospital: l('挂号电脑开机 → 广播 Discover → 核心交换机中继到 10.10.10.10 → 获得 10.20.20.21。', 'Registration PC boots → Discover → core relays to 10.10.10.10 → gets 10.20.20.21.'),
    devices: ['WS-REG-01', 'CORE-SW1', 'SRV-AD'],
    commands: [{ device: 'WS-REG-01', cmd: 'ipconfig /all' }, { device: 'CORE-SW1', cmd: 'show running-config' }],
  },
  {
    id: 'dns', category: 'ccna', title: l('DNS 域名解析', 'DNS'),
    summary: l('把 ehr.renxin.local 这样的名字转成 IP；也是攻击者 C2 与数据外泄的常用通道。', 'Turns names like ehr.renxin.local into IPs — also a favourite C2 and exfil channel.'),
    points: [
      l('记录类型：A（IPv4）、AAAA（IPv6）、CNAME（别名）、MX（邮件）、PTR（反向）、TXT。', 'Record types: A, AAAA, CNAME, MX, PTR, TXT.'),
      l('递归 vs 迭代查询；内部 DNS 只对内网开放递归。', 'Recursive vs iterative; internal DNS offers recursion only to inside hosts.'),
      l('安全：DNS 日志进 SIEM，监控长随机子域名（DNS 隧道 / DGA）。', 'Security: log DNS to SIEM; watch for long random subdomains (tunnelling / DGA).'),
    ],
    hospital: l('勒索软件首先解析 C2 域名。若内部 DNS 接入威胁情报 (RPZ)，可以在第一步就切断。', 'Ransomware first resolves its C2 domain — an RPZ threat-intel feed on internal DNS can stop it at step one.'),
    devices: ['SRV-AD', 'WS-NURSE-03', 'DMZ-WEB'],
    commands: [{ device: 'WS-NURSE-03', cmd: 'nslookup ehr.renxin.local' }, { device: 'SRV-AD', cmd: 'Get-DnsServerResourceRecord -ZoneName renxin.local' }],
  },
  {
    id: 'nat', category: 'ccna', title: l('NAT / PAT', 'NAT / PAT'),
    summary: l('把私有地址转换成公网地址；PAT 用端口号让上千台设备共用一个公网 IP。', 'Translates private to public; PAT multiplexes thousands of hosts on one public IP via ports.'),
    points: [
      l('Inside local / inside global / outside global 四个术语要分清。', 'Know inside local / inside global / outside local / outside global.'),
      l('静态 NAT 把 DMZ 门户 172.16.50.10 映射到固定公网 IP。', 'Static NAT maps the DMZ portal 172.16.50.10 to a fixed public IP.'),
      l('NAT 不是安全措施，真正的防护靠防火墙策略。', 'NAT is not security — firewall policy is.'),
    ],
    hospital: l('访客手机 192.168.70.101 上网时，在防火墙被 PAT 成 198.51.100.10:随机端口。', 'The visitor phone is PAT-ed to 198.51.100.10:<random port> on the firewall.'),
    devices: ['FW-EDGE', 'GUEST-PHONE', 'DMZ-WEB', 'RTR-EDGE'],
    commands: [{ device: 'FW-EDGE', cmd: 'show nat' }, { device: 'FW-EDGE', cmd: 'show conn' }],
  },
  {
    id: 'acl', category: 'ccna', title: l('访问控制列表 ACL', 'Access control lists (ACLs)'),
    summary: l('按源/目的 IP、协议、端口放行或拒绝；从上往下匹配，末尾隐含 deny any。', 'Permit/deny by IP, protocol and port; top-down, implicit deny at the end.'),
    points: [
      l('标准 ACL (1-99) 只看源 IP，放在靠近目的；扩展 ACL (100-199/命名) 放在靠近源。', 'Standard ACLs (1-99) match source only — place near destination; extended ACLs near the source.'),
      l('通配符掩码：0.0.0.255 = /24。', 'Wildcard mask 0.0.0.255 = /24.'),
      l('ip access-group NAME in|out 应用到接口方向。', 'Apply with ip access-group NAME in|out.'),
    ],
    hospital: l('勒索剧本的关键一步：ip access-list extended BLOCK-SMB → deny tcp any any eq 445 → permit ip any any → 挂在 interface vlan 20 入方向。', 'Key ransomware step: ip access-list extended BLOCK-SMB → deny tcp any any eq 445 → permit ip any any → inbound on interface vlan 20.'),
    devices: ['CORE-SW1', 'FW-EDGE'],
    commands: [{ device: 'CORE-SW1', cmd: 'show access-lists' }, { device: 'FW-EDGE', cmd: 'show access-list' }],
  },
  {
    id: 'port-sec', category: 'ccna', title: l('二层安全：Port-security / DHCP Snooping / DAI', 'L2 security: port-security, DHCP snooping, DAI'),
    summary: l('在接入层挡住私接设备、MAC 泛洪和 ARP 欺骗。', 'Stop rogue devices, MAC flooding and ARP spoofing at the access layer.'),
    points: [
      l('switchport port-security maximum 1 + violation restrict。', 'switchport port-security maximum 1 + violation restrict.'),
      l('DAI 依据 DHCP Snooping 绑定表校验 ARP，阻止中间人（ARP 欺骗）。', 'DAI validates ARP against the snooping binding table — stops ARP-spoofing MITM.'),
      l('不用的口 shutdown 并放到黑洞 VLAN 999。', 'Shut unused ports and park them in black-hole VLAN 999.'),
    ],
    hospital: l('大厅墙面网口对公众可见，是物理入侵的入口。结合你做过的 ARP 欺骗实验来理解 DAI 的作用。', 'Lobby wall jacks are public — a physical entry point. Relate DAI to your ARP-spoofing lab.'),
    devices: ['ACC-SW-1F', 'ACC-SW-2F'],
    commands: [{ device: 'ACC-SW-1F', cmd: 'show port-security' }, { device: 'ACC-SW-2F', cmd: 'show interfaces status' }],
  },
  {
    id: 'syslog', category: 'ccna', title: l('Syslog / SNMP / NTP', 'Syslog, SNMP & NTP'),
    summary: l('可观测性三件套：日志、监控、统一时间。没有它们就没有取证时间线。', 'Observability trio: logs, monitoring and time. Without them there is no forensic timeline.'),
    points: [
      l('Syslog 级别 0 emergencies … 7 debugging。', 'Syslog severities 0 emergencies … 7 debugging.'),
      l('SNMPv3 支持认证和加密；v1/v2c 团体字是明文。', 'SNMPv3 supports auth + encryption; v1/v2c communities are cleartext.'),
      l('NTP 对齐所有设备时钟，DFIR 时间线才能对得上。', 'NTP aligns clocks so DFIR timelines line up.'),
    ],
    hospital: l('勒索剧本中，你会在 SIEM 上按源 IP 检索事件，还原横向移动时间线。', 'In the ransomware drill you search SIEM by source IP to rebuild the lateral-movement timeline.'),
    devices: ['SIEM-01', 'CORE-SW1', 'FW-EDGE'],
    commands: [{ device: 'SIEM-01', cmd: 'alerts' }, { device: 'CORE-SW1', cmd: 'show logging' }],
  },
  {
    id: 'qos', category: 'ccna', title: l('QoS 服务质量', 'Quality of Service'),
    summary: l('拥塞时优先保障关键流量：护士呼叫/语音 > 监护告警 > 影像 > 访客。', 'Under congestion: nurse call/voice > monitor alarms > imaging > guests.'),
    points: [
      l('分类标记 (DSCP EF=46 语音) → 排队 (LLQ) → 整形/监管。', 'Classify & mark (DSCP EF=46 for voice) → queue (LLQ) → shape/police.'),
      l('在接入层信任 IP 电话的标记，其他终端重新标记。', 'Trust IP phone markings at access; re-mark everything else.'),
    ],
    hospital: l('CT 一次推送几 GB 影像时，不能让监护仪告警延迟。', 'A multi-GB CT push must never delay monitor alarms.'),
    devices: ['ACC-SW-3F', 'IOT-CT-01', 'IOT-MON-01'],
  },
  // ───────── Wireless ─────────
  {
    id: 'ap-modes', category: 'wireless', title: l('AP 工作模式与 WLC 架构', 'AP modes & WLC architecture'),
    summary: l('瘦 AP 通过 CAPWAP 受 WLC 统一管理；同一硬件可切换 Local / Monitor / Sniffer / Bridge / FlexConnect 等模式。', 'Lightweight APs are managed by the WLC over CAPWAP; the same hardware can run Local, Monitor, Sniffer, Bridge, FlexConnect…'),
    points: [
      l('Local：正常接入用户（本院 1F/2F AP）。', 'Local: serves clients (1F/2F APs here).'),
      l('Monitor：不接入用户，专职扫描做 WIPS（本院 3F AP）。', 'Monitor: no clients, scans for WIPS (3F AP here).'),
      l('Sniffer：把 802.11 原始帧转给分析机，用于无线取证。', 'Sniffer: forwards raw 802.11 frames to an analyser for wireless forensics.'),
      l('Bridge / Mesh：楼宇之间或无布线区域的无线回传。', 'Bridge / Mesh: wireless backhaul between buildings or uncabled areas.'),
    ],
    hospital: l('Evil Twin 剧本里，正是 Monitor 模式 AP 发现了伪造热点并给出信号强度定位。', 'In the evil-twin drill, the Monitor-mode AP detects the fake hotspot and gives RSSI for location.'),
    devices: ['WLC-01', 'AP-1F-LOBBY', 'AP-2F-WARD', 'AP-3F-LAB'],
    commands: [{ device: 'WLC-01', cmd: 'show ap summary' }, { device: 'WLC-01', cmd: 'show wlan summary' }],
  },
  {
    id: 'wireless-sec', category: 'wireless', title: l('无线安全：WPA2/3、PMF、Evil Twin', 'Wireless security: WPA2/3, PMF, evil twin'),
    summary: l('企业无线用 802.1X；PMF 防 Deauth；客户端必须校验 RADIUS 证书才能防 Evil Twin。', 'Enterprise Wi-Fi uses 802.1X; PMF stops deauth; clients must validate the RADIUS cert to beat evil twins.'),
    points: [
      l('WPA2-PSK：共享密码，泄露即全网暴露；WPA3-SAE 抗离线字典攻击。', 'WPA2-PSK: one shared secret; WPA3-SAE resists offline dictionary attacks.'),
      l('802.11w (PMF) 加密管理帧，伪造 Deauth 无效。', '802.11w (PMF) protects management frames — forged deauths fail.'),
      l('Evil Twin = 同名 SSID + 更强信号 + Deauth 把用户踢过去。', 'Evil twin = same SSID + stronger signal + deauth to push users over.'),
    ],
    hospital: l('医护 PDA 的 PEAP 不校验证书 → 连上伪造热点就把域账号哈希交给了攻击者。', 'Nurse PDAs using PEAP without cert validation hand their domain hashes to the evil twin.'),
    devices: ['WLC-01', 'MOB-NURSE-LI', 'AP-3F-LAB'],
    commands: [{ device: 'WLC-01', cmd: 'show wlan id 1' }],
  },
  // ───────── Security ─────────
  {
    id: 'aaa', category: 'security', title: l('AAA、802.1X 与 RADIUS', 'AAA, 802.1X & RADIUS'),
    summary: l('认证 (Authentication)、授权 (Authorization)、审计 (Accounting)。', 'Authentication, Authorization, Accounting.'),
    points: [
      l('802.1X 三角色：Supplicant（终端）、Authenticator（交换机/WLC）、Authentication Server（RADIUS）。', '802.1X roles: supplicant, authenticator (switch/WLC), authentication server (RADIUS).'),
      l('EAP-TLS 双向证书最安全；PEAP-MSCHAPv2 依赖用户密码。', 'EAP-TLS (mutual certs) is strongest; PEAP-MSCHAPv2 relies on passwords.'),
      l('不支持 802.1X 的医疗设备用 MAB（MAC 认证）+ 动态 VLAN。', 'Devices without 802.1X use MAB + dynamic VLAN assignment.'),
    ],
    hospital: l('RADIUS 根据身份下发 VLAN：护士 → 20，输液泵 → 40，未知设备 → 隔离 VLAN。', 'RADIUS assigns VLANs by identity: nurse → 20, pump → 40, unknown → quarantine.'),
    devices: ['SRV-AD', 'WLC-01', 'ACC-SW-1F'],
  },
  {
    id: 'firewall-dmz', category: 'security', title: l('防火墙与 DMZ', 'Firewalls & the DMZ'),
    summary: l('三区模型：inside（最高信任）/ DMZ（对外服务）/ outside（不信任）。', 'Three zones: inside (trusted) / DMZ (public services) / outside (untrusted).'),
    points: [
      l('状态检测防火墙记录连接，回包自动放行。', 'Stateful firewalls track sessions and allow return traffic.'),
      l('外网只能到 DMZ，DMZ 只能按需访问内网指定端口。', 'Outside reaches only the DMZ; DMZ reaches inside only on specific ports.'),
      l('出站过滤（Egress）同样重要 —— 阻断 C2。', 'Egress filtering matters too — it blocks C2.'),
    ],
    hospital: l('患者门户在 DMZ，即使被攻破，也只能访问 EHR 的 8443 API，而不能直接 RDP 到域控。', 'The portal sits in the DMZ; even if breached it can only reach EHR:8443, not RDP to the DC.'),
    devices: ['FW-EDGE', 'DMZ-WEB', 'INTERNET'], vlans: [50],
    commands: [{ device: 'FW-EDGE', cmd: 'show access-list' }, { device: 'FW-EDGE', cmd: 'show log' }],
  },
  {
    id: 'iot-seg', category: 'security', title: l('医疗物联网 (IoMT) 分段', 'Medical IoT (IoMT) segmentation'),
    summary: l('很多医疗设备不能打补丁，只能靠网络隔离和白名单保护。', 'Many medical devices cannot be patched — network isolation and allow-lists protect them.'),
    points: [
      l('资产清单是第一步：型号、固件、MAC、IP、责任科室、是否可打补丁。', 'Inventory first: model, firmware, MAC, IP, owner, patchability.'),
      l('微分段：输液泵只允许访问 EHR:2575 和厂商更新服务器。', 'Micro-segment: pumps reach only EHR:2575 and the vendor update server.'),
      l('参考 IEC 62443 / FDA 上市后网络安全指南 / MDS2 表。', 'References: IEC 62443, FDA post-market cybersecurity guidance, MDS2 forms.'),
    ],
    hospital: l('点开输液泵、CT、摄像头看看它们的"安全属性"，对比一下风险评分。', 'Open the pump, CT and camera and compare their security attributes and risk scores.'),
    devices: ['IOT-PUMP-01', 'IOT-MON-01', 'IOT-CT-01', 'IOT-CAM-01', 'IOT-BMS-01', 'IOT-LAB-01'], vlans: [40, 60],
    commands: [{ device: 'IOT-PUMP-01', cmd: 'show info' }, { device: 'IOT-CAM-01', cmd: 'show services' }],
  },
  {
    id: 'ransomware-ir', category: 'security', title: l('勒索软件应急响应 (NIST 800-61)', 'Ransomware incident response (NIST 800-61)'),
    summary: l('准备 → 检测与分析 → 遏制 → 根除 → 恢复 → 事后总结。', 'Prepare → detect & analyse → contain → eradicate → recover → lessons learned.'),
    points: [
      l('遏制优先网络隔离而不是关机 —— 内存里有密钥和取证证据。', 'Contain by network isolation, not power-off — memory holds keys and evidence.'),
      l('阻断 C2、阻止横向移动（SMB/RDP）、保护备份。', 'Block C2, stop lateral movement (SMB/RDP), protect backups.'),
      l('从不可变备份恢复前，先确认备份时间点早于入侵时间。', 'Before restoring, make sure the snapshot predates the intrusion.'),
      l('医院要同时启动"停机应急预案"（纸质流程）保障患者安全。', 'Hospitals also trigger downtime procedures (paper workflows) for patient safety.'),
    ],
    hospital: l('进入"剧本"标签，开始"凌晨勒索"演练。', 'Open the Scenarios tab and start the "3 AM ransomware" drill.'),
    devices: ['WS-NURSE-03', 'SIEM-01', 'FW-EDGE', 'CORE-SW1', 'SRV-FILE', 'SRV-BACKUP'],
  },
  // ───────── Medical ─────────
  {
    id: 'hl7', category: 'medical', title: l('HL7 v2 / FHIR', 'HL7 v2 & FHIR'),
    summary: l('医院系统间交换临床数据的标准；HL7 v2 用 MLLP 走 TCP，通常是明文。', 'Standards for clinical data exchange; HL7 v2 runs over MLLP/TCP, usually cleartext.'),
    points: [
      l('消息由段组成：MSH（消息头）、PID（患者）、OBX（观察结果）。', 'Messages are segments: MSH (header), PID (patient), OBX (observation).'),
      l('常见消息：ADT（入出转）、ORM（医嘱）、ORU（结果）。', 'Common types: ADT (admit/transfer), ORM (orders), ORU (results).'),
      l('FHIR 是基于 REST/JSON 的新一代标准，走 HTTPS + OAuth2。', 'FHIR is the modern REST/JSON standard over HTTPS + OAuth2.'),
    ],
    hospital: l('监护仪的 OBX 段被篡改 = 病历上的生命体征被篡改，这就是医疗网络安全直接关乎患者安全的原因。', 'Tampered OBX segments from a monitor = falsified vitals in the chart — why healthcare security is patient safety.'),
    devices: ['SRV-EHR', 'IOT-PUMP-01', 'IOT-MON-01', 'IOT-LAB-01'],
    commands: [{ device: 'SRV-EHR', cmd: 'tail /var/log/hl7/inbound.log' }],
  },
  {
    id: 'dicom', category: 'medical', title: l('DICOM 与 PACS', 'DICOM & PACS'),
    summary: l('医学影像格式 + 网络协议；设备之间用 AE Title 识别身份。', 'Medical imaging format + network protocol; nodes identify by AE Title.'),
    points: [
      l('C-STORE 推送、C-FIND 查询、C-MOVE 调取。', 'C-STORE push, C-FIND query, C-MOVE retrieve.'),
      l('默认端口 104 无加密；DICOM TLS 常用 2762。', 'Port 104 is unencrypted; DICOM TLS commonly uses 2762.'),
      l('互联网上曾暴露大量未保护的 PACS —— 这是真实的数据泄露来源。', 'Many unprotected PACS have been exposed online — a real source of breaches.'),
    ],
    hospital: l('CT（VLAN 30）→ PACS（VLAN 10）只允许 TCP 104/2762。', 'CT (VLAN 30) → PACS (VLAN 10) allowed only on TCP 104/2762.'),
    devices: ['SRV-PACS', 'IOT-CT-01', 'WS-RAD-01'], vlans: [30],
    commands: [{ device: 'SRV-PACS', cmd: 'ss -tlnp' }],
  },
];

export const topicById = (id: string) => TOPICS.find((t) => t.id === id);
