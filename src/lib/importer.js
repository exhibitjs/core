import Harness from './harness';
import {isFunction} from 'lodash';
import util from './util';


export default class Importer extends Harness {
  constructor(fn) {
    console.assert(isFunction(fn), 'should be a function');
    super(fn);
  }

  async execute(path, types) {
    return this.fn(path, types);
  }

  util = util;
}
