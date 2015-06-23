/**
 * Class for small collections of pairs of strings, used for remembering
 * many-to-many relationships between file paths. In this class the two sides
 * are just known as 'lefts' and 'rights'; it is up to the caller to know what
 * means what (e.g. lefts = importers and rights = importees).
 */

import {param, returns} from 'decorate-this';
import {deleteIndex} from 'in-place';


const PAIRS = Symbol();


export default class PathPairSet {
  constructor() {
    this[PAIRS] = [];
  }


  @param(String)
  @param(String)
  @returns(PathPairSet)
  add(left, right) {
    const pairs = this[PAIRS];

    // if this pairing already exists, do nothing
    for (let i = 0, l = pairs.length; i < l; i++) {
      const pair = pairs[i];

      if (pair[0] === left && pair[1] === right) return this;
    }

    this[PAIRS].push([left, right]);

    return this;
  }


  @param(String)
  @param(String)
  @returns(PathPairSet)
  remove(left, right) {
    const pairs = this[PAIRS];

    for (let i = 0, l = pairs.length; i < l; i++) {
      const pair = pairs[i];

      if (pair[0] === left && pair[1] === right) {
        deleteIndex(pairs, i);
        return this;
      }
    }

    return this;
  }


  /**
   * Retrieves all 'lefts' associated with the given 'right'.
   */
  @param(String)
  @returns(Set)
  getLeftsFor(what) {
    const pairs = this[PAIRS];
    const results = new Set();

    for (let i = 0, l = pairs.length; i < l; i++) {
      const [left, right] = pairs[i];

      if (right === what) results.add(left);
    }

    return results;
  }


  /**
   * Retrieves all 'rights' associated with the given 'left'.
   */
  @param(String)
  @returns(Set)
  getRightsFor(what) {
    const pairs = this[PAIRS];
    const results = new Set();

    for (let i = 0, l = pairs.length; i < l; i++) {
      const [left, right] = pairs[i];

      if (left === what) results.add(right);
    }

    return results;
  }


  @param(String)
  @returns(Set)
  getAllLefts() {
    return new Set(this[PAIRS].map(([left]) => left));
  }



  @param(String)
  @returns(Set)
  getAllRights() {
    const set = new Set();
    for (const [, right] of this[PAIRS]) set.add(right);
    return set;
  }


  [Symbol.iterator]() {
    return this[PAIRS][Symbol.iterator]();
  }
}
