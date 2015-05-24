'use strict';

import isFunction from 'lodash/lang/isFunction';
import isString from 'lodash/lang/isString';
import inPlace from 'in-place';
import Promise from 'bluebird';

const PREVIOUS = Symbol();
const OUTBOX = Symbol();
const FN = Symbol();


export default class Phase {
  constructor ({previous, outbox, fn}) {
    console.assert(previous instanceof require('virtual-folder') || previous instanceof Phase);
    console.assert(outbox instanceof require('virtual-folder'));
    console.assert(isFunction(fn));

    this[OUTBOX] = outbox;
    this[FN] = fn;
    this[PREVIOUS] = previous;
  }


  /**
   * Reads a file from this phase's outbox.
   */
  read(filename) {
    return this[OUTBOX].read(filename);
  }


  /**
   * Processes the given file objects using the phase's 'fn' function, and returns any changes.
   */
  async execute(inFiles) {
    const phase = this;

    const results = await Promise.resolve(phase[FN].call({ read: (fn) => phase[PREVIOUS].read(fn) }, inFiles));

    if (!results) return null;

    const changes = await Promise.map(results, file => {
      return Promise.resolve(file.contents).then(contents => {
        if (isString(contents)) contents = new Buffer(contents);
        if (contents && !Buffer.isBuffer(contents)) {
          throw new TypeError('Bad result from plugin - expected buffer, string or null');
        }

        return Promise.resolve(file.filename)
          .then(filename => phase[OUTBOX].write(filename, contents));
      });
    });

    return inPlace.filter(changes, change => change);
  }
}
