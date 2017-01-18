const exec = require('child_process').exec;
const path = require('path');
const nodeProcess = require('./process');
const domain = require('domain');
const manager = require('../index');

const addNPMBinToPath = cb =>
  new Promise((resolve, reject) => {
    exec('npm bin', (error, stdout) => {
      if (error) {
        cb && cb(error);
        reject(error);
        return;
      }

      if (typeof process.env.FORCE_COLOR === 'undefined') {
        process.env.FORCE_COLOR = 'true';
      }

      process.env.PATH += `${  path.delimiter  }${stdout.trim()}`;

      cb && cb();
      resolve();
    });
  });

const printFailed = entries =>
  entries.reduce((seq, entry) => {
    seq += `   - cmd: ${  entry.cmd  }, exitCode: ${  entry.exitCode  }\n`;
    return seq;
  }, '\n');

module.exports = {
  _execute(program, cmds) {
    const cmdManager = manager.create(); // eslint-disable-line

    const opts = program.opts;

    cmdManager.on('command:start', (e, args) => {
      program.subtle('starting command', args.cmd);
    });

    cmdManager.on('command:error', (e, args) => {
      program.subtle('command error', args, 'duration: ', args.durationFormatted);
    });

    cmdManager.on('command:exit', (e, args) => {
      const method = args.exitCode === 0 ? 'subtle' : 'warn';
      program[method]('command', args.cmd, 'exited with code', `${args.exitCode  }, took:`, args.durationFormatted);
      if (opts.sortOutput) {
        args.stdout && console.log(args.stdout);
        args.stderr && console.error(args.stderr);
      }
      if (args.exitCode !== 0 && opts.bail) {
        program.warn('command', args.cmd, 'failed. Stopping all');
        cmdManager.stopAll();
        process.exit( 1 ); // eslint-disable-line
      }

    });

    cmdManager.on('command:killed', (e, args) => {
      program.subtle('command killed:', args.cmd, 'pid:', args.pid);
    });

    const d = domain.create();

    d.on('error', () => {
      cmdManager.stopAll();
    });

    const p = cmdManager.runCmds(cmds, {
      stdio: opts.sortOutput ? 'pipe' : 'inherit',
    });

    p.then((args) => {
      const results = [];
      args.forEach((result) => {
        if (result.exitCode !== 0) {
          results.push({
            cmd: result.cmd,
            exitCode: result.exitCode,
          });
        }
      });

      if (results.length > 0) {
        program.error('Some commands failed', '\n', printFailed(results));
        process.exit( 1 ); // eslint-disable-line
      }
    });

    const lines = `
    Commands execution started

    To kill commands from the shell In case I become a zombie, execute:

    ${  cmdManager.getKillCommand()}

    `;

    program.subtle(lines);

    nodeProcess.on('SIGINT', (code) => {
      program.subtle('killing all processes');
      cmdManager.stopAll();
      nodeProcess.exit(code);
    });
  },
  async run(program) {

    const cmds = program.opts._;

    if (cmds.length === 0) {
      program.error('please provide some commands to execute');
      program.showHelp();
      return;
    }

    try {
      await addNPMBinToPath();
    } catch ({ error, stderr }) {
      program.error('received error', error);
      stderr && program.error(stderr);
    }

    this._execute(program, cmds);
  },
};
