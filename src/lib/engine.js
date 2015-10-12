import {param, ArrayOf, Optional} from 'decorate-this';
import {VirtualFolder} from 'virtual-folder';
import {magenta, grey} from './colours';
import {EventEmitter} from 'events';
import Importer from './importer';
import {identity} from 'lodash';
import {filter} from 'in-place';
import Builder from './builder';
import {relative} from 'path';

const BASE = Symbol();
const BUILDERS = Symbol();
const NUM_BUILDERS = Symbol();
const FINAL_OUTBOX = Symbol();
const INITIAL_INBOX = Symbol();
const BATCH_RUNNING = Symbol();

export default class Engine extends EventEmitter {
  constructor(options) {
    super();
    this.init(options);
  }

  @param({
    builders: Optional(ArrayOf(Function)),
    importers: Optional(ArrayOf(Function)),
    base: String, // for deciding quickly if a path is 'internal' (needs to go through pipeline) or 'external' (can be pulled in straight from disk)
    verbose: Boolean,
  })
  init({builders = [], importers = [], base, verbose}) {
    this[BATCH_RUNNING] = false;
    this[INITIAL_INBOX] = new VirtualFolder();
    this[FINAL_OUTBOX] = new VirtualFolder();
    this[NUM_BUILDERS] = builders ? builders.length : 0;
    this[BASE] = base;
    this[BUILDERS] = [];

    Object.defineProperties(this, {
      verbose: {value: Boolean(verbose)},
      importers: {value: importers.map(fn => new Importer(fn))},
    });

    for (let i = 0; i < this[NUM_BUILDERS]; i++) {
      const fn = builders[i];
      const isFirst = (i === 0);
      const isLast = (i === builders.length - 1);

      const inbox = isFirst ? this[INITIAL_INBOX] : this[BUILDERS][i - 1].outbox;
      const outbox = isLast ? this[FINAL_OUTBOX] : new VirtualFolder();

      this[BUILDERS][i] = new Builder({
        inbox, outbox, fn, base, engine: this,
      });
    }
  }

  // /**
  //  * Imports a file from outside the project (e.g. from a load path - but load path resolution will be
  //  * handled outside of Core).
  //  */
  // @param(String, 'A path to import (may be relative, in which case it could be gotten from load paths)');
  // @promises({path: String, contents: Buffer}, 'Resolved path and contents of imported file');

  // importMissingFile(path) {
  //   return this[IMPORTER](path);
  // }

  /**
   * Incrementally process a set of changes.
   */
  // @param(
  //   ArrayOf({
  //     path: String,
  //     contents: Optional(AnyOf(Buffer, String)),
  //   }),
  //   'Project files to be built (anything new or modified since the last batch)' +
  //   ' each with a buffer as contents, or `null` to indicate a deletion'
  // )
  // @param(
  //   Optional(ArrayOf(String)),
  //   'External files that have changed (to trigger rebuilds of anything else)'
  // )
  async batch(files = [], changedExternalPaths = []) {
    if (this[BATCH_RUNNING]) {
      throw new Error('Cannot run two batches at the same time');
    }
    this[BATCH_RUNNING] = true;

    if (this.verbose) {
      console.log(
        magenta(`\n  ${files.length} incoming internal paths`)
      );
      for (const {path} of files) {
        console.log('      ' + grey(relative(this[BASE], path)));
      }

      console.log(
        magenta(`\n  ${changedExternalPaths.length} incoming external paths`)
      );
      for (const path of changedExternalPaths) {
        console.log('      ' + grey(relative(this[BASE], path)));
      }
    }

    // write the file objects into the engine's initial inbox, to get any
    // *actual* changes
    let changes = filter(
      files.map(({path, contents}) => this[INITIAL_INBOX].write(path, contents)),
      identity
    );

    changedExternalPaths = new Set(changedExternalPaths);

    for (let i = 0; i < this[NUM_BUILDERS]; i++) {
      const builder = this[BUILDERS][i];
      if (this.verbose) {
        console.log(magenta(`\n  ${builder.name} (builder ${i + 1} of ${this[NUM_BUILDERS]})`));
      }

      // bubble up errors from builders
      const handleError = error => {
        this.emit('error', error);
      };
      builder.on('error', handleError); // handle emitted errors

      // each builder gets 'changes' from the previous one, but all builders get
      // the same changedExternalPaths array.
      try {
        changes = await builder.execute(new Set(changes.map(c => c.path)), changedExternalPaths);
      }
      catch (error) {
        handleError(error); // handle thrown errors or rejections
      }

      builder.removeListener('error', handleError);

      if (!changes || !changes.length) break;
    }

    if (this.verbose) {
      console.log(magenta(`\n  ${changes.length} final outgoing changes`));
      for (const change of changes) {
        console.log(grey(
          `      ${change.type} ${relative(this[BASE], change.path)} (${change.sizeDifference})`
        ));
      }
      console.log('');
    }

    this[BATCH_RUNNING] = false;
    return changes;
  }
}
