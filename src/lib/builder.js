/**
 * Execution harness for a builder function.
 */

import {param, promises, ArrayOf, Optional} from 'decorate-this';
import {orange, grey, cyan, purple} from './colours';
import {VirtualFolder} from 'virtual-folder';
import {resolve as resolvePath} from 'path';
import {isString, isObject} from 'lodash';
import BuilderError from './builder-error';
import PathPairSet from './path-pair-set';
import {filter, map} from 'in-place';
import Harness from './harness';
import Promise from 'bluebird';
import {relative} from 'path';
import Engine from './engine';
import Job from './job';

const BASE = Symbol();
const INBOX = Symbol();
const ENGINE = Symbol();
const OUTPUTTINGS = Symbol();
const IMPORTATIONS = Symbol();

export default class Builder extends Harness {
  constructor(options) {
    super(options.fn);
    this.init(options);
  }

  @param({
    fn: Function,
    inbox: VirtualFolder,
    outbox: VirtualFolder,
    // engine: Engine, // causes weird error
  })
  init({inbox, outbox, engine, base}) {
    console.assert(engine instanceof Engine);

    this[INBOX] = inbox;
    this[ENGINE] = engine;
    this[BASE] = base;

    this[IMPORTATIONS] = new PathPairSet(); // [buildPath, importPath]
    this[OUTPUTTINGS] = new PathPairSet(); // [buildPath, outputPath]

    // non-symbol keys for props that need to be externally accessible (but read-only)
    Object.defineProperties(this, {
      outbox                    : {value: outbox},
      externalImportsCache      : {value: {}}, // requestedImportPath: result
      externalImportResolutions : {value: {}}, // requestedImportPath: realPath
    });
  }

  /**
   * Executes this builder for a batch of changes.
   */
  @param(Set) // SetOf(String) not working?
  @param(Set) // same
  @promises(ArrayOf({path: String, contents: Optional(Buffer)}))
  async execute(changedInternalPaths, changedExternalPaths) {
    const {verbose} = this[ENGINE];

    if (verbose) {
      console.log(orange(`\n      ${changedInternalPaths.size} incoming internal paths`));
      for (const path of changedInternalPaths) {
        console.log(grey('          ' + relative(this[BASE], path)));
      }
      console.log(orange(`\n      ${changedExternalPaths.size} incoming external paths`));
      for (const path of changedExternalPaths) console.log(grey('          ' + path));
    }

    // get the union of all changed paths
    const allChangedPaths = new Set(changedInternalPaths);
    for (const path of changedExternalPaths) allChangedPaths.add(path);

    // get the old mappings, and start new ones
    const oldImportations = this[IMPORTATIONS];
    const oldOutputtings = this[OUTPUTTINGS];
    const newImportations = new PathPairSet();
    const newOutputtings = new PathPairSet();

    // make a set of files to (try to) build (this may include files that will turn out to have been deleted when we try to read them and they come back null)
    const buildPaths = (() => {
      // include all changed internal paths
      const set = new Set(changedInternalPaths);

      // add buildPaths from previous batches that imported anything
      // that has been changed on this one (internal or external)
      for (const [buildPath, importPath] of oldImportations) {
        if (allChangedPaths.has(importPath)) set.add(buildPath);
      }

      return set;
    })();

    // todo: delete anything in the externalImportsCache that might have been changed? not sure when to do this
      // if (this.externalImportsCache[path]) {
      //   console.log('DELETING CACHED EXTERNAL IMPORT', path);
      //   delete this.externalImportsCache[path];

      //   // also delete any resolutions to it
      //   for (var requestPath in this.externalImportResolutions) {
      //     if (this.externalImportResolutions.hasOwnProperty(requestPath)) {
      //       if (this.externalImportResolutions[requestPath] === path) {
      //         delete this.externalImportResolutions[requestPath];
      //       }
      //     }
      //   }
      // }

    // make an array to return at the end
    const finalResults = []; // [{path, contents}, ...]

    // capture each individual builder invocation
    const invocations = {}; // buildPath: promise

    // capture the incoming contents for each file in case a builder returns true (meaning "pass straight through")
    // const contentsBefore = {};

    // (try to) load and build internal changed files, in parallel
    // (nb. some of these may actually have been deleted)
    for (const buildPath of buildPaths) {
      const contents = this[INBOX].read(buildPath);

      if (contents) {
        const job = new Job({
          path: buildPath,
          contents,
          origin: this[BASE],
          inbox: this[INBOX],
          importations: newImportations,
          engine: this[ENGINE],
          externalImportsCache: this.externalImportsCache,
        });

        // for any errors coming from a builder (either purposefully emitted/thrown due to source
        // code errors or caused by invalid output from a builder), wrap the rror
        const handleError = originalError => {
          const error = new BuilderError(`Error from builder ${this.name} building path: ${buildPath}`, {
            builder: this,
            buildPath,
            originalError,
          });

          this.emit('error', error);
        };

        job.on('error', handleError); // handle emitted errors

        // contentsBefore[buildPath] = contents;

        invocations[buildPath] = Promise.resolve().then(() => {
          return this.fn.call(null, job);
        }).catch(handleError);
      }
      // else: this file got deleted; no action required - anything that was
      // previously output exclusively because of this path will get deleted
      // at the end automatically.
    }

    // wait till they've all finished
    let invocationResults;
    try {
      invocationResults = await Promise.props(invocations);
    }
    catch (error) {
      console.log('bug 9786123', error);
      throw error;
    }

    // console.log('builder invocationResults', invocationResults);
    if (verbose) console.log(orange(`\n      ${buildPaths.size} build paths`));

    // add results to finalResults array
    for (const buildPath of buildPaths) {
      if (!buildPath) continue;

      if (verbose) {
        console.log(grey(`          ${relative(this[BASE], buildPath)}`));
      }

      let result = invocationResults[buildPath];
      if (result) {
        // handle builder returning just a contents buffer/string
        if (Buffer.isBuffer(result) || isString(result)) {
          const newContents = result;
          result = {};
          result[buildPath] = newContents;
        }

        console.assert(isObject(result), 'Builder return value invalid');
        console.assert(!(result instanceof Job), 'Builder returned a job');

        if (verbose) {
          const importedPaths = newImportations.getRightsFor(buildPath);
          if (importedPaths.size) {
            console.log(purple(`              ${importedPaths.size} [attempted] imports`));
            for (let path of importedPaths) {
              console.log(purple('                <- ') + grey(path));
            }
          }
        }

        const outputPaths = Object.keys(result);

        if (verbose && outputPaths.length) {
          console.log(cyan(`              ${outputPaths.length} outputs`));
        }

        for (const path of outputPaths) {
          let contents = result[path];
          if (isString(contents)) contents = new Buffer(contents);
          else console.assert(Buffer.isBuffer(contents), `Expected value for path "${path}" in ${this.name} result object to be string or buffer; got: ` + contents);

          const resolvedResultPath = resolvePath(this[BASE], path);
          newOutputtings.add(buildPath, resolvedResultPath);
          finalResults.push({path: resolvedResultPath, contents});

          if (verbose) {
            console.log(cyan('                => ') + grey(relative(this[BASE], resolvedResultPath)));
          }
        }
      }
    }

    // LAST STEPS...

    // carry over any old outputtings where the buildPath is not in this batch's buildPaths set
    for (const [oldBuildPath, oldOutputPath] of oldOutputtings) {
      console.assert(isString(oldBuildPath), 'left should be string, got ' + oldBuildPath);
      console.assert(isString(oldOutputPath), 'right should be string, got ' + oldOutputPath);
      if (!buildPaths.has(oldBuildPath)) {
        // this one didn't get built this time. just carry over this outputting for this time
        newOutputtings.add(oldBuildPath, oldOutputPath);
      }
    }

    // carry over old importations too (where the build path is not in this batch's buildPaths set)
    for (const [oldBuildPath, oldResolvedImportPath] of oldImportations) {
      if (!buildPaths.has(oldBuildPath)) {
        newImportations.add(oldBuildPath, oldResolvedImportPath);
      }
    }

    // delete anything that was output last time but not this time
    const oldOutputPaths = oldOutputtings.getAllRights();
    const newOutputPaths = newOutputtings.getAllRights();
    let deletedPaths = [];
    for (const path of oldOutputPaths) {
      if (!newOutputPaths.has(path)) {
        finalResults.push({path, contents: null}); // null = delete it

        if (verbose) deletedPaths.push(path);
      }
    }

    // verbose-log deletions
    if (verbose) {
      console.log(orange(`\n      ${deletedPaths.length} previous outgoing paths to delete`));
      for (const path of deletedPaths) {
        console.log('      ' + grey(path));
      }
    }

    // store the new mappings for next time, and return the results
    this[IMPORTATIONS] = newImportations;
    this[OUTPUTTINGS] = newOutputtings;

    // convert the result objects to just actual changes before returning
    filter(map(
      finalResults,
      ({path, contents}) => this.outbox.write(path, contents)
    ), x => x);


    if (verbose) {
      console.log(orange(`\n      ${finalResults.length} outgoing changes`));
      for (const change of finalResults) {
        console.log(grey(
          `          ${change.type} ${relative(this[BASE], change.path)} (${change.sizeDifference})`
        ));
      }
    }

    return finalResults;
  }
}
