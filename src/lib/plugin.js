/**
 * Abstract base class for code shared between the two plugin types, Builder and
 * Importer.
 */

import {EventEmitter} from 'events';
import decamelize from 'decamelize';
import {isFunction} from 'lodash';

const NAME = Symbol();

// TODO: rename `Plugin` => `Nameable`
export default class Plugin extends EventEmitter {
  constructor(fn) {
    super();

    console.assert(isFunction(fn), 'should be function');

    Object.defineProperty(this, 'fn', {value: fn});
  }


  get name() {
    if (!this[NAME]) {
      if (this.fn.name) {
        this[NAME] = decamelize(this.fn.name, '-');
        if (this[NAME].substring(0, 8) === 'exhibit-') {
          this[NAME] = this[NAME].substring(8);
        }
      }
      else this[NAME] = '[anonymous]';
    }

    return this[NAME];
  }
}
