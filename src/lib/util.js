import lodash from 'lodash';
import bluebird from 'bluebird';
import micromatch from 'micromatch';
import SourceError from './source-error';
import convertSourceMap from 'convert-source-map';
import combineSourceMap from 'combine-source-map';

const util = {};

Object.defineProperties(util, {
  lodash: lodash,
  _: lodash,
  bluebird: bluebird,
  Promise: bluebird,
  micromatch: micromatch,
  SourceError: SourceError,
  convertSourceMap: convertSourceMap,
  combineSourceMap: combineSourceMap,
});

export default util;
