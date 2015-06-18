import {param, promises, returns, AnyOf, ArrayOf, Optional} from 'decorate-this';
import {orange, grey, cyan, purple} from './colours';
import {VirtualFolder} from 'virtual-folder';
import PluginContext from './plugin-context';
import {resolve as resolvePath} from 'path';
import isString from 'lodash/lang/isString';
import isObject from 'lodash/lang/isObject';
import JoinTable from './join-table';
import {filter, map} from 'in-place';
import {EventEmitter} from 'events';
import decamelize from 'decamelize';
import Promise from 'bluebird';
import {relative} from 'path';
import Engine from './engine';
import subdir from 'subdir';

const IMPORTATIONS = Symbol();
const OUTPUTTINGS = Symbol();
const EXECUTING = Symbol();
const PREVIOUS = Symbol();
const OUTBOX = Symbol();
const ENGINE = Symbol();
const BASE = Symbol();
const FN = Symbol();


export default class Plugin extends EventEmitter {
  constructor(options) {
    super();
    this.init(options);
  }


  @param({
    fn: Function,
    previous: AnyOf(VirtualFolder, Plugin),
    outbox: VirtualFolder,
    // engine: Engine, // causes weird error
  }, 'Options object')

  init ({fn, previous, outbox, engine, base}) {
    console.assert(engine instanceof Engine);

    this[PREVIOUS] = previous;
    this[OUTBOX] = outbox;
    this[ENGINE] = engine;
    this[FN] = fn;
    this[BASE] = base;

    this[EXECUTING] = false;

    this[IMPORTATIONS] = new JoinTable(); // [buildPath, importPath]
    this[OUTPUTTINGS] = new JoinTable(); // [buildPath, outputPath]
  }


  /**
   * Reads a file from this plugin's outbox.
   * (This method may be used by the next plugin.)
   */
  @param(String, 'Relative file path')
  @returns(Optional(Buffer), 'Either the contents (if any), or null if the path does not exist in this plugin\'s outbox')

  read(path) {
    return this[OUTBOX].read(path);
  }


  /**
   * Execute this plugin for a batch of changes.
   */
  @param(Set/*Of(String)*/)
  @param(Set/*Of(String)*/)
  @promises(ArrayOf({path: String, contents: Optional(Buffer)}))

  async execute(changedInternalPaths, changedExternalPaths) {
    // console.assert([...changedExternalPaths].every(isAbsolute), 'external paths should be absolute');
    // console.assert([...changedInternalPaths].every(!isAbsolute), 'internal paths should be relative');

    if (this[EXECUTING]) throw new Error('Already executing plugin');
    this[EXECUTING] = true;

    if (this[ENGINE].verbose) {
      console.log(orange(`\n      ${changedInternalPaths.size} incoming internal paths`));
      for (const path of changedInternalPaths) {
        console.log(grey('          ' + relative(this[BASE], path)));
      }
      console.log(orange(`\n      ${changedExternalPaths.size} incoming external paths`));
      for (const path of changedExternalPaths) {
        console.log(grey('          ' + path));
      }
    }

    // get the union of all changed paths
    const allChangedPaths = new Set(changedInternalPaths);
    for (const path of changedExternalPaths) allChangedPaths.add(path);

    // get the old mappings, and start new ones
    const oldImportations = this[IMPORTATIONS];
    const oldOutputtings = this[OUTPUTTINGS];
    const newImportations = new JoinTable();
    const newOutputtings = new JoinTable();

    // make a set of files to (try to) build (this may include files that will turn out to have been deleted when we try to read them and they come back null)
    const buildPaths = (() => {
      // include all changed internal paths
      const set = new Set(changedInternalPaths);

      // add buildPaths from previous batches that imported anything
      // that has been changed on this one (internal or external)
      // console.log('oldImportations', oldImportations.getAllLefts(), oldImportations.getAllRights());

      for (const [buildPath, importPath] of oldImportations) {
        // console.log('checking if importPath', importPath, 'is one of the changed ones');
        // console.log('and adding if so', buildPath);

        if (allChangedPaths.has(importPath)) set.add(buildPath);
      }

      return set;
    })();

    // if (this[ENGINE].verbose) {
    //   console.log(orange(`\n    ${buildPaths.size} build paths`));
    //   for (const path of buildPaths) {
    //     console.log('      ' + grey(relative(this[BASE], path)));
    //   }
    // }

    // console.log('buildPaths', buildPaths);

    // make an array to return at the end
    const finalResults = []; // [{path, contents}, ...]

    // capture each individual plugin invocation
    const invocations = {}; // buildPath: promise

    // capture the incoming contents for each file in case a plugin returns true (meaning "pass straight through")
    const contentsBefore = {};

    // (try to) load and build internal changed files, in parallel
    // (nb. some of these may actually have been deleted)
    for (const buildPath of buildPaths) {
      const contents = this[PREVIOUS].read(buildPath);
      // console.log('buildPath contents', buildPath, contents ? JSON.stringify(contents.toString().substring(15)) : 'NULL');

      if (contents) {
        const context = new PluginContext({
          base: this[BASE],
          source: this[PREVIOUS],
          importations: newImportations,
          buildPath,
          engine: this[ENGINE],
        });


        // bubble any errors from the plugin function
        const handleError = originalError => {
          console.error('\n\nERROR', originalError.message);
          console.error(originalError);

          // const error = new PluginError({
          //   message: `Error from plugin ${this.name} building path: ${buildPath}`,
          //   buildPath,
          //   originalError,
          // });
          // this.emit('error', error);
        };

        context.on('error', handleError);

        // invocations[buildPath] = Promise.resolve().then(() => {
        //   return this[FN].call(context, buildPath, contents);
        // }, handleError);

        contentsBefore[buildPath] = contents;
        try {
          invocations[buildPath] = this[FN].call(context, buildPath, contents);
        }
        catch (error) {
          // console.log('CATCHDIS', error);
          handleError(error);
        }
      }
      // else: this file got deleted; no action required - anything that was
      // previously output exclusively because of this path will get deleted
      // at the end automatically.
    }

    // wait till they've all finished
    const invocationResults = await Promise.props(invocations);
    // console.log('invocationResults', invocationResults);

    // add results to final results array
    if (this[ENGINE].verbose) {
      console.log(orange(`\n      ${buildPaths.size} build paths`));
    }

    for (const buildPath of buildPaths) {
      if (!buildPath) continue;

      if (this[ENGINE].verbose) {
        console.log(grey(`          ${relative(this[BASE], buildPath)}`));
      }

      let result = invocationResults[buildPath];
      if (result) {
        // handle the special 'true' case, meaning 'pass straight through'
        if (result === true) {
          result = {};
          result[buildPath] = contentsBefore[buildPath];

          // if (this[ENGINE].verbose) {
          //   console.log(grey(`            (passed straight through)`));
          // }
        }

        console.assert(isObject(result), 'Expected plugin to return an object');

        if (this[ENGINE].verbose) {
          const importedPaths = newImportations.getRightsFor(buildPath);
          if (importedPaths.size) {
            console.log(purple(`              ${importedPaths.size} imports`));
            for (let path of importedPaths) {
              if (subdir(this[BASE], path)) path = relative(this[BASE], path);
              console.log(purple('                -> ') + grey(path));
            }
          }
        }

        const outputPaths = Object.keys(result);

        if (this[ENGINE].verbose && outputPaths.length) {
          console.log(cyan(`              ${outputPaths.length} outputs`));
        }

        for (const path of outputPaths) {
          let contents = result[path];
          if (isString(contents)) contents = new Buffer(contents);
          else console.assert(Buffer.isBuffer(contents), `Expected value for path "${path}" in plugin result object to be string or buffer; got: ` + contents);

          const resolvedResultPath = resolvePath(this[BASE], path);
          newOutputtings.add(buildPath, resolvedResultPath);
          finalResults.push({path: resolvedResultPath, contents});

          if (this[ENGINE].verbose) {
            console.log(cyan('                => ') + grey(relative(this[BASE], resolvedResultPath)));
          }
        }
      }
    }


    // LAST STEPS...

    // carry over any old outputtings where the buildPath is not in this batch's buildPaths set
    for (const [oldBuildPath, oldOutputPath] of oldOutputtings) {
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

        if (this[ENGINE].verbose) deletedPaths.push(path);
      }
    }

    // verbose-log deletions
    if (this[ENGINE].verbose) {
      console.log(orange(`\n      ${deletedPaths.length} previous outgoing paths to delete`));
      for (const path of deletedPaths) {
        console.log('      ' + grey(path));
      }
    }

    // store the new mappings for next time, and return the results
    this[IMPORTATIONS] = newImportations;
    this[OUTPUTTINGS] = newOutputtings;


    // convert the result objects to just actual changes before returning
    filter(
      map(
        finalResults,
        ({path, contents}) => this[OUTBOX].write(path, contents)
      ),
      x => x
    );


    if (this[ENGINE].verbose) {
      console.log(orange(`\n      ${finalResults.length} outgoing changes`));
      for (const change of finalResults) {
        console.log(grey(
          `          ${change.type} ${relative(this[BASE], change.path)} (${change.sizeDifference})`
        ));
      }
    }


    this[EXECUTING] = false;
    return finalResults;
  }


  get name() {
    if (this[FN].name) return decamelize(this[FN].name, '-');
    else return '[anonymous plugin]';
  }
}
