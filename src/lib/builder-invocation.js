/**
 * This class represents a single invocation of a builder, and provides a
 * limited `this.*` API for the builder function.
 */

import {param, promises} from 'decorate-this';
import isString from 'lodash/lang/isString';
import SourceError from './source-error';
import {resolve, relative} from 'path';
import isAbsolute from 'is-absolute';
import {EventEmitter} from 'events';
import minimatch from 'minimatch';
import Promise from 'bluebird';
import subdir from 'subdir';
import _ from 'lodash';

const INBOX = Symbol();
const ENGINE = Symbol();
const BUILD_PATH = Symbol();
const IMPORTATIONS = Symbol();


export default class BuilderInvocation extends EventEmitter {
  /**
   * Can't move this to a decorated `init` to check types of `inbox`, `engine`
   * etc. due to circular imports problem
   * https://github.com/babel/babel/issues/1150
   */
  constructor({base, inbox, importations, buildPath, engine}) {
    super();
    console.assert(engine instanceof require('./engine'));

    this[ENGINE] = engine;
    this[IMPORTATIONS] = importations;
    this[BUILD_PATH] = buildPath;
    this[INBOX] = inbox;

    Object.defineProperty(this, 'base', {value: base});
  }


  /**
   * Override method just to add type-checking.
   */
  @param(String)
  emit(...args) {
    super.emit.apply(this, args);
  }


  /**
   * Synchronously imports a file from INSIDE the in-transit project source.
   * Returns {path, contents} where path is a resolved absolute path.
   */
  importInternal(path) {
    path = resolve(this.base, path);
    if (!subdir(this.base, path)) {
      throw new Error('importInternal cannot import a file outside the source directory');
    }

    const contents = this[INBOX].read(path);

    if (contents) {
      return {path, contents};
    }

    if (false && this[INBOX].isDir(path)) { // TODO!!!
      const error = new Error('Is a directory: ' + path);
      error.code = 'EISDIR';
      throw error; 
    }
    else {
      const error = new Error('Not found: ' + path);
      error.code = 'ENOENT';
      throw error;
    }
  }


  /**
   * Asynchronously import a path from OUTSIDE the project source, i.e. using any configured importers.
   * (This method can in fact take an internal-looking path, in which case it will be passed to the importers as a relative path from the source dir.)
   */
  async importExternal(path, types) {
    // normalize it before passing to the importers:
    // if it 'looks' internal, make it relative, otherwise keep it absolute
    let targetPath = resolve(this.base, path);
    if (subdir(this.base, targetPath)) targetPath = relative(this.base, targetPath);

    // allow types to be passed as an array or string
    if (isString(types)) types = [types];
    else if (types && (!Array.isArray(types) || !types.every(isString))) {
      throw new TypeError('bad type for types, got:', types);
    }

    // try each of the importers
    for (const importer of this[ENGINE].importers) {
      const result = await importer.execute(targetPath, types);

      if (result) {
        if (result.accessed && !(result.accessed instanceof Set)) {
          throw new Error(`importer's result.accessed should be a Set, if anything`);
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

    // we still haven't found anything.
    // make a final error to throw back to the builder
    const error = new Error('Could not find external import: ' + targetPath);
    error.code = 'ENOENT';
    throw error;
  }


  /**
   * Multi-path version of #importInternal().
   */
  importFirstInternal(paths) {
    let lastError;

    for (const path of paths) {
      let result;
      try {
        result = this.importInternal(path);
      }
      catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
        lastError = error;
        continue;
      }

      return result;
    }

    throw lastError;
  }


  /**
   * Multi-path version of #importExternal().
   */
  async importFirstExternal(paths, types) {
    let lastError;

    for (const path of paths) {
      let result;
      try {
        result = await this.importExternal(path, types);
      }
      catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
        lastError = error;
        continue;
      }

      return result;
    }

    throw lastError;
  }


  /**
   * Main import method.
   * Tries to import the given path internally then externally.
   * Requested types are just a hint to importers (such as the bower one so it knows which `main` file to use).
   */
  async import(path, types) {
    path = resolve(this.base, path);
    if (subdir(this.base, path)) {
      try {
        return this.importInternal(path);
      }
      catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
          throw error;
        }
      }
    }

    return this.importExternal(path, types);
  }


  /**
   * Multi-path version of #import().
   */
  async importFirst(paths, types) {
    let lastError;

    for (const path of paths) {
      let result;
      try {
        result = await this.import(path, types);
      }
      catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
        lastError = error;
        continue;
      }

      return result;
    }

    throw lastError;
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
