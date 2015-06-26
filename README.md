# exhibit-core

[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][depstat-image]][depstat-url]

A library for incrementally building files in batches. This is the engine at the core of [Exhibit](https://github.com/exhibitjs/exhibit).


## usage

```js
import Engine from 'exhibit-core';

const engine = new Engine({plugins, importer});

engine.batch(files, changedExternalPaths).then(results => {
  // e.g. save results to disk

}).catch(err => console.error(err));

// (followed by further, incremental .batch() calls)
```

<!-- badge URLs -->
[npm-url]: https://npmjs.org/package/exhibit-core
[npm-image]: https://img.shields.io/npm/v/exhibit-core.svg?style=flat-square

[travis-url]: http://travis-ci.org/exhibitjs/core
[travis-image]: https://img.shields.io/travis/exhibitjs/core.svg?style=flat-square

[depstat-url]: https://david-dm.org/exhibitjs/core
[depstat-image]: https://img.shields.io/david/exhibitjs/core.svg?style=flat-square
