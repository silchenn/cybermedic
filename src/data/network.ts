import type { Device, Flow, L10n, Link, Vlan, ZoneId } from '../types';

export const l = (zh: string, en: string): L10n => ({ zh, en });

/**
 * RenXin General Hospital (仁心综合医院) — a fictional hospital.
 * All public IPs use RFC 5737 documentation ranges (198.51.100.0/24, 203.0.113.0/24).
 */

export const ZONES: Record<ZoneId, { y: number; name: L10n; desc: L10n }> = {
  outside: { y: 0, name: l('院外 / 互联网', 'Outside / Internet'), desc: l('运营商、互联网、攻击者所在区域', 'ISP, the Internet and where attackers live') },
  b1: { y: 0, name: l('B1 数据中心', 'B1 Data Center'), desc: l('核心交换、防火墙、服务器机房与 SOC', 'Core switching, firewall, server room and SOC') },
  f1: { y: 5, name: l('1F 门诊大厅 / 急诊', '1F Lobby / ER'), desc: l('挂号、候诊、访客 Wi-Fi、安防与楼宇控制', 'Registration, waiting area, guest Wi-Fi, CCTV & building control') },
  f2: { y: 10, name: l('2F 住院病区', '2F Inpatient Ward'), desc: l('护士站、床旁监护仪、输液泵', 'Nurse station, bedside monitors, infusion pumps') },
  f3: { y: 15, name: l('3F 影像科 / 检验科', '3F Imaging / Lab'), desc: l('CT、影像工作站、检验分析仪', 'CT scanner, radiology workstation, lab analyzer') },
};

export const VLANS: Vlan[] = [
  { id: 10, name: 'SERVERS', subnet: '10.10.10.0/24', gateway: '10.10.10.1', color: '#38bdf8', purpose: l('核心业务服务器：AD/DNS/DHCP、电子病历、PACS、文件、备份、SIEM', 'Core servers: AD/DNS/DHCP, EHR, PACS, file, backup, SIEM') },
  { id: 20, name: 'CLINICAL', subnet: '10.20.20.0/24', gateway: '10.20.20.1', color: '#4ade80', purpose: l('医护人员终端（有线 + HIS-Staff 无线，802.1X）', 'Clinical staff endpoints (wired + HIS-Staff Wi-Fi, 802.1X)') },
  { id: 30, name: 'IMAGING', subnet: '10.30.30.0/24', gateway: '10.30.30.1', color: '#a78bfa', purpose: l('影像设备与影像工作站（DICOM 大流量）', 'Imaging modalities and reading workstations (heavy DICOM traffic)') },
  { id: 40, name: 'MED-IOT', subnet: '10.40.40.0/24', gateway: '10.40.40.1', color: '#f472b6', purpose: l('医疗物联网：输液泵、监护仪、检验仪，严格隔离', 'Medical IoT: pumps, monitors, analyzers — strictly isolated') },
  { id: 50, name: 'DMZ', subnet: '172.16.50.0/24', gateway: '172.16.50.1', color: '#fb923c', purpose: l('对外服务区：患者门户网站，挂在防火墙 DMZ 口', 'Public-facing services: patient portal on the firewall DMZ leg') },
  { id: 60, name: 'FACILITY', subnet: '10.60.60.0/24', gateway: '10.60.60.1', color: '#facc15', purpose: l('楼宇系统：摄像头、空调/BMS 控制器', 'Facilities: CCTV cameras, HVAC/BMS controllers') },
  { id: 70, name: 'GUEST', subnet: '192.168.70.0/24', gateway: '192.168.70.1', color: '#94a3b8', purpose: l('访客/患者 Wi-Fi，只允许上互联网', 'Guest/patient Wi-Fi — Internet only') },
  { id: 99, name: 'MGMT', subnet: '10.99.99.0/24', gateway: '10.99.99.1', color: '#22d3ee', purpose: l('网络设备管理网：交换机、AP、WLC 的带内管理', 'In-band management for switches, APs and the WLC') },
];

export const vlanById = (id?: number) => VLANS.find((v) => v.id === id);

const sev = (severity: 'critical' | 'high' | 'medium' | 'low', text: L10n, fix: L10n) => ({ severity, text, fix });

export const DEVICES: Device[] = [
  // ───────────── Outside ─────────────
  {
    id: 'INTERNET', kind: 'internet', name: l('互联网', 'Internet'), model: '—', os: '—', zone: 'outside', pos: [-44, -2],
    room: l('院外', 'Outside'), role: l('公网，承载患者门户访问、云服务与潜在攻击流量', 'Public network: patient-portal traffic, cloud services and potential attacks'),
    cli: 'none', risk: 0, issues: [], controls: [], topics: ['nat', 'firewall-dmz'],
  },
  {
    id: 'ATTACKER', kind: 'attacker', name: l('攻击者 C2 服务器', 'Attacker C2 server'), model: 'VPS (unknown)', os: 'Linux', ip: '203.0.113.66', zone: 'outside', pos: [-52, 10],
    room: l('境外 VPS', 'Offshore VPS'), role: l('勒索团伙的命令与控制（C2）服务器', 'Ransomware crew command-and-control (C2) server'),
    cli: 'none', risk: 100, issues: [], controls: [], hidden: true, topics: ['ransomware-ir'],
  },
  // ───────────── B1 Data center ─────────────
  {
    id: 'RTR-EDGE', kind: 'router', name: l('边界路由器', 'Edge router'), model: 'ISR 4331 (sim)', os: 'IOS-XE 17.9 (sim)', ip: '198.51.100.2', mac: '00:1a:2b:00:00:01', zone: 'b1', pos: [-17, -8],
    room: l('B1 机房 A01 机柜', 'B1 server room, rack A01'), role: l('连接运营商专线，做默认路由与 NAT 前的上联', 'Terminates the ISP circuit, holds the default route'),
    cli: 'ios', services: ['SSH 22', 'NTP 123'], risk: 35,
    issues: [sev('medium', l('SNMP 使用 v2c 团体字 "public"', 'SNMP v2c with community "public"'), l('改用 SNMPv3 authPriv 并限制源地址', 'Move to SNMPv3 authPriv and restrict sources'))],
    controls: [l('仅允许管理网 SSH', 'SSH from MGMT only'), l('配置 uRPF 防源地址欺骗', 'uRPF against spoofing')], topics: ['routing', 'nat'],
  },
  {
    id: 'FW-EDGE', kind: 'firewall', name: l('边界防火墙', 'Edge firewall'), model: 'NGFW-2100 (sim)', os: 'FW-OS 9.2 (sim)', ip: '10.0.0.1', mac: '00:1a:2b:00:00:02', zone: 'b1', pos: [-11, -8],
    room: l('B1 机房 A01 机柜', 'B1 server room, rack A01'), role: l('内网 / DMZ / 外网三区隔离，NAT/PAT，出站过滤', 'Inside / DMZ / outside segmentation, NAT/PAT, egress filtering'),
    cli: 'firewall', services: ['HTTPS mgmt 443', 'SSH 22'], risk: 30,
    issues: [sev('high', l('出站策略为 permit any any，C2 外联不会被拦截', 'Outbound policy is permit any any — C2 beacons are not blocked'), l('默认拒绝出站，按业务白名单放行，接入威胁情报', 'Default-deny egress, allow-list by business need, add threat intel'))],
    controls: [l('DMZ 只允许 443 入站', 'DMZ allows only 443 inbound'), l('日志发送到 SIEM', 'Logs shipped to SIEM')], topics: ['firewall-dmz', 'nat', 'acl'],
  },
  {
    id: 'DMZ-WEB', kind: 'server', name: l('患者门户网站', 'Patient portal'), model: 'VM', os: 'Ubuntu 22.04', ip: '172.16.50.10', mac: '00:50:56:00:50:10', vlan: 50, zone: 'b1', pos: [-11, 1],
    room: l('B1 机房 A02 虚拟化集群', 'B1 server room, rack A02 (VM cluster)'), role: l('患者预约挂号、查看报告，经 API 访问电子病历', 'Appointments & reports for patients; calls the EHR API'),
    cli: 'linux', services: ['HTTPS 443', 'SSH 22'], risk: 55,
    issues: [sev('high', l('面向公网，Web 漏洞直接暴露', 'Internet-facing: any web bug is directly exposed'), l('WAF、及时打补丁、最小权限 API 账号', 'WAF, fast patching, least-privilege API account'))],
    controls: [l('只能经防火墙访问 EHR 的 8443 端口', 'May reach EHR only on 8443 via the firewall')], topics: ['firewall-dmz', 'dns'],
  },
  {
    id: 'CORE-SW1', kind: 'l3switch', name: l('核心三层交换机', 'Core L3 switch'), model: 'Catalyst 9500 (sim)', os: 'IOS-XE 17.9 (sim)', ip: '10.99.99.1', mac: '00:1a:2b:00:01:00', zone: 'b1', pos: [-4, -4],
    room: l('B1 机房 A03 机柜', 'B1 server room, rack A03'), role: l('全院 VLAN 间路由（SVI）、DHCP 中继、汇聚各楼层接入交换机', 'Inter-VLAN routing (SVIs), DHCP relay, aggregates every floor'),
    cli: 'ios', services: ['SSH 22', 'SNMPv3', 'Syslog→SIEM'], risk: 25,
    issues: [sev('medium', l('VLAN 20（医护）到服务器区的 SMB 445 未做限制', 'SMB 445 from VLAN 20 (clinical) to servers is unrestricted'), l('用扩展 ACL 只放行业务必需端口', 'Use extended ACLs to allow only required ports'))],
    controls: [l('根桥优先级 4096，防止 STP 被劫持', 'STP root priority 4096 to prevent root hijack'), l('DHCP Snooping 信任上联口', 'DHCP snooping trusts uplinks only')],
    topics: ['vlan', 'inter-vlan', 'stp', 'dhcp', 'acl', 'syslog'],
  },
  {
    id: 'WLC-01', kind: 'wlc', name: l('无线控制器', 'Wireless LAN controller'), model: 'Catalyst 9800-L (sim)', os: 'IOS-XE 17.9 (sim)', ip: '10.99.99.5', mac: '00:1a:2b:00:02:00', vlan: 99, zone: 'b1', pos: [-4, 5],
    room: l('B1 机房 A03 机柜', 'B1 server room, rack A03'), role: l('集中管理全部瘦 AP，下发 SSID，运行 WIPS 流氓 AP 检测', 'Manages every lightweight AP, pushes SSIDs, runs WIPS rogue detection'),
    cli: 'wlc', services: ['CAPWAP 5246/5247', 'HTTPS 443', 'RADIUS client'], risk: 30,
    issues: [sev('high', l('HIS-Staff SSID 未强制 PMF（802.11w），易被 Deauth 踢线', 'HIS-Staff does not enforce PMF (802.11w) — deauth floods work'), l('security pmf mandatory，并启用 WPA3/802.1X', 'Set PMF mandatory and use WPA3/802.1X'))],
    controls: [l('SSID: HIS-Staff (802.1X) / Med-IoT (PSK+MAB) / Guest (Portal)', 'SSIDs: HIS-Staff (802.1X) / Med-IoT (PSK+MAB) / Guest (portal)')], topics: ['ap-modes', 'wireless-sec', 'aaa'],
  },
  {
    id: 'SRV-AD', kind: 'server', name: l('域控 / DNS / DHCP', 'Domain controller / DNS / DHCP'), model: 'VM', os: 'Windows Server 2022', ip: '10.10.10.10', mac: '00:50:56:00:10:10', vlan: 10, zone: 'b1', pos: [2, -9],
    room: l('B1 机房 A04 机柜', 'B1 server room, rack A04'), role: l('身份认证（Kerberos）、内部 DNS 解析、各 VLAN 的 DHCP 地址池、RADIUS (NPS)', 'Kerberos auth, internal DNS, DHCP scopes for every VLAN, RADIUS (NPS)'),
    cli: 'winserver', services: ['DNS 53', 'Kerberos 88', 'LDAP 389', 'SMB 445', 'DHCP 67', 'RADIUS 1812'], risk: 60,
    issues: [sev('critical', l('攻下域控 = 攻下全院，是勒索团伙的首要目标', 'Owning the DC = owning the hospital; top ransomware target'), l('分层管理（Tier 0）、LAPS、禁用 NTLMv1、监控 4624/4672', 'Tiered admin (Tier 0), LAPS, disable NTLMv1, monitor 4624/4672'))],
    controls: [l('仅允许跳板机 RDP', 'RDP only from the jump host')], topics: ['dns', 'dhcp', 'aaa'],
  },
  {
    id: 'SRV-EHR', kind: 'server', name: l('电子病历系统 (HIS/EHR)', 'EHR / HIS server'), model: 'VM cluster', os: 'RHEL 9', ip: '10.10.10.20', mac: '00:50:56:00:10:20', vlan: 10, zone: 'b1', pos: [6, -9],
    room: l('B1 机房 A04 机柜', 'B1 server room, rack A04'), role: l('全院核心业务：医嘱、病历、HL7 接口引擎', 'Hospital core: orders, records, HL7 interface engine'),
    cli: 'linux', services: ['HTTPS 443', 'API 8443', 'HL7/MLLP 2575', 'PostgreSQL 5432'], risk: 45,
    issues: [sev('high', l('HL7 v2 (MLLP) 明文传输患者数据', 'HL7 v2 over MLLP carries PHI in cleartext'), l('MLLP over TLS 或 IPsec，并限制只允许 Med-IoT 网段', 'MLLP over TLS or IPsec; allow only the Med-IoT subnet'))],
    controls: [l('数据库仅本机监听', 'DB listens on localhost only')], topics: ['hl7', 'inter-vlan'],
  },
  {
    id: 'SRV-PACS', kind: 'server', name: l('影像归档系统 PACS', 'PACS (imaging archive)'), model: 'Storage server', os: 'Ubuntu 22.04', ip: '10.10.10.30', mac: '00:50:56:00:10:30', vlan: 10, zone: 'b1', pos: [10, -9],
    room: l('B1 机房 A05 机柜', 'B1 server room, rack A05'), role: l('存储 CT/MR/DR 影像，DICOM 协议收发', 'Stores CT/MR/X-ray studies; speaks DICOM'),
    cli: 'linux', services: ['DICOM 104', 'DICOM-TLS 2762', 'HTTPS 443'], risk: 50,
    issues: [sev('high', l('DICOM 104 端口未认证，任意 AE Title 都能查询', 'DICOM 104 is unauthenticated — any AE title can query'), l('AE Title 白名单 + DICOM TLS 2762', 'AE-title allow-list + DICOM TLS on 2762'))],
    controls: [], topics: ['dicom'],
  },
  {
    id: 'SRV-FILE', kind: 'server', name: l('文件服务器', 'File server'), model: 'VM', os: 'Windows Server 2019', ip: '10.10.10.40', mac: '00:50:56:00:10:40', vlan: 10, zone: 'b1', pos: [14, -9],
    room: l('B1 机房 A05 机柜', 'B1 server room, rack A05'), role: l('科室共享盘、排班表、监控录像', 'Department shares, rosters, CCTV recordings'),
    cli: 'winserver', services: ['SMB 445', 'RTSP ingest 554'], risk: 65,
    issues: [sev('critical', l('全院用户可写的共享盘，勒索软件最爱', 'Hospital-wide writable shares — ransomware heaven'), l('最小权限共享、FSRM 文件屏蔽、限制 SMB 来源', 'Least-privilege shares, FSRM screening, restrict SMB sources'))],
    controls: [], topics: ['ransomware-ir', 'acl'],
  },
  {
    id: 'SRV-BACKUP', kind: 'server', name: l('不可变备份服务器', 'Immutable backup server'), model: 'Backup appliance', os: 'Hardened Linux', ip: '10.10.10.50', mac: '00:50:56:00:10:50', vlan: 10, zone: 'b1', pos: [14, 4],
    room: l('B1 机房 A06 机柜（独立管理凭据）', 'B1 server room, rack A06 (separate credentials)'), role: l('每晚快照，WORM 不可变存储，另有离线磁带副本（3-2-1 原则）', 'Nightly snapshots on WORM storage plus offline tape (3-2-1 rule)'),
    cli: 'linux', services: ['Backup agent 10000', 'SSH 22 (MFA)'], risk: 20,
    issues: [sev('low', l('恢复演练频率仅每季度一次', 'Restore drills only quarterly'), l('每月演练并记录 RTO/RPO', 'Monthly drills; record RTO/RPO'))],
    controls: [l('不加入域，独立 MFA 账号', 'Not domain-joined; separate MFA account'), l('快照保留期内不可删除', 'Snapshots cannot be deleted within retention')], topics: ['ransomware-ir'],
  },
  {
    id: 'SIEM-01', kind: 'siem', name: l('SIEM / SOC 控制台', 'SIEM / SOC console'), model: 'SIEM (sim)', os: 'SIEM 4.x (sim)', ip: '10.10.10.60', mac: '00:50:56:00:10:60', vlan: 10, zone: 'b1', pos: [8, 4],
    room: l('B1 安全运营中心', 'B1 Security Operations Center'), role: l('汇总全院日志（Syslog、Windows 事件、防火墙、EDR），关联分析告警', 'Aggregates syslog, Windows events, firewall and EDR; correlates alerts'),
    cli: 'siem', services: ['Syslog 514', 'HTTPS 443'], risk: 15, issues: [], controls: [l('时钟统一 NTP，便于时间线分析', 'NTP-synced clocks for timeline analysis')], topics: ['syslog', 'ransomware-ir'],
  },
  // ───────────── 1F Lobby / ER ─────────────
  {
    id: 'ACC-SW-1F', kind: 'switch', name: l('1F 接入交换机', '1F access switch'), model: 'Catalyst 9200 (sim)', os: 'IOS-XE 17.9 (sim)', ip: '10.99.99.11', mac: '00:1a:2b:00:11:00', zone: 'f1', pos: [-17, -8],
    room: l('1F 弱电间 IDF-1', '1F wiring closet IDF-1'), role: l('门诊大厅、挂号处、安防设备接入', 'Access for lobby, registration and CCTV'),
    cli: 'ios', services: ['SSH 22'], risk: 30,
    issues: [sev('medium', l('大厅墙面网口未启用 802.1X，任何人插上就能进 VLAN 20', 'Lobby wall jacks lack 802.1X — anyone can plug into VLAN 20'), l('启用 802.1X/MAB，未用端口 shutdown 并放入黑洞 VLAN', 'Enable 802.1X/MAB; shut unused ports into a black-hole VLAN'))],
    controls: [l('Port-security 限制 MAC 数量', 'Port-security limits MAC count'), l('BPDU Guard 开启', 'BPDU Guard enabled')], topics: ['vlan', 'port-sec', 'stp'],
  },
  {
    id: 'AP-1F-LOBBY', kind: 'ap', name: l('1F 大厅 AP', '1F lobby AP'), model: 'Catalyst 9120 (sim)', os: 'AP-OS (sim)', ip: '10.99.99.21', mac: '00:1a:2b:00:21:00', vlan: 99, zone: 'f1', pos: [0, 0], lift: 3,
    room: l('1F 候诊大厅吊顶', '1F waiting hall ceiling'), role: l('Local 模式瘦 AP，广播 HIS-Staff / Guest，兼做 WIPS 探测', 'Local-mode lightweight AP: HIS-Staff / Guest, also feeds WIPS'),
    cli: 'none', services: ['CAPWAP → WLC'], risk: 25, issues: [], controls: [l('通过 CAPWAP 隧道受 WLC 管理', 'Managed by the WLC through CAPWAP')], topics: ['ap-modes', 'wireless-sec'],
  },
  {
    id: 'WS-REG-01', kind: 'workstation', name: l('挂号处电脑', 'Registration PC'), model: 'Desktop', os: 'Windows 11', ip: '10.20.20.21', mac: '3c:52:82:00:20:21', vlan: 20, zone: 'f1', pos: [-7, 6],
    room: l('1F 挂号收费窗口 3 号', '1F registration desk #3'), role: l('挂号、收费、打印病历条码', 'Registration, billing, label printing'),
    cli: 'windows', services: ['RDP 3389 (disabled)'], risk: 45,
    issues: [sev('medium', l('多人共用一个登录账号', 'Shared login used by many staff'), l('工牌刷卡 + 快速切换个人账号（SSO）', 'Badge tap + fast user switching (SSO)'))],
    controls: [l('EDR 已安装', 'EDR installed')], topics: ['dhcp', 'dns'],
  },
  {
    id: 'IOT-CAM-01', kind: 'iot', name: l('大厅监控摄像头', 'Lobby IP camera'), model: 'IPC-4MP (sim)', os: 'Embedded Linux 3.10', ip: '10.60.60.20', mac: 'a4:14:37:00:60:20', vlan: 60, zone: 'f1', pos: [13, -9], lift: 2.6,
    room: l('1F 大厅东侧墙角', '1F lobby, east corner'), role: l('视频监控，录像推送到文件服务器', 'CCTV; streams recordings to the file server'),
    cli: 'embedded', services: ['RTSP 554', 'HTTP 80', 'Telnet 23'], risk: 85,
    issues: [
      sev('critical', l('出厂默认密码 admin/admin 未修改', 'Factory default admin/admin still set'), l('修改强密码，纳入资产与密码管理', 'Set a strong password; track in asset/password management')),
      sev('high', l('Telnet 23 端口开放', 'Telnet 23 open'), l('关闭 Telnet，仅允许 VMS 服务器访问', 'Disable Telnet; allow only the VMS server')),
    ],
    controls: [l('处于 FACILITY VLAN，不能访问医疗网段', 'In FACILITY VLAN; cannot reach clinical subnets')], topics: ['iot-seg', 'vlan'],
  },
  {
    id: 'IOT-BMS-01', kind: 'iot', name: l('楼宇空调控制器 (BMS)', 'HVAC / BMS controller'), model: 'BMS-PLC (sim)', os: 'RTOS', ip: '10.60.60.30', mac: '00:80:f4:00:60:30', vlan: 60, zone: 'f1', pos: [16, 7],
    room: l('1F 设备间', '1F plant room'), role: l('控制手术室与机房的温湿度、负压病房', 'Controls OR and server-room climate, negative-pressure rooms'),
    cli: 'embedded', services: ['BACnet 47808', 'MQTT→vendor 8883'], risk: 75,
    issues: [sev('high', l('厂商云远程维护通道常开', 'Vendor cloud remote-maintenance tunnel always on'), l('改为按需开启 + 跳板审计 + MFA', 'On-demand access through an audited jump host with MFA'))],
    controls: [], topics: ['iot-seg', 'firewall-dmz'],
  },
  {
    id: 'GUEST-PHONE', kind: 'phone', name: l('访客手机', 'Visitor phone'), model: 'Smartphone', os: 'Android 15', ip: '192.168.70.101', mac: 'da:a1:19:70:01:01', vlan: 70, zone: 'f1', pos: [5, 7],
    room: l('1F 候诊区', '1F waiting area'), role: l('连接 Guest SSID 的患者家属手机', 'A patient relative on the Guest SSID'),
    cli: 'none', risk: 10, issues: [], controls: [l('客户端隔离 + 仅允许互联网', 'Client isolation + Internet only')], topics: ['nat', 'wireless-sec'],
  },
  {
    id: 'ROGUE-AP', kind: 'rogue', name: l('伪造热点 (Evil Twin)', 'Rogue AP (Evil Twin)'), model: 'Travel router / Pineapple-like', os: 'OpenWrt', ip: '192.168.4.1', mac: '02:de:ad:be:ef:01', zone: 'f1', pos: [9, 10],
    room: l('1F 候诊区座椅下的背包', '1F waiting area, backpack under a seat'), role: l('攻击者伪造的同名 HIS-Staff 热点，用来窃取医护的域账号', 'Attacker-run HIS-Staff look-alike that harvests staff domain credentials'),
    cli: 'none', risk: 100, issues: [], controls: [], hidden: true, topics: ['wireless-sec', 'ap-modes'],
  },
  // ───────────── 2F Ward ─────────────
  {
    id: 'ACC-SW-2F', kind: 'switch', name: l('2F 接入交换机', '2F access switch'), model: 'Catalyst 9200 (sim)', os: 'IOS-XE 17.9 (sim)', ip: '10.99.99.12', mac: '00:1a:2b:00:12:00', zone: 'f2', pos: [-17, -8],
    room: l('2F 弱电间 IDF-2', '2F wiring closet IDF-2'), role: l('护士站、床旁监护仪接入', 'Access for the nurse station and bedside monitors'),
    cli: 'ios', services: ['SSH 22'], risk: 25, issues: [], controls: [l('DHCP Snooping + DAI 防 ARP 欺骗', 'DHCP snooping + DAI against ARP spoofing')], topics: ['vlan', 'port-sec'],
  },
  {
    id: 'AP-2F-WARD', kind: 'ap', name: l('2F 病区 AP', '2F ward AP'), model: 'Catalyst 9120 (sim)', os: 'AP-OS (sim)', ip: '10.99.99.22', mac: '00:1a:2b:00:22:00', vlan: 99, zone: 'f2', pos: [2, 0], lift: 3,
    room: l('2F 走廊吊顶', '2F corridor ceiling'), role: l('病区覆盖：HIS-Staff 与 Med-IoT 两个 SSID', 'Ward coverage: HIS-Staff and Med-IoT SSIDs'),
    cli: 'none', services: ['CAPWAP → WLC'], risk: 25, issues: [], controls: [], topics: ['ap-modes'],
  },
  {
    id: 'WS-NURSE-03', kind: 'workstation', name: l('护士站电脑 03', 'Nurse station PC 03'), model: 'All-in-one', os: 'Windows 10 22H2', ip: '10.20.20.53', mac: '3c:52:82:00:20:53', vlan: 20, zone: 'f2', pos: [-7, 4],
    room: l('2F 护士站', '2F nurse station'), role: l('查看医嘱、记录护理、收发邮件', 'Orders, nursing notes, e-mail'),
    cli: 'windows', services: [], risk: 60,
    issues: [
      sev('high', l('Windows 10 已停止支持，补丁滞后', 'Windows 10 is end-of-support; patches lag'), l('升级 Windows 11 或纳入 ESU', 'Upgrade to Windows 11 or enrol in ESU')),
      sev('medium', l('护士用此机收发外部邮件 —— 钓鱼入口', 'Used for external e-mail — phishing entry point'), l('邮件网关沙箱 + 宏禁用 + 安全意识培训', 'Mail sandbox, macros disabled, awareness training')),
    ],
    controls: [l('EDR 已安装', 'EDR installed')], topics: ['ransomware-ir', 'dns', 'dhcp'],
  },
  {
    id: 'MOB-NURSE-LI', kind: 'phone', name: l('李护士的手持 PDA', 'Nurse Li\'s handheld'), model: 'Clinical handheld', os: 'Android 13', ip: '10.20.20.88', mac: '6c:2f:8a:00:20:88', vlan: 20, zone: 'f2', pos: [0, 7],
    room: l('2F 病房 205', '2F room 205'), role: l('床旁扫码给药，连接 HIS-Staff（PEAP 域账号）', 'Bedside barcode medication; on HIS-Staff (PEAP domain login)'),
    cli: 'none', risk: 40,
    issues: [sev('high', l('PEAP 未校验服务器证书 —— 连到伪造热点会泄露账号', 'PEAP does not validate the server certificate — leaks creds to an evil twin'), l('MDM 下发 RADIUS CA 并强制校验，或改用 EAP-TLS', 'Push the RADIUS CA via MDM and enforce validation, or move to EAP-TLS'))],
    controls: [], topics: ['wireless-sec', 'aaa'],
  },
  {
    id: 'IOT-PUMP-01', kind: 'iot', name: l('智能输液泵', 'Smart infusion pump'), model: 'MediFlow IP-500 (fictional)', os: 'RTOS 4.2', ip: '10.40.40.31', mac: '00:0b:ab:00:40:31', vlan: 40, zone: 'f2', pos: [8, 6],
    room: l('2F 病房 206 床旁', '2F room 206, bedside'), role: l('按药物库自动控制输液速度，通过 Wi-Fi 回传 HL7 到 EHR', 'Drug-library-driven infusion; sends HL7 to the EHR over Wi-Fi'),
    cli: 'embedded', services: ['HL7 out 2575', 'Telnet 23 (service)', 'HTTP 80'], risk: 80,
    issues: [
      sev('critical', l('药物库更新接口无认证 —— 可被篡改剂量上限', 'Drug-library update interface is unauthenticated — dose limits could be altered'), l('隔离 + 只允许厂商服务器 IP + 固件升级', 'Isolate, allow only the vendor server IP, update firmware')),
      sev('high', l('维修 Telnet 口开放', 'Service Telnet port open'), l('交换机/无线 ACL 阻断 23 端口', 'Block port 23 with switch/WLAN ACLs')),
    ],
    controls: [l('Med-IoT VLAN 只能访问 EHR 的 2575 端口', 'Med-IoT may only reach EHR:2575')], topics: ['iot-seg', 'hl7'],
  },
  {
    id: 'IOT-MON-01', kind: 'iot', name: l('床旁监护仪', 'Bedside patient monitor'), model: 'VitalView M8 (fictional)', os: 'Embedded Linux', ip: '10.40.40.32', mac: '00:09:fb:00:40:32', vlan: 40, zone: 'f2', pos: [12, 6],
    room: l('2F 病房 207 床旁', '2F room 207, bedside'), role: l('心电、血氧、血压实时监测，报警推送护士站', 'ECG, SpO₂, NIBP monitoring; alarms to the nurse station'),
    cli: 'embedded', services: ['HL7 out 2575', 'Vendor 24105'], risk: 70,
    issues: [sev('high', l('使用 Windows XP Embedded 的中央站无法打补丁', 'Central station runs unpatched XP Embedded'), l('网络隔离 + 虚拟补丁（IPS）', 'Network isolation + virtual patching (IPS)'))],
    controls: [], topics: ['iot-seg', 'hl7'],
  },
  // ───────────── 3F Imaging / Lab ─────────────
  {
    id: 'ACC-SW-3F', kind: 'switch', name: l('3F 接入交换机', '3F access switch'), model: 'Catalyst 9300 (sim)', os: 'IOS-XE 17.9 (sim)', ip: '10.99.99.13', mac: '00:1a:2b:00:13:00', zone: 'f3', pos: [-17, -8],
    room: l('3F 弱电间 IDF-3', '3F wiring closet IDF-3'), role: l('影像科、检验科接入，万兆上联满足 DICOM 大文件', 'Imaging and lab access; 10G uplink for large DICOM studies'),
    cli: 'ios', services: ['SSH 22'], risk: 25, issues: [], controls: [l('QoS 区分影像与实时语音', 'QoS separates imaging from real-time voice')], topics: ['vlan', 'qos'],
  },
  {
    id: 'AP-3F-LAB', kind: 'ap', name: l('3F 检验科 AP', '3F lab AP'), model: 'Catalyst 9120 (sim)', os: 'AP-OS (sim)', ip: '10.99.99.23', mac: '00:1a:2b:00:23:00', vlan: 99, zone: 'f3', pos: [2, 0], lift: 3,
    room: l('3F 走廊吊顶', '3F corridor ceiling'), role: l('Monitor 模式：不接入用户，专职扫描信道做 WIPS', 'Monitor mode: serves no clients, scans channels for WIPS'),
    cli: 'none', services: ['CAPWAP → WLC'], risk: 15, issues: [], controls: [], topics: ['ap-modes', 'wireless-sec'],
  },
  {
    id: 'WS-RAD-01', kind: 'workstation', name: l('影像诊断工作站', 'Radiology reading workstation'), model: 'Workstation', os: 'Windows 11', ip: '10.30.30.21', mac: '3c:52:82:00:30:21', vlan: 30, zone: 'f3', pos: [0, -7],
    room: l('3F 读片室', '3F reading room'), role: l('从 PACS 调阅影像，出具诊断报告', 'Pulls studies from PACS, writes reports'),
    cli: 'windows', services: [], risk: 40, issues: [], controls: [l('EDR 已安装', 'EDR installed')], topics: ['dicom'],
  },
  {
    id: 'IOT-CT-01', kind: 'iot', name: l('CT 扫描仪', 'CT scanner'), model: 'OmniScan 128 (fictional)', os: 'Windows 7 Embedded', ip: '10.30.30.40', mac: '00:21:5a:00:30:40', vlan: 30, zone: 'f3', pos: [9, -4],
    room: l('3F CT 检查室', '3F CT suite'), role: l('采集影像后以 DICOM C-STORE 推送到 PACS', 'Acquires images and C-STOREs them to PACS'),
    cli: 'embedded', services: ['DICOM 104', 'SMB 445 (vendor)'], risk: 80,
    issues: [sev('critical', l('Windows 7 嵌入式系统，厂商不允许打补丁（医疗器械认证）', 'Windows 7 Embedded; vendor forbids patching (regulatory certification)'), l('严格 ACL：只允许与 PACS 通信，禁止 SMB 出站', 'Strict ACL: PACS only, no outbound SMB'))],
    controls: [], topics: ['dicom', 'iot-seg'],
  },
  {
    id: 'IOT-LAB-01', kind: 'iot', name: l('生化分析仪', 'Chemistry analyzer'), model: 'ChemPro 900 (fictional)', os: 'Embedded Linux', ip: '10.40.40.45', mac: '00:1c:c4:00:40:45', vlan: 40, zone: 'f3', pos: [13, 6],
    room: l('3F 检验科', '3F clinical lab'), role: l('样本检测结果通过 HL7 ORU 消息回传 EHR', 'Sends results to the EHR as HL7 ORU messages'),
    cli: 'embedded', services: ['HL7 out 2575'], risk: 55, issues: [], controls: [], topics: ['hl7', 'iot-seg'],
  },
];

export const deviceById = (id: string) => DEVICES.find((d) => d.id === id);

export const LINKS: Link[] = [
  { id: 'L-wan', a: 'INTERNET', b: 'RTR-EDGE', bPort: 'Gi0/0/0', kind: 'wan' },
  { id: 'L-c2', a: 'ATTACKER', b: 'INTERNET', kind: 'wan', hidden: true },
  { id: 'L-rtr-fw', a: 'RTR-EDGE', b: 'FW-EDGE', aPort: 'Gi0/0/1', bPort: 'outside', kind: 'uplink' },
  { id: 'L-fw-core', a: 'FW-EDGE', b: 'CORE-SW1', aPort: 'inside', bPort: 'Gi1/0/1', kind: 'uplink' },
  { id: 'L-fw-dmz', a: 'FW-EDGE', b: 'DMZ-WEB', aPort: 'dmz', kind: 'access', vlan: 50 },
  { id: 'L-core-wlc', a: 'CORE-SW1', b: 'WLC-01', aPort: 'Gi1/0/2', bPort: 'Te0/1/0', kind: 'trunk' },
  { id: 'L-core-ad', a: 'CORE-SW1', b: 'SRV-AD', aPort: 'Gi1/0/10', kind: 'access', vlan: 10 },
  { id: 'L-core-ehr', a: 'CORE-SW1', b: 'SRV-EHR', aPort: 'Gi1/0/11', kind: 'access', vlan: 10 },
  { id: 'L-core-pacs', a: 'CORE-SW1', b: 'SRV-PACS', aPort: 'Gi1/0/12', kind: 'access', vlan: 10 },
  { id: 'L-core-file', a: 'CORE-SW1', b: 'SRV-FILE', aPort: 'Gi1/0/13', kind: 'access', vlan: 10 },
  { id: 'L-core-bak', a: 'CORE-SW1', b: 'SRV-BACKUP', aPort: 'Gi1/0/14', kind: 'access', vlan: 10 },
  { id: 'L-core-siem', a: 'CORE-SW1', b: 'SIEM-01', aPort: 'Gi1/0/15', kind: 'access', vlan: 10 },
  { id: 'L-core-1f', a: 'CORE-SW1', b: 'ACC-SW-1F', aPort: 'Te1/1/1', bPort: 'Te1/1/1', kind: 'trunk' },
  { id: 'L-core-2f', a: 'CORE-SW1', b: 'ACC-SW-2F', aPort: 'Te1/1/2', bPort: 'Te1/1/1', kind: 'trunk' },
  { id: 'L-core-3f', a: 'CORE-SW1', b: 'ACC-SW-3F', aPort: 'Te1/1/3', bPort: 'Te1/1/1', kind: 'trunk' },
  // 1F
  { id: 'L-1f-ap', a: 'ACC-SW-1F', b: 'AP-1F-LOBBY', aPort: 'Gi1/0/1', kind: 'access', vlan: 99 },
  { id: 'L-1f-reg', a: 'ACC-SW-1F', b: 'WS-REG-01', aPort: 'Gi1/0/5', kind: 'access', vlan: 20 },
  { id: 'L-1f-cam', a: 'ACC-SW-1F', b: 'IOT-CAM-01', aPort: 'Gi1/0/20', kind: 'access', vlan: 60 },
  { id: 'L-1f-bms', a: 'ACC-SW-1F', b: 'IOT-BMS-01', aPort: 'Gi1/0/21', kind: 'access', vlan: 60 },
  { id: 'L-1f-guest', a: 'AP-1F-LOBBY', b: 'GUEST-PHONE', kind: 'wireless', vlan: 70 },
  // 2F
  { id: 'L-2f-ap', a: 'ACC-SW-2F', b: 'AP-2F-WARD', aPort: 'Gi1/0/1', kind: 'access', vlan: 99 },
  { id: 'L-2f-nurse', a: 'ACC-SW-2F', b: 'WS-NURSE-03', aPort: 'Gi1/0/12', kind: 'access', vlan: 20 },
  { id: 'L-2f-mon', a: 'ACC-SW-2F', b: 'IOT-MON-01', aPort: 'Gi1/0/31', kind: 'access', vlan: 40 },
  { id: 'L-2f-pump', a: 'AP-2F-WARD', b: 'IOT-PUMP-01', kind: 'wireless', vlan: 40 },
  { id: 'L-2f-pda', a: 'AP-2F-WARD', b: 'MOB-NURSE-LI', kind: 'wireless', vlan: 20 },
  { id: 'L-rogue-pda', a: 'ROGUE-AP', b: 'MOB-NURSE-LI', kind: 'wireless', hidden: true },
  // 3F
  { id: 'L-3f-ap', a: 'ACC-SW-3F', b: 'AP-3F-LAB', aPort: 'Gi1/0/1', kind: 'access', vlan: 99 },
  { id: 'L-3f-rad', a: 'ACC-SW-3F', b: 'WS-RAD-01', aPort: 'Gi1/0/5', kind: 'access', vlan: 30 },
  { id: 'L-3f-ct', a: 'ACC-SW-3F', b: 'IOT-CT-01', aPort: 'Gi1/0/10', kind: 'access', vlan: 30 },
  { id: 'L-3f-lab', a: 'ACC-SW-3F', b: 'IOT-LAB-01', aPort: 'Gi1/0/15', kind: 'access', vlan: 40 },
];

export const FLOWS: Flow[] = [
  { id: 'F-ehr', from: 'WS-NURSE-03', to: 'SRV-EHR', protocol: 'HTTPS', port: 'TCP 443', label: l('护士站访问电子病历（跨 VLAN 20→10，由核心 SVI 路由）', 'Nurse station → EHR (VLAN 20→10, routed by core SVIs)'), topic: 'inter-vlan' },
  { id: 'F-dns', from: 'WS-NURSE-03', to: 'SRV-AD', protocol: 'DNS', port: 'UDP 53', label: l('解析 ehr.renxin.local', 'Resolves ehr.renxin.local'), topic: 'dns' },
  { id: 'F-dhcp', from: 'WS-REG-01', to: 'SRV-AD', protocol: 'DHCP', port: 'UDP 67/68', label: l('DHCP 经核心 ip helper-address 中继', 'DHCP relayed by core ip helper-address'), topic: 'dhcp' },
  { id: 'F-krb', from: 'WS-REG-01', to: 'SRV-AD', protocol: 'Kerberos', port: 'TCP/UDP 88', label: l('域登录认证', 'Domain logon'), topic: 'aaa' },
  { id: 'F-pump', from: 'IOT-PUMP-01', to: 'SRV-EHR', protocol: 'HL7 v2', port: 'TCP 2575', label: l('输液泵上报输液记录（无线 Med-IoT → EHR）', 'Pump sends infusion events (Med-IoT Wi-Fi → EHR)'), topic: 'hl7' },
  { id: 'F-mon', from: 'IOT-MON-01', to: 'SRV-EHR', protocol: 'HL7 v2', port: 'TCP 2575', label: l('监护仪生命体征写入病历', 'Monitor vitals written to the chart'), topic: 'hl7' },
  { id: 'F-lab', from: 'IOT-LAB-01', to: 'SRV-EHR', protocol: 'HL7 ORU', port: 'TCP 2575', label: l('检验结果回传', 'Lab results returned'), topic: 'hl7' },
  { id: 'F-ct', from: 'IOT-CT-01', to: 'SRV-PACS', protocol: 'DICOM C-STORE', port: 'TCP 104', label: l('CT 影像归档', 'CT study archived'), topic: 'dicom' },
  { id: 'F-rad', from: 'WS-RAD-01', to: 'SRV-PACS', protocol: 'DICOM C-MOVE', port: 'TCP 104', label: l('读片调阅影像', 'Radiologist retrieves study'), topic: 'dicom' },
  { id: 'F-cam', from: 'IOT-CAM-01', to: 'SRV-FILE', protocol: 'RTSP', port: 'TCP 554', label: l('监控录像存储', 'CCTV recording'), topic: 'iot-seg' },
  { id: 'F-guest', from: 'GUEST-PHONE', to: 'INTERNET', protocol: 'HTTPS', port: 'TCP 443', label: l('访客上网，防火墙 PAT 转换为公网地址', 'Guest browsing, PAT on the firewall'), topic: 'nat' },
  { id: 'F-portal', from: 'INTERNET', to: 'DMZ-WEB', protocol: 'HTTPS', port: 'TCP 443', label: l('患者访问门户网站（入站到 DMZ）', 'Patients reach the portal (inbound to DMZ)'), topic: 'firewall-dmz' },
  { id: 'F-api', from: 'DMZ-WEB', to: 'SRV-EHR', protocol: 'HTTPS API', port: 'TCP 8443', label: l('门户通过防火墙调用 EHR API', 'Portal calls the EHR API through the firewall'), topic: 'firewall-dmz' },
  { id: 'F-bms', from: 'IOT-BMS-01', to: 'INTERNET', protocol: 'MQTT/TLS', port: 'TCP 8883', label: l('BMS 厂商云远程维护（风险点）', 'BMS vendor-cloud maintenance (risk)'), topic: 'iot-seg' },
  { id: 'F-syslog', from: 'CORE-SW1', to: 'SIEM-01', protocol: 'Syslog', port: 'UDP 514', label: l('网络设备日志汇总到 SIEM', 'Network logs to SIEM'), topic: 'syslog' },
  { id: 'F-capwap', from: 'AP-2F-WARD', to: 'WLC-01', protocol: 'CAPWAP', port: 'UDP 5246/5247', label: l('AP 与 WLC 的控制/数据隧道', 'AP↔WLC control/data tunnel'), topic: 'ap-modes' },
  { id: 'F-backup', from: 'SRV-FILE', to: 'SRV-BACKUP', protocol: 'Backup', port: 'TCP 10000', label: l('每晚 23:00 快照备份', 'Nightly 23:00 snapshot backup'), topic: 'ransomware-ir' },
];

/** Undirected adjacency over visible links. */
export function neighbours(id: string, revealed: Set<string>): { dev: string; link: Link }[] {
  const out: { dev: string; link: Link }[] = [];
  for (const lk of LINKS) {
    if (lk.hidden && !revealed.has(lk.id)) continue;
    if (lk.a === id) out.push({ dev: lk.b, link: lk });
    else if (lk.b === id) out.push({ dev: lk.a, link: lk });
  }
  return out;
}

/** Breadth-first path (list of device ids) between two devices. */
export function findPath(from: string, to: string, revealed: Set<string>, blockedLinks: Set<string> = new Set()): string[] | null {
  const prev = new Map<string, string | null>([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === to) break;
    for (const { dev, link } of neighbours(cur, revealed)) {
      if (blockedLinks.has(link.id) || prev.has(dev)) continue;
      prev.set(dev, cur);
      q.push(dev);
    }
  }
  if (!prev.has(to)) return null;
  const path: string[] = [];
  let c: string | null = to;
  while (c) {
    path.unshift(c);
    c = prev.get(c) ?? null;
  }
  return path;
}

export function deviceWorldPos(d: Device): [number, number, number] {
  const y = ZONES[d.zone].y + 0.6 + (d.lift ?? 0);
  return [d.pos[0], y, d.pos[1]];
}
