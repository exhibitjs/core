# exhibit-core

[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][depstat-image]][depstat-url]

## usage

```js
import Engine from 'exhibit-core';

const engine = new Engine({phases});

engine.batch(files).then(results => {
  // e.g. save results to disk

}).catch(err => console.error(err));

// (followed by further, incremental .batch() calls)
```


<!-- badge URLs -->
[npm-url]: https://npmjs.org/package/multiform-build
[npm-image]: https://img.shields.io/npm/v/multiform-build.svg?style=flat-square

[travis-url]: http://travis-ci.org/callumlocke/multiform-build
[travis-image]: https://img.shields.io/travis/callumlocke/multiform-build.svg?style=flat-square

[depstat-url]: https://david-dm.org/callumlocke/multiform-build
[depstat-image]: https://img.shields.io/david/callumlocke/virtual-folder.svg?style=flat-square
