// import {param, ArrayOf} from 'decorate-this';
import micromatch from 'micromatch';
import Promise from 'bluebird';
import Nameable from './nameable';
import _ from 'lodash';


export default class Importer extends Nameable {
  constructor(fn) {
    console.assert(_.isFunction(fn), 'should be a function');
    super(fn);
  }

  // @param(String)
  // @param(ArrayOf(String))
  async execute(path, types) {
    return this.fn(path, types);
  }

  _ = _
  Set = Set
  lodash = _
  Promise = Promise
  micromatch = micromatch
}
