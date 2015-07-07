/**
 * This class represents a single invocation of a builder, and provides a
 * limited `this.*` API for the builder function.
 */

import {param, promises, AnyOf, ArrayOf, Optional} from 'decorate-this';
import isString from 'lodash/lang/isString';
import SourceError from './source-error';
import {resolve, relative} from 'path';
import isAbsolute from 'is-absolute';
import {EventEmitter} from 'events';
import minimatch from 'minimatch';
import Promise from 'bluebird';
import {map} from 'in-place';
import subdir from 'subdir';
import _ from 'lodash';

const SOURCE = Symbol();
const ENGINE = Symbol();
const BUILD_PATH = Symbol();
const IMPORTATIONS = Symbol();

// const importerContext = { _, Promise, Set };


export default class BuilderInvocation extends EventEmitter {
  /**
   * Can't move this to a decorated `init` to check types of `source`, `engine`
   * etc. due to circular imports problem
   * https://github.com/babel/babel/issues/1150
   */
  constructor({base, source, importations, buildPath, engine}) {
    super();
    console.assert(engine instanceof require('./engine'));

    this[ENGINE] = engine;
    this[IMPORTATIONS] = importations;
    this[BUILD_PATH] = buildPath;
    this[SOURCE] = source; // could be a Builder or the virtual origin folder

    Object.defineProperty(this, 'base', {value: base});
  }


  /**
   * Override method just to add type-checking.
   */
  @param(String)
  emit(...args) {
    super.emit.apply(this, args);
  }


  // @param(AnyOf( String, ArrayOf(String) ))
  // @param(Optional(String))
  @promises({path: String, contents: Buffer})
  async import(possiblePaths, types) {
    // TODO: get it from this builder's permanent import cache if possible, which should have already been purged of anything in allChangedPaths (and remember to update importations as well)

    if (!this instanceof BuilderInvocation) {
      throw new Error('You must call import attached to the callsite.');
    }

    if (!Array.isArray(possiblePaths)) possiblePaths = [possiblePaths];
    if (!possiblePaths.every(isString)) {
      throw new TypeError('Builder called this.import() with the wrong type of argument.');
    }

    // if any of the possible paths are relative
    possiblePaths = possiblePaths.map(path => resolve(this.base, path));

    // first try getting contents internally, if the path is internal
    // (try ALL possible paths internally before trying ANY with external importers)
    for (const path of possiblePaths) {
      if (subdir(this.base, path)) {
        const contentsFromSource = this[SOURCE].read(path);
        // add it regardless of whether we found it
        this[IMPORTATIONS].add(this[BUILD_PATH], path);

        if (contentsFromSource) {
          // we found it; add the importation before returning
          return { contents: contentsFromSource, path };
        }
      }
    }

    // we didn't find anything internally. try external importers
    const importers = this[ENGINE].importers;
    if (importers.length) {
      if (types) {
        if (!Array.isArray(types)) types = [types];

        if (!types.every(isString)) throw new Error('builder import types must be strings');

        types = types.map(
          type => type.charAt(0) === '.' ? type.substring(1) : type
        );
      }

      // try the 1st possible path in each of the importers in turn, then the 2nd possible path in each, etc.
      for (let path of possiblePaths) {
        if (subdir(this.base, path)) path = relative(this.base, path);

        for (const importer of importers) {
          const result = await importer.execute(path, types);

          if (result) {
            if (result.accessed && !(result.accessed instanceof Set)) {
              throw new Error(`importer's result.accessed should be a Set`);
            }

            // record all the paths the importer tried to access (if any of these change in
            // future then we will need to know which build paths are then invalidated)
            for (const accessedPath of result.accessed) {
              this[IMPORTATIONS].add(this[BUILD_PATH], resolve(this.base, accessedPath));
            }

            // if this was a successful import, return it
            if (result.contents || result.path) {
              console.assert(Buffer.isBuffer(result.contents), 'imported contents should be a buffer');
              console.assert(isString(result.path) && isAbsolute(result.path), 'imported result should include an absolute resolved path');

              return {contents: result.contents, path: result.path};
            }
          }
        }
      }
    }

    // we still haven't found anything.
    // make a final error to throw back to the builder
    const error = new Error('Could not import path(s): ' + JSON.stringify(possiblePaths));
    error.code = 'EXHIBITNOTFOUND';
    throw error;
  }


  /**
   * Share some utilities so builders may reuse them.
   */
  _ = _
  lodash = _
  Promise = Promise
  minimatch = minimatch
  SourceError = SourceError
}
