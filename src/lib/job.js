/**
 * Jobs are passed into builder functions.
 * They specify what needs to be built and provide helper methods.
 */

import {isString, isFunction, isArray, isRegExp} from 'lodash';
// import {param, Optional, ArrayOf} from 'decorate-this';
import {default as util, micromatch} from './util';
import autobind from 'autobind-decorator';
import {EventEmitter} from 'events';
import subdir from 'subdir';
import path from 'path';

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
    console.assert(file && path.isAbsolute(file), 'need absolute path');
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
      ext          : {get: () => path.extname(file)},
      fileRelative : {get: () => path.relative(base, file)},
    });
  }

  /**
   * Standard method for builders to use to check the current job against a given matcher.
   *
   * A 'matcher' could be anything an end user might have set as an option: a
   * glob, or an array of globs, or just a function that returns true or false.
   * nb. a filename is also a valid glob.
   */
  matches(matcher) {
    // allow plugins to do eg: matches(opts.skip) when .skip is not set
    if (!matcher) return false;

    // make a micromatch filter function (and memoize it)
    if (!matchers.has(matcher)) {
      if (
        isString(matcher) || (isArray(matcher) && matcher.every(isString)) ||
        isRegExp(matcher) || isFunction(matcher)
      ) {
        matchers.set(matcher, micromatch.filter(matcher));
      }
      else {
        throw new TypeError(
          'Exhibit: matches() expects a function, string, array of strings, or regular expression'
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
  importInternalFile(importFile) {
    importFile = path.resolve(this.base, importFile);
    if (!subdir(this.base, importFile)) {
      throw new Error('importInternalFile cannot import a file outside the base directory');
    }

    this[IMPORTATIONS].add(this.file, importFile);

    const importContents = this[INBOX].read(importFile);

    if (importContents) {
      return Object.defineProperties({}, {
        file: {value: importFile},
        contents: {value: importContents},
      });
    }

    if (false && this[INBOX].isDir(importFile)) { // TODO!!!
      const error = new Error('Is a directory: ' + importFile);
      error.code = 'EISDIR';
      throw error;
    }
    else {
      const error = new Error('Not found: ' + importFile);
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
  async importExternalFile(file, types) {
    // normalize the file path: if it looks internal, make it relative,
    // otherwise keep it absolute
    file = path.resolve(this.base, file);
    if (subdir(this.base, file)) file = path.relative(this.base, file);

    // allow types to be passed as an array or string
    if (isString(types)) types = [types];
    else if (types && (!Array.isArray(types) || !types.every(isString))) {
      throw new TypeError('bad type for types, got:', types);
    }

    // try each importer in turn until a result is found
    for (const importer of this[ENGINE].importers) {
      const result = await importer.execute(file, types);

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
        for (const accessedFile of result.accessed) {
          this[IMPORTATIONS].add(this.file, path.resolve(this.base, accessedFile));
        }

        // if this was a successful import, return it
        if (result.contents || result.file) {
          console.assert(
            Buffer.isBuffer(result.contents),
            'imported contents should be a buffer'
          );
          console.assert(
            isString(result.file) && path.isAbsolute(result.file),
            'imported result should include an absolute resolved file path'
          );

          return {
            contents: result.contents,
            file: result.file,
          };
        }
      }
    }

    // we still haven't found anything.
    // make a final error to throw back to the builder
    const error = new Error('Could not find external import: ' + file);
    error.code = 'ENOENT';
    throw error;
  }

  /**
   * Multi-path version of #importInternalFile(). Tries all provided file paths
   * in turn and returns the first that matches.
   */
  // @param(ArrayOf(String))
  importFirstInternal(files) {
    let lastError;

    for (const file of files) {
      let result;
      try {
        result = this.importInternalFile(file);
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
  // @param(ArrayOf(String))
  // @param(Optional(ArrayOf(String)))
  async importFirstExternal(files, types) {
    let lastError;

    for (const file of files) {
      let result;
      try {
        result = await this.importExternalFile(file, types);
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
  async importFile(file, types) {
    console.assert(isString(file) && (types == null || isArray(types)));

    file = path.resolve(this.base, file);
    if (subdir(this.base, file)) {
      try {
        return this.importInternalFile(file);
      }
      catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
          throw error;
        }
      }
    }

    return this.importExternalFile(file, types);
  }

  /**
   * Multi-path version of #importFile(), returning the first one that exists.
   */
  // @param(ArrayOf(String))
  // @param(Optional(ArrayOf(String)))
  async importFirst(files, types) {
    let lastError;

    for (const file of files) {
      let result;
      try {
        result = await this.importFile(file, types);
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
   * Returns the closest file to the current file (checking in its dir, then the parent, etc...)
   * that has the given basename.
   */
  async importClosest(basename, types) {
    // establish array of directories to try
    const levels = path.dirname(this.file).split(path.sep);
    const tryDirs = [];
    for (let i = levels.length - 1; i > 1; i--) {
      const dir = [];
      for (let j = 0; j < i; j++) dir[j] = levels[j];
      dir[i] = basename;
      tryDirs.push(dir.join(path.sep));
    }

    // try them
    return this.importFirst(tryDirs, types);
  }

  /**
   * Make utility belt available to the builder function.
   */
  util = util
}
