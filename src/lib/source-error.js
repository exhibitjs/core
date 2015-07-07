/**
 * Error class that builders can elect to use to report an error in a source file. The point of this is to normalise the way errors get printed in the console.
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
 *
 * (the above is a plan, not implemented)
 */

import {red, yellow, grey} from './colours';

const spaces = count => {
  return new Array(count).join(' ');
};


export default class SourceError extends Error {
  constructor({message, warning, path, contents, line, column, endLine, endColumn, maxLines = 8}) {
    super(message);

    define(this, {
      code: 'SOURCE_ERROR',
      message, path, contents, line,
      column, endLine, endColumn, maxLines,
      warning,
    });
  }


  get pathSuffix() {
    let suffix = '';

    if (this.line != null) {
      suffix += ':' + this.line;
      if (this.column != null) suffix += ':' + this.column;
    }

    return suffix;
  }

  /**
   * A coloured ANSI printout that highlights the location of the error.
   */
  get excerpt() {
    let digitGap, line, lineReport, lines, max, mostDigits, report, sourceSplit;

    // array of lines that will form the report
    report = [];

    // add source lines
    if ((this.contents != null) && (this.line != null)) {
      lines = [];

      line = this.line + 1;
      max = this.maxLines;
      mostDigits = ('' + this.line).length + 1;
      sourceSplit = this.contents.toString().split('\n');

      while (line-- > 1 && max-- > 0) {
        digitGap = spaces(mostDigits - ('' + line).length);
        lineReport = '  ' + digitGap + grey(line) + grey(' ┃ ');

        if (line === this.line) lineReport += sourceSplit[line - 1]; // the error line: bright
        else lineReport += grey(sourceSplit[line - 1]); // non-error line: dim

        lines.unshift(lineReport);
      }

      report.push(lines.join('\n'));

      // add a line to show column of error, if provided
      if (this.column != null) {
        digitGap = spaces(mostDigits);
        report.push(
          digitGap + spaces(this.column + 5) +
          (this.warning ? yellow : red)('↑')
        );
      }
      else {
        report.push(''); // blank line for consistent look
      }
    }

    // put it together
    return report.join('\n');

    // return (
    //   this.message + '\n' +
    //   red('  TODO:\n') + grey('  write the pretty printout...')
    // );
  }
}


function define(error, props) {
  Object.keys(props).forEach(name => {
    Object.defineProperty(error, name, {value: props[name]});
  });
}
