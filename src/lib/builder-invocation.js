/**
 * This class represents a single invocation of a builder, and provides a
 * limited `this.*` API for the builder function.
 */

import isString from 'lodash/lang/isString';
import {resolve, relative} from 'path';
import isAbsolute from 'is-absolute';
import {EventEmitter} from 'events';
import {param} from 'decorate-this';
import subdir from 'subdir';
import util from './util';

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
  constructor({base, inbox, importations, buildPath, engine, externalImportsCache}) {
    super();
    console.assert(engine instanceof require('./engine')); // eslint-disable-line global-require

    this[ENGINE] = engine;
    this[IMPORTATIONS] = importations;
    this[BUILD_PATH] = buildPath;
    this[INBOX] = inbox;

    this.externalImportsCache = externalImportsCache;

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

    this[IMPORTATIONS].add(this[BUILD_PATH], resolve(this.base, path));

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
   * Asynchronously import a path from OUTSIDE the project source, i.e. using
   * any configured importers.
   * (This method can in fact take an internal-looking path, in which case it
   * will be passed to the importers as a relative path from the source dir.)
   */
  async importExternal(path, types) {
    // normalize the path
    // if it 'looks' internal, make it relative, otherwise keep it absolute
    let targetPath = resolve(this.base, path);
    if (subdir(this.base, targetPath)) targetPath = relative(this.base, targetPath);

    // allow types to be passed as an array or string
    if (isString(types)) types = [types];
    else if (types && (!Array.isArray(types) || !types.every(isString))) {
      throw new TypeError('bad type for types, got:', types);
    }

    // try to resolve it from the import cache
    let cacheKey = targetPath;
    if (types) cacheKey += types.join('\n');

    const cachedResult = this.externalImportsCache[cacheKey];
    if (cachedResult) {
      // console.log('cache HIT', JSON.stringify(cacheKey));
      return cachedResult;
    }
    // else console.log('cache MISS', JSON.stringify(cacheKey));

    // try each of the importers
    for (const importer of this[ENGINE].importers) {
      const result = await importer.execute(targetPath, types);

      if (result) {
        if (result.accessed) {
          if (!(result.accessed instanceof Set)) {
            throw new Error(`importer's result.accessed should be a Set, if anything`);
          }
          else if (result.path && !result.accessed.has(result.path)) {
            // this may be overdoing it.
            throw new Error(`importer's result.accessed should at least contain the final resolved path`);
          }
        }

        // record all the paths the importer tried to access
        for (const accessedPath of result.accessed) {
          this[IMPORTATIONS].add(this[BUILD_PATH], resolve(this.base, accessedPath));
        }

        // if this was a successful import, return it
        if (result.contents || result.path) {
          console.assert(Buffer.isBuffer(result.contents), 'imported contents should be a buffer');
          console.assert(isString(result.path) && isAbsolute(result.path), 'imported result should include an absolute resolved path');

          const finalResult = {contents: result.contents, path: result.path};
          this.externalImportsCache[cacheKey] = finalResult;
          return finalResult;
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
   * Requested types are just a hint to importers (such as the bower one so it knows which `main` file to use) and only applicable when it ends up being imported from external.
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
   * Share utlitiy belt
   */
  util = util
}
