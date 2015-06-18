/**
 * Fast collection of pairs of strings (used for mapping many-to-many relations between file paths).
 *
 * API is similar to Set, except that `.add()` and `.remove()` both take two arguments, not one.
 *
 */

import {param, returns} from 'decorate-this';
import {deleteIndex} from 'in-place';


const PAIRS = Symbol();


export default class JoinTable {
  constructor() {
    this[PAIRS] = [];
  }


  @param(String)
  @param(String)
  @returns(JoinTable)
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
  @returns(JoinTable)
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
    return new Set(this[PAIRS].map(([, right]) => right));
  }


  [Symbol.iterator]() {
    return this[PAIRS][Symbol.iterator]();
  }
}
