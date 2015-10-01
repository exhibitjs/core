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
  sander, lodash, subdir, bluebird, micromatch, SourceError,
  convertSourceMap, combineSourceMap,
  Promise: bluebird, _: lodash, fs: sander,
});

export default util;
