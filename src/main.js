var exec = require( 'child_process' ).exec;
var path = require( 'path' );
var pretty = require( 'pretty-time' );
var nodeProcess = require( './process' );

module.exports = {
  _execute: function ( program, cmds ) {
    var cmdManager = require( '../index' ).create();

    var opts = program.opts;

    cmdManager.on( 'command:start', function ( e, args ) {
      program.subtle( 'starting command', args.cmd );
    } );

    cmdManager.on( 'command:error', function ( e, args ) {
      program.subtle( 'command error', args, 'duration: ', pretty( args.duration, 's' ) );
    } );

    cmdManager.on( 'command:exit', function ( e, args ) {
      program.subtle( 'command', args.cmd, 'exited with code', args.exitCode + ', took: ', pretty( args.duration ) );
      if ( opts.sortOutput ) {
        args.stdout && console.log( args.stdout );
        args.stderr && console.error( args.stderr );
      }
      if ( args.exitCode !== 0 && opts.bail ) {
        program.warn( 'command', args.cmd, 'failed. Stopping all' );
        cmdManager.stopAll();
        process.exit( 1 ); // eslint-disable-line
      }

    } );

    cmdManager.on( 'command:killed', function ( e, args ) {
      program.subtle( 'command killed:', args.cmd, 'pid:', args.pid );
    } );

    var d = require( 'domain' ).create();

    d.on( 'error', function () {
      cmdManager.stopAll();
    } );

    var p = cmdManager.runCmds( cmds, {
      stdio: opts.sortOutput ? 'pipe' : 'inherit'
    } );

    p.then( function ( args ) {
      var results = [ ];

      args.forEach( function ( result ) {
        if ( result.exitCode !== 0 ) {
          results.push( {
            cmd: result.cmd, exitCode: result.exitCode
          } );
        }
      } );

      if ( results.length > 0 ) {
        program.error( 'Some commands failed', results );
        process.exit( 1 ); // eslint-disable-line
      }
    } );

    var lines = [
      'Commands execution started',
      '',
      '    To kill commands from the shell In case I become a zombie, execute:',
      '',
      '    ' + cmdManager.getKillCommand(),
      '',
      ''
    ];

    program.subtle( lines.join( '\n' ) );

    nodeProcess.on( 'SIGINT', function ( code ) {
      program.subtle( 'killing all processes' );
      cmdManager.stopAll();
      nodeProcess.exit( code );
    } );
  },
  run: function ( program ) {

    var cmds = program.opts._;

    var addNPMBinToPath = function ( cb ) {
      exec( 'npm bin', function ( error, stdout, stderr ) {
        if ( error ) {
          program.error( 'received error', error );
          stderr && program.error( stderr );
          return;
        }

        process.env.PATH += '' + path.delimiter + stdout.trim();

        cb && cb();
      } );
    };

    if ( cmds.length === 0 ) {
      program.error( 'please provide some commands to execute' );
      program.showHelp();
      return;
    }
    var me = this;
    addNPMBinToPath( function () {
      me._execute( program, cmds );
    } );
  }
};
