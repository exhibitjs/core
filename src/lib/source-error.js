/**
 * Error class that plugins can elect to use to report an error in a source file. The point of this is to normalise the way errors get printed in the console.
 *
 * message - just the problem, no filename/line number etc.
 * filename
 *
 * Plus if it's a text file, it should have as many of these properties as possible:
 * text - the complete text contents of the file
 * line
 * column
 * endLine
 * endColumn
 *
 * (Those four last properties are all integers starting from 1.)
 */

import {red, grey} from './colours';

export default class SourceError extends Error {
  constructor({message, filename, text, line, column, endLine, endColumn}) {
    super(message);

    define(this, {
      code: 'SOURCE_ERROR',
      message, filename, text, line, column, endLine, endColumn,
    });
  }


  /**
   * A coloured ANSI printout that highlights the location of the error.
   */
  get printout() {
    return (
      this.message + '\n' +
      red('  TODO:\n') + grey('  write the pretty printout...')
    );
  }
}


function define(error, props) {
  Object.keys(props).forEach(function (name) {
    Object.defineProperty(error, name, {value: props[name], writable: false});
  });
}
