# exhibit-core

[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][depstat-image]][depstat-url]

This is the engine at the core of [Exhibit.js](https://github.com/exhibitjs/exhibit). Its separation is mainly for the purpose of breaking up a large codebase.


## usage

```js
import Engine from 'exhibit-core';

const engine = new Engine({builders, importers});

engine.batch(files, changedExternalPaths).then(results => {
  // e.g. save results to disk

}).catch(err => console.error(err));

// (followed by further, incremental .batch() calls)
```

### options

- `builders` - array of builder functions
- `importers` - array of importer functions


<!-- badge URLs -->
[npm-url]: https://npmjs.org/package/exhibit-core
[npm-image]: https://img.shields.io/npm/v/exhibit-core.svg?style=flat-square

[travis-url]: http://travis-ci.org/exhibitjs/core
[travis-image]: https://img.shields.io/travis/exhibitjs/core.svg?style=flat-square

[depstat-url]: https://david-dm.org/exhibitjs/core
[depstat-image]: https://img.shields.io/david/exhibitjs/core.svg?style=flat-square
