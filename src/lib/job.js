/**
 * Job objects are passed into builder functions. They tell the builder what to do, and proxde methods to import other files in order to complete the job.
 */

import {resolve, relative, isAbsolute, extname} from 'path';
import {param, Optional, ArrayOf} from 'decorate-this';
import {isString, isFunction, isArray} from 'lodash';
import {default as util, micromatch} from './util';
import autobind from 'autobind-decorator';
import {EventEmitter} from 'events';
import subdir from 'subdir';

const INBOX = Symbol();
const ENGINE = Symbol();
const MATCHERS = Symbol();
const IMPORTATIONS = Symbol();

@autobind
export default class Job extends EventEmitter {
  /**
   * Can't move this to a decorated `init` to check types of `inbox`, `engine`
   * etc. due to circular imports problem
   * https://github.com/babel/babel/issues/1150
   */
  constructor({contents, origin, inbox, importations, path, engine, externalImportsCache}) {
    console.assert(engine instanceof require('./engine')); // eslint-disable-line global-require
    console.assert(path && isAbsolute(path), 'need absolute path');
    console.assert(origin && subdir(origin, path), 'path must be within origin');

    super();
    this[ENGINE] = engine;
    this[IMPORTATIONS] = importations;
    this[INBOX] = inbox;
    this[MATCHERS] = new WeakMap();

    this.externalImportsCache = externalImportsCache; // TODO: can't this be set with a symbol, or defineProperty?


    // set fixed properties that builders may access for info about the job
    Object.defineProperties(this, {
      path         : {value: path},
      contents     : {value: contents},
      origin       : {value: origin}, // should this be called origin?
      ext          : {get: () => extname(path)},
      relativePath : {get: () => relative(origin, path)},
    });
  }

  /**
   * Standardised method for builders to use to see if the current job matches the given matcher.
   *
   * A 'matcher' could be anything an end user might have set as an option: a
   * glob, or an array of globs, or just a function that returns true or false.
   */
  matches(matcher) {
    if (isFunction(matcher)) return matcher(this.relativePath);

    // make a micromatch filter function (and memoize it)
    if (!this[MATCHERS].has(matcher)) {
      if (isString(matcher) || (isArray(matcher) && matcher.every(isString))) {
        this[MATCHERS].set(matcher, micromatch.filter(matcher));
      }

      throw new TypeError('matches() expects a function, glob string, or an array of glob strings');
    }

    // use the memoized micromatch filter function
    return this[MATCHERS].get(matcher)(this.relativePath);
  }

  /**
   * Override method just to add type-checking.
   */
  // @param(String)
  emit(...args) {
    if (!isString(args[0])) throw new TypeError('Expected string.');
    super.emit.apply(this, args);
  }

  /**
   * Synchronously imports a file from INSIDE the in-transit project source.
   * Returns {path, contents} where path is a resolved absolute path.
   */
  // @param(String)
  importInternalFile(importPath) {
    importPath = resolve(this.origin, importPath);
    if (!subdir(this.origin, importPath)) {
      throw new Error('importInternalFile cannot import a file outside the source directory');
    }

    this[IMPORTATIONS].add(this.path, importPath);

    const importContents = this[INBOX].read(importPath);

    if (importContents) {
      return Object.defineProperties({}, {
        path: {value: importPath},
        contents: {value: importContents},
      });
    }

    if (false && this[INBOX].isDir(importPath)) { // TODO!!!
      const error = new Error('Is a directory: ' + importPath);
      error.code = 'EISDIR';
      throw error;
    }
    else {
      const error = new Error('Not found: ' + importPath);
      error.code = 'ENOENT';
      throw error;
    }
  }

  /**
   * Asynchronously import a path from OUTSIDE the project source, i.e. using
   * any configured importers.
   * (This method can in fact take an internal-looking path, in which case it
   * will be resolved from the origin dir before being passed to importers.)
   */
  // @param(String)
  // @param(Optional(ArrayOf(String)))
  async importExternalFile(path, types) {
    // normalize the path
    // if it 'looks' internal, make it relative, otherwise keep it absolute
    let targetPath = resolve(this.origin, path);
    if (subdir(this.origin, targetPath)) targetPath = relative(this.origin, targetPath);

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
          this[IMPORTATIONS].add(this.path, resolve(this.origin, accessedPath));
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
   * Multi-path version of #importInternalFile().
   */
  // @param(ArrayOf(String))
  importFirstInternal(paths) {
    let lastError;

    for (const path of paths) {
      let result;
      try {
        result = this.importInternalFile(path);
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
   * Multi-path version of #importExternalFile().
   */
  @param(ArrayOf(String))
  @param(Optional(ArrayOf(String)))
  async importFirstExternal(paths, types) {
    let lastError;

    for (const path of paths) {
      let result;
      try {
        result = await this.importExternalFile(path, types);
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
   * Requested types are just a hint to importers (such as the bower one so it knows which `main` file to use) and only applicable on external imports.
   */
  // @param(String)
  // @param(Optional(ArrayOf(String)))
  async importFile(path, types) {
    console.assert(isString(path) && (types == null || isArray(types)));

    // console.log('YO', path);
    // console.log('TYPES', types);
    path = resolve(this.origin, path);
    if (subdir(this.origin, path)) {
      try {
        return this.importInternalFile(path);
      }
      catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
          throw error;
        }
      }
    }

    return this.importExternalFile(path, types);
  }

  /**
   * Multi-path version of #importFile(), returning the first one that exists.
   */
  // @param(ArrayOf(String))
  // @param(Optional(ArrayOf(String)))
  async importFirst(paths, types) {
    let lastError;

    for (const path of paths) {
      let result;
      try {
        result = await this.importFile(path, types);
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
