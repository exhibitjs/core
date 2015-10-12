# exhibit-core

[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][depstat-image]][depstat-url]

This is the engine at the core of Exhibit.js.

The main [exhibit](https://github.com/exhibitjs/exhibit) module is essentially a wrapper around this engine, adding things that make it more user friendly: watch-triggered batches, logging events, writing out changes to a destination directory, default importers, server and BrowserSync integration etc.

The engine itself is just a manually operated functional system for processing incremental batches of changes to a set of files. It remembers state so it can process subsequent batches quicker. You configure it with builders (without which it would just output whatever you put in) and importers (which are made available to builders for importing external files).


## Usage

```js
import Engine from 'exhibit-core';

const engine = new Engine({builders, importers});

engine.batch(files, changedExternalPaths).then(results => {
  // e.g. save results to disk

}).catch(err => console.error(err));

// (then do further, incremental .batch() calls, passing only changed source files)
```


### Options

- `builders` - array of builder functions
- `importers` - array of importer functions


<!-- badge URLs -->
[npm-url]: https://npmjs.org/package/exhibit-core
[npm-image]: https://img.shields.io/npm/v/exhibit-core.svg?style=flat-square

[travis-url]: http://travis-ci.org/exhibitjs/core
[travis-image]: https://img.shields.io/travis/exhibitjs/core.svg?style=flat-square

[depstat-url]: https://david-dm.org/exhibitjs/core
[depstat-image]: https://img.shields.io/david/exhibitjs/core.svg?style=flat-square
