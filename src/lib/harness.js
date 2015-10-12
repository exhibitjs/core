/**
 * A harness for repeated calls to a given function or generator function.
 * In the case of a generator function, it gets wrapped as a Bluebird coroutine.
 * This is used as an abstract base class for builders and importers.
 */

import memoize from 'memoize-decorator';
import {EventEmitter} from 'events';
import decamelize from 'decamelize';
import {isFunction} from 'lodash';
import {coroutine} from 'bluebird';

export default class Harness extends EventEmitter {
  constructor(fn) {
    super();

    console.assert(isFunction(fn), 'should be function');

    Object.defineProperty(this, 'fn', {
      value: fn.constructor.name === 'GeneratorFunction' ? coroutine(fn) : fn,
    });
  }

  /**
   * Gets a normalised version of the function's name, for debug logs.
   */
  @memoize
  get name() {
    let name = this.fn.name;
    if (name) {
      name = decamelize(this.fn.name, '-');
      if (name.startsWith('exhibit-')) name = name.substring(8);
      return name;
    }
    return '[anonymous]';
  }
}
