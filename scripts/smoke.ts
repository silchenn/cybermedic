/**
 * Headless smoke test: plays both scenarios end-to-end through the real store + CLI engine.
 * Run with: npm test
 */
import { useStore } from '../src/store';
import { scenarioById } from '../src/sim/scenarios';
import { DEVICES } from '../src/data/network';

let failures = 0;
const S = () => useStore.getState();
const run = (dev: string, cmd: string) => {
  S().exec(dev, cmd);
  const lines = S().sessions[dev].lines;
  return lines.slice(lines.findLastIndex((l) => l.kind === 'in') + 1).map((l) => l.text).join('\n');
};
const expect = (cond: boolean, msg: string) => {
  if (!cond) {
    failures++;
    console.error('  ✗ ' + msg);
  } else console.log('  ✓ ' + msg);
};
const stepIs = (n: number, msg: string) => expect(S().run?.step === n, `${msg} (step=${S().run?.step})`);

console.log('Ransomware');
S().startScenario('ransomware');
run('WS-NURSE-03', 'netstat -ano');
stepIs(1, 'netstat completes detection');
run('ACC-SW-2F', 'conf t');
run('ACC-SW-2F', 'int gi1/0/12');
run('ACC-SW-2F', 'shut');
stepIs(2, 'port shutdown isolates host');
expect(run('ACC-SW-2F', 'do show ip int brief').includes('administratively down'), 'show ip int brief reflects shutdown');
run('FW-EDGE', 'access-list OUTSIDE_OUT extended deny ip any host 203.0.113.66');
stepIs(2, 'firewall command rejected outside config mode');
run('FW-EDGE', 'conf t');
run('FW-EDGE', 'access-list OUTSIDE_OUT extended deny ip any host 203.0.113.66');
stepIs(3, 'C2 blocked');
run('SIEM-01', 'search src=10.20.20.53');
stepIs(4, 'SIEM scope');
expect(S().sim.compromised.includes('WS-REG-01'), 'lateral movement revealed');
// wrong ACL first: no permit → must warn and not pass
run('CORE-SW1', 'conf t');
run('CORE-SW1', 'ip access-list extended BLOCK-SMB');
run('CORE-SW1', 'deny tcp any any eq 445');
run('CORE-SW1', 'interface vlan 20');
run('CORE-SW1', 'ip access-group BLOCK-SMB in');
stepIs(4, 'ACL without permit does not pass');
expect(S().run!.log.some((l) => l.kind === 'warn'), 'warning shown for deny-all ACL');
run('CORE-SW1', 'exit');
run('CORE-SW1', 'ip access-list extended BLOCK-SMB');
run('CORE-SW1', 'permit ip any any');
stepIs(5, 'correct ACL passes');
expect(run('CORE-SW1', 'do show run').includes('ip access-group BLOCK-SMB in'), 'running-config shows binding');
run('SRV-BACKUP', 'backup list');
run('SRV-BACKUP', 'backup restore SRV-FILE --snapshot snap-20261125-0300');
stepIs(5, 'suspect snapshot refused');
run('SRV-BACKUP', 'backup restore SRV-FILE --snapshot snap-20261124-2300');
expect(!!S().run?.finishedAt, 'ransomware scenario finished');

console.log('Evil twin');
S().startScenario('evil-twin');
run('WLC-01', 'show wireless wps rogue ap summary');
run('WLC-01', 'sh wireless wps rogue ap detail 02:de:ad:be:ef:01');
stepIs(2, 'detect + locate');
run('WLC-01', 'conf t');
run('WLC-01', 'wireless wps rogue ap mac-address 02de.adbe.ef01 contain');
stepIs(3, 'containment');
run('WLC-01', 'do show wireless wps rogue client summary');
stepIs(4, 'victims');
run('SRV-AD', 'Set-ADAccountPassword -Identity nurse.li -Reset');
stepIs(5, 'password reset');
run('WLC-01', 'wlan HIS-Staff');
run('WLC-01', 'security pmf mandatory');
expect(!!S().run?.finishedAt, 'evil-twin scenario finished');

console.log('Free explore — every CLI device answers help without throwing');
S().abortScenario();
for (const d of DEVICES.filter((d) => d.cli !== 'none')) {
  const out = run(d.id, d.cli === 'ios' || d.cli === 'wlc' || d.cli === 'firewall' ? '?' : 'help');
  expect(out.length > 0, `${d.id} help`);
}
expect(run('WS-NURSE-03', 'ping 10.10.10.20').includes('Reply from'), 'nurse can reach EHR');
expect(run('IOT-PUMP-01', 'ping 10.10.10.10').includes('Unreachable'), 'Med-IoT cannot reach the DC');
expect(run('WS-NURSE-03', 'tracert 10.10.10.20').includes('10.20.20.1'), 'traceroute shows SVI gateway');
void scenarioById;

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
