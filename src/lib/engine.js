import {param, ArrayOf, Optional} from 'decorate-this';
import {VirtualFolder} from 'virtual-folder';
import {identity, isString} from 'lodash';
import {magenta, grey} from './colours';
import {EventEmitter} from 'events';
import Importer from './importer';
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

  /**
   * Incrementally process a set of changes.
   */
  // CANNOT duck-check the input objects because the duck-checker seems to only
  // accept POJOs, and exhibit usually passes these as Changes, but the engine
  // shouldn't care about
  // @param(
  //   ArrayOf({
  //     file: String,
  //     contents: Optional(AnyOf(Buffer, String)),
  //   }),
  //   'Project files to be built (anything new or modified since the last batch)' +
  //   ' each with a buffer as contents, or `null` to indicate a deletion'
  // )
  // @param(
  //   Optional(ArrayOf(String)),
  //   'External files that have changed (to trigger rebuilds of anything else)'
  // )
  async batch(input = [], changedExternalPaths = []) {
    console.assert(input.every(({file, contents}) => isString(file) && (
      contents === null || Buffer.isBuffer(contents) || isString(contents)
    )), 'input invalid');

    console.assert(changedExternalPaths.every(isString), 'changedExternalPaths array invalid');

    // disallow concurrent batches (they would ruin everything)
    if (this[BATCH_RUNNING]) {
      throw new Error('Cannot run two batches at the same time');
    }
    this[BATCH_RUNNING] = true;

    // log what's coming into the engine batch
    if (this.verbose) {
      console.log(
        magenta(`\n  ${input.length} incoming internal paths`)
      );
      for (const {file} of input) {
        console.log('      ' + grey(relative(this[BASE], file)));
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
      input.map(({file, contents}) => this[INITIAL_INBOX].write(file, contents)),
      identity
    );

    changedExternalPaths = new Set(changedExternalPaths);

    // run each builder in turn, passing each one's changes to the next
    for (let i = 0; i < this[NUM_BUILDERS]; i++) {
      const builder = this[BUILDERS][i];
      if (this.verbose) {
        console.log(magenta(`\n  ${builder.name} (builder ${i + 1} of ${this[NUM_BUILDERS]})`));
      }

      // bubble up any errors emitted from the builder
      const handleError = error => {
        this.emit('error', error);
      };
      builder.on('error', handleError);

      // each builder gets 'changes' from the previous one, but all builders get
      // the same changedExternalPaths set too.
      try {
        changes = await builder.execute(new Set(changes.map(c => c.file)), changedExternalPaths);
      }
      catch (error) {
        handleError(error); // handle thrown errors or rejections
      }

      builder.removeListener('error', handleError);

      if (!changes || !changes.length) break;
    }

    // log the final outgoing changes from the batch
    if (this.verbose) {
      console.log(magenta(`\n  ${changes.length} final outgoing changes`));
      for (const change of changes) {
        console.log(grey(
          `      ${change.type} ${relative(this[BASE], change.file)} (${change.sizeDifference})`
        ));
      }
      console.log('');
    }

    this[BATCH_RUNNING] = false;
    return changes;
  }
}
