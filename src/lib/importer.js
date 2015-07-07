import {param, ArrayOf} from 'decorate-this';
import minimatch from 'minimatch';
import Promise from 'bluebird';
import Plugin from './plugin';
import _ from 'lodash';


export default class Importer extends Plugin {
  constructor(fn) {
    console.assert(_.isFunction(fn), 'should be a function');
    super(fn);
  }

  // @param(String)
  // @param(ArrayOf(String))
  async execute(path, types) {
    return this.fn.call(this, path, types);
  }

  _ = _
  Set = Set
  lodash = _
  Promise = Promise
  minimatch = minimatch
}
