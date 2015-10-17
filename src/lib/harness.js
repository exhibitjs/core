/**
 * A harness for repeated calls to a given function or generator function.
 * In the case of a generator function, it gets wrapped as a Bluebird coroutine.
 * This is used as an abstract base class for builders and importers.
 */

import {EventEmitter} from 'events';
import decamelize from 'decamelize';
import {isFunction} from 'lodash';
import {coroutine} from 'bluebird';

export default class Harness extends EventEmitter {
  constructor(fn) {
    super();

    console.assert(isFunction(fn), 'should be function');

    let name = fn.name;
    if (name) {
      name = decamelize(name, '-');
      if (name.startsWith('exhibit-')) name = name.substring(8);
    }
    else name = '[anonymous]';

    console.log('isGen', fn.constructor.name);

    Object.defineProperties(this, {
      fn: {value: isGeneratorFunction(fn) ? coroutine(fn) : fn},
      name: {value: name},
    });
  }
}

function isGeneratorFunction(fn) {
  return fn.constructor.name === 'GeneratorFunction';
}
