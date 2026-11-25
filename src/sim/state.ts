/** Mutable network state that CLI commands and scenarios change. */
export interface SimState {
  /** deviceId → list of administratively shut ports (normalised names, e.g. Gi1/0/12). */
  shutdownPorts: Record<string, string[]>;
  /** Named extended ACLs on CORE-SW1: name → rule lines. */
  acls: Record<string, string[]>;
  /** "Vlan20:in" → ACL name. */
  aclBindings: Record<string, string>;
  /** Firewall outbound deny list (IPs). */
  fwBlocked: string[];
  /** Arbitrary facts set by commands (e.g. "netstat:WS-NURSE-03"). */
  flags: Record<string, boolean>;
  /** Devices currently compromised (drawn red). */
  compromised: string[];
  /** Hidden devices / links that a scenario has made visible. */
  revealed: string[];
  /** WLAN name → PMF setting. */
  pmf: Record<string, 'disabled' | 'optional' | 'mandatory'>;
  /** Rogue BSSIDs under containment. */
  contained: string[];
  /** "SRV-FILE" → snapshot id restored. */
  restored: Record<string, string>;
  /** AD users whose password was reset. */
  resetUsers: string[];
  /** Short-lived banner messages from scenarios (consumed by the UI). */
  version: number;
}

export const initialSimState = (): SimState => ({
  shutdownPorts: {},
  acls: {
    'MGMT-ONLY': ['permit tcp 10.99.99.0 0.0.0.255 any eq 22', 'deny ip any any log'],
  },
  aclBindings: {},
  fwBlocked: [],
  flags: {},
  compromised: [],
  revealed: [],
  pmf: { 'HIS-Staff': 'optional', 'Med-IoT': 'disabled', Guest: 'disabled' },
  contained: [],
  restored: {},
  resetUsers: [],
  version: 0,
});

export interface CliSession {
  mode: 'user' | 'exec' | 'config' | 'config-if' | 'config-acl' | 'config-wlan';
  iface?: string;
  acl?: string;
  wlan?: string;
  lines: { kind: 'in' | 'out' | 'err' | 'ok' | 'sys'; text: string }[];
  history: string[];
}

export const newSession = (): CliSession => ({ mode: 'exec', lines: [], history: [] });
