/**
 * Jobs are passed into builder functions.
 * They specify what needs to be built and provide helper methods.
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
const IMPORTATIONS = Symbol();

// a global memo bank for matcher functions
const matchers = new Map();

@autobind
export default class Job extends EventEmitter {
  constructor({contents, base, inbox, importations, file, engine}) {
    super();

    // we can't use a decorated `init` to check types of `inbox`, `engine`
    // etc. due to circular imports problem: https://github.com/babel/babel/issues/1150
    console.assert(engine instanceof require('./engine')); // eslint-disable-line global-require
    console.assert(file && isAbsolute(file), 'need absolute path');
    console.assert(base && subdir(base, file), 'path must be within base');

    this[ENGINE] = engine;

    // a PathPairSet provided by the builder for this job to fill up
    this[IMPORTATIONS] = importations;

    // the cache preceding the current builder (we may need to read from it to satisfy imports)
    this[INBOX] = inbox;

    // set fixed properties that builders may access for info about the job
    Object.defineProperties(this, {
      file         : {value: file},
      contents     : {value: contents},
      base         : {value: base},
      ext          : {get: () => extname(file)},
      fileRelative : {get: () => relative(base, file)},
    });
  }

  /**
   * Standardised method for builders to use to see if the current job matches the given matcher.
   *
   * A 'matcher' could be anything an end user might have set as an option: a
   * glob, or an array of globs, or just a function that returns true or false.
   * nb. a filename is also a valid glob.
   */
  matches(matcher) {
    // allow plugins to do eg: matches(opts.skip) when .skip is not set
    if (!matcher) return false;

    // if it's a custom matcher function, just use it
    if (isFunction(matcher)) return matcher(this.fileRelative);

    // make a micromatch filter function (and memoize it)
    if (!matchers.has(matcher)) {
      if (isString(matcher) || (isArray(matcher) && matcher.every(isString))) {
        matchers.set(matcher, micromatch.filter(matcher));
      }
      else {
        throw new TypeError(
          'matches() expects a function, glob string, or an array of glob strings'
        );
      }
    }

    // use the memoized micromatch filter function
    return matchers.get(matcher)(this.fileRelative);
  }

  /**
   * Override emit() to add type-checking.
   */
  emit(...args) {
    if (!isString(args[0])) throw new TypeError('Expected string.');
    super.emit.apply(this, args);
  }

  /**
   * Synchronously imports a file from INSIDE the in-transit project source.
   * Returns `{file, contents}`, where `file` is a resolved absolute path.
   */
  importInternalFile(importPath) {
    importPath = resolve(this.base, importPath);
    if (!subdir(this.base, importPath)) {
      throw new Error('importInternalFile cannot import a file outside the base directory');
    }

    this[IMPORTATIONS].add(this.file, importPath);

    const importContents = this[INBOX].read(importPath);

    if (importContents) {
      return Object.defineProperties({}, {
        file: {value: importPath},
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
   * Asynchronously import a file from OUTSIDE the project source, i.e. using
   * any configured importers.
   * (This method can in fact take an internal-looking path, in which case it
   * will be resolved from the base dir before being passed to importers.)
   */
  // @param(String)
  // @param(Optional(ArrayOf(String)))
  async importExternalFile(importPath, types) {
    // normalize the path...
    // if it 'looks' internal, make it relative, otherwise keep it absolute
    let targetPath = resolve(this.base, importPath);
    if (subdir(this.base, targetPath)) targetPath = relative(this.base, targetPath);

    // allow types to be passed as an array or string
    if (isString(types)) types = [types];
    else if (types && (!Array.isArray(types) || !types.every(isString))) {
      throw new TypeError('bad type for types, got:', types);
    }

    // try each importer in turn until a result is found
    for (const importer of this[ENGINE].importers) {
      const result = await importer.execute(targetPath, types);

      if (result) {
        if (result.accessed) {
          if (!(result.accessed instanceof Set)) {
            throw new Error(`importer's result.accessed should be a Set, if anything`);
          }
          else if (result.file && !result.accessed.has(result.file)) {
            // this may be overcautious.
            throw new Error(
              `importer's result.accessed should at least contain the final resolved path`
            );
          }
        }

        // record all the paths the importer tried to access
        for (const accessedPath of result.accessed) {
          this[IMPORTATIONS].add(this.file, resolve(this.base, accessedPath));
        }

        // if this was a successful import, return it
        if (result.contents || result.file) {
          console.assert(Buffer.isBuffer(result.contents), 'imported contents should be a buffer');
          console.assert(isString(result.file) && isAbsolute(result.file), 'imported result should include an absolute resolved file path');

          return {contents: result.contents, file: result.file};
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
   * Requested types are just a hint to importers (such as the bower one so it
   * knows which `main` to prefer) and are only applicable on external imports.
   */
  // @param(String)
  // @param(Optional(ArrayOf(String)))
  async importFile(path, types) {
    console.assert(isString(path) && (types == null || isArray(types)));

    path = resolve(this.base, path);
    if (subdir(this.base, path)) {
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
   * Make utility belt available to the builder function.
   */
  util = util
}
