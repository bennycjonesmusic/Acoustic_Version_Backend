import { LeakageMonitor } from 'vs/base/common/event';

export function activate() {
  LeakageMonitor._threshold = 50;
  console.log('LeakageMonitor threshold set to 50');
}

export function deactivate() {}
