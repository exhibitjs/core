import sander from 'sander';
import lodash from 'lodash';
import subdir from 'subdir';
import bluebird from 'bluebird';
import micromatch from 'micromatch';
import SourceError from './source-error';
import convertSourceMap from 'convert-source-map';
import combineSourceMap from 'combine-source-map';

const util = {};

Object.defineProperties(util, {
  sander: sander,
  fs: sander,
  lodash: lodash,
  _: lodash,
  subdir: subdir,
  bluebird: bluebird,
  Promise: bluebird,
  micromatch: micromatch,
  SourceError: SourceError,
  convertSourceMap: convertSourceMap,
  combineSourceMap: combineSourceMap,
});

export default util;
