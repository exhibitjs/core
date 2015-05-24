import isFunction from 'lodash/lang/isFunction';
import identity from 'lodash/utility/identity';
import isObject from 'lodash/lang/isObject';
import VirtualFolder from 'virtual-folder';
import isArray from 'lodash/lang/isArray';
import Phase from './phase';

const BATCH_RUNNING       = Symbol();
const FINAL_OUTBOX        = Symbol();
const INITIAL_INBOX       = Symbol();
const NUM_PHASES          = Symbol();
const PHASES              = Symbol();


export default class Engine {
  constructor({phases}) {
    if (phases && (!isArray(phases) || !phases.every(isFunction))) {
      throw new TypeError('Expected phases to be an array of functions');
    }

    this[BATCH_RUNNING] = false;
    this[INITIAL_INBOX] = new VirtualFolder();
    this[FINAL_OUTBOX] = new VirtualFolder();
    this[NUM_PHASES] = phases ? phases.length : 0;
    this[PHASES] = [];

    for (let i = 0; i < this[NUM_PHASES]; i++) {
      const fn = phases[i];
      const isFirst = (i === 0);
      const isLast = (i === phases.length - 1);

      const previous = isFirst ? this[INITIAL_INBOX] : this[PHASES][i - 1];
      const outbox = isLast ? this[FINAL_OUTBOX] : new VirtualFolder();

      this[PHASES][i] = new Phase({previous, outbox, fn});
    }
  }


  async batch(files) {
    if (this[BATCH_RUNNING]) {
      throw new Error('Cannot run two batches at the same time');
    }

    if (!isArray(files) || !files.every(isObject)) {
      throw new TypeError('Expected an array of objects');
    }

    this[BATCH_RUNNING] = true;

    // get an array of actual changes from the first inbox
    let nextFiles = files.map(file => {
      return this[INITIAL_INBOX].write(file.filename, file.contents);
    }).filter(identity);

    for (let phase of this[PHASES]) {
      nextFiles = await phase.execute(nextFiles);
      if (!nextFiles || !nextFiles.length) break;
    }

    this[BATCH_RUNNING] = false;
    return nextFiles;
  }
}
