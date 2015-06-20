/**
 * This class provides a limited `this` API for plugin functions.
 */

import isString from 'lodash/lang/isString';
import SourceError from './source-error';
import {promises} from 'decorate-this';
import {EventEmitter} from 'events';
import minimatch from 'minimatch';
import Promise from 'bluebird';
import {resolve} from 'path';
import {map} from 'in-place';
import subdir from 'subdir';
import _ from 'lodash';

const SOURCE = Symbol();
const IMPORTATIONS = Symbol();
const BUILD_PATH = Symbol();
const ENGINE = Symbol();

export default class PluginContext extends EventEmitter {
  /**
   * NB we can't move this to a decorated `init` to check the type of things like `source`, `engine` etc. because we would have to synchronously import them while this module is being evaluated, while this module is in turn being imported by `Plugin` which is imported by `Engine`. So it would create a circular import, which I think should be OK in ES6, but doesn't work in Babel.
   */
  constructor({base, source, importations, buildPath, engine}) {
    super();
    console.assert(engine instanceof require('./engine'));

    this[ENGINE] = engine;
    this[IMPORTATIONS] = importations;
    this[BUILD_PATH] = buildPath;
    this[SOURCE] = source; // could be a Plugin or the virtual origin folder

    Object.defineProperty(this, 'base', {value: base});
  }


  @promises({path: String, contents: Buffer})
  async import(possiblePaths) {
    // TODO: get it from this plugin's permanent import cache if possible, which should have already been purged of anything in allChangedPaths (and remember to update importations as well)

    if (!Array.isArray(possiblePaths)) possiblePaths = [possiblePaths];
    if (!possiblePaths.every(isString)) {
      throw new TypeError('Plugin called this.import() with the wrong type of argument.');
    }

    // if any of the possible paths are relative
    map(possiblePaths, path => resolve(this.base, path));

    // first try getting contents internally, if the path is internal
    for (const path of possiblePaths) {
      if (subdir(this.base, path)) {
        const contentsFromSource = this[SOURCE].read(path);
        if (contentsFromSource) {
          // we found it; add the importation before returning
          this[IMPORTATIONS].add(this[BUILD_PATH], path);
          return { contents: contentsFromSource, path };
        }
      }
    }

    // we didn't find anything internally...
    // ok, try all of the with the engine's importer (which comes from wrapper lib,
    // and will remap to load paths if it's an internal path, otherwise will just get from disk)
    for (const path of possiblePaths) {
      let result;
      try {
        result = await this[ENGINE].importMissingFile(path);
      }
      catch (error) {
        // if it just couldn't be found (or was a directory), try the next one
        if (error.code === 'EXHIBITNOTFOUND') continue;
        throw error;
      }
      if (result) {
        this[IMPORTATIONS].add(this[BUILD_PATH], result.path);
        return result;
      }
      else {
        console.log('BUG? result should be set here');
      }
    }

    // make a final error to throw back to the plugin
    const error = new Error('Could not import path(s).');
    error.code = 'EXHIBITNOTFOUND';
    throw error;
  }


  /**
   * Share some utilities so plugins may reuse them.
   */
  _ = _
  lodash = _
  Promise = Promise
  minimatch = minimatch
  SourceError = SourceError
}
