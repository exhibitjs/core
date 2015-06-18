import {param, promises, ArrayOf} from 'decorate-this';
import {magenta, grey} from './colours';
import identity from 'lodash/utility/identity';
import {VirtualFolder} from 'virtual-folder';
import {filter} from 'in-place';
import {relative} from 'path';
import Plugin from './plugin';

const BATCH_RUNNING = Symbol();
const INITIAL_INBOX = Symbol();
const FINAL_OUTBOX = Symbol();
const NUM_PLUGINS = Symbol();
const IMPORTER = Symbol();
const PLUGINS = Symbol();
const BASE = Symbol();

export default class Engine {
  constructor(options) {
    this.init(options);
  }

  @param({
    plugins: ArrayOf(Function),
    importMissingFile: Function,
    base: String, // for deciding quickly if a path is 'internal' (needs to go through pipeline) or 'external' (can be pulled in straight from disk)
    verbose: Boolean,
  })

  init({plugins, importMissingFile, base, verbose}) {
    this[BATCH_RUNNING] = false;
    this[INITIAL_INBOX] = new VirtualFolder();
    this[FINAL_OUTBOX] = new VirtualFolder();
    this[NUM_PLUGINS] = plugins ? plugins.length : 0;
    this[IMPORTER] = importMissingFile;
    this[BASE] = base;
    this[PLUGINS] = [];

    Object.defineProperty(this, 'verbose', {value: !!verbose});

    for (let i = 0; i < this[NUM_PLUGINS]; i++) {
      const fn = plugins[i];
      const isFirst = (i === 0);
      const isLast = (i === plugins.length - 1);

      const previous = isFirst ? this[INITIAL_INBOX] : this[PLUGINS][i - 1];
      const outbox = isLast ? this[FINAL_OUTBOX] : new VirtualFolder();

      this[PLUGINS][i] = new Plugin({previous, outbox, fn, base, engine: this});
    }
  }


  /**
   * Imports a file from outside the project (e.g. from a load path - but load path resolution will be
   * handled outside of Core).
   */
  @param(String, 'A path to import (may be relative, in which case it could be gotten from load paths)');
  @promises({path: String, contents: Buffer}, 'Resolved path and contents of imported file');

  importMissingFile(path) {
    return this[IMPORTER](path);
  }


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

  async batch(files=[], changedExternalPaths=[]) {
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

    for (let i = 0; i < this[NUM_PLUGINS]; i++) {
      const plugin = this[PLUGINS][i];
      if (this.verbose) {
        console.log(
          magenta(`\n  ${plugin.name} (plugin ${i + 1} of ${this[NUM_PLUGINS]})`)
        );
      }

      // each plugin gets 'changes' from the previous one, but all plugins get
      // the same changedExternalPaths array.
      changes = await plugin.execute(new Set(changes.map(c => c.path)), changedExternalPaths);
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
