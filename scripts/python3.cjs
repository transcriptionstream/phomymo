const { spawn } = require('node:child_process');

// Windows development wrapper: this project expects `python3`, while Windows commonly exposes Python 3 through the `py -3` launcher.
const isWindows = process.platform === 'win32';
const command = isWindows ? 'py' : 'python3';
const args = isWindows ? ['-3', ...process.argv.slice(2)] : process.argv.slice(2);

const child = spawn(command, args, { stdio: 'inherit' });

child.on('error', (error) => {
  console.error(`Failed to start ${command}: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
