# exhibit-core

[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][depstat-image]][depstat-url]

A library for incrementally building files in batches. This is the engine at the core of [Exhibit](https://github.com/exhibitjs/exhibit).


## usage

```js
import Engine from 'exhibit-core';

const engine = new Engine({plugins, importer});

engine.batch(changedInternalPaths, changedExternalPaths).then(results => {
  // e.g. save results to disk

}).catch(err => console.error(err));

// (followed by further, incremental .batch() calls)
```

### constructor options

#### `plugins`

- array of plugin functions of signature: `function pluginName(path, contents) {}`
- should return (or promise) an object of output files like this:
  `{'some/file.html': contents, 'some/other/file.html': contents}`
- only a single file is passed in (as two args: path and contents)
- files the plugin is not interested in should generally be passed through unchanged, unless you want to block those files from getting through
- some plugin functions will only want to output single files, but you may output more than one for e.g. external sourcemaps, or for things like revving and modifying the names of files


#### `importExternalFile`

- a function for importing files from outside.
- this can also actually ask for an internal path too, in which case you should remap it to any configured load paths and try those.
- should take a single `path` argument, which is a string that may be relative or absolute. If relative, you should check it against whatever load paths you have available (e.g. `bower_components`) but you should *not* load files from whatever on-disk source directory you are using to initiate batches.
- should return a promise that resolves with an object with `path` and `contents` properties, or rejects if nothing can be found to satisfy the import.
  - the `path` should be the resolved absolute path to the file you found.
    - why does the engine care what the resolved path is? So it can intelligently handle `changedExternalPaths` later.
  - the `contents` should be a buffer.

#### `statExternalFile`
- same logic but stat.

#### `readdir`
- same again but for readdir.


### `.batch(files, changedExternalPaths)`

- `changedInternalPaths` and `changedExternalPaths` are Sets of path
- `changedExternalPaths`

<!-- badge URLs -->
[npm-url]: https://npmjs.org/package/exhibit-js
[npm-image]: https://img.shields.io/npm/v/exhibit-js.svg?style=flat-square

[travis-url]: http://travis-ci.org/exhibitjs/core
[travis-image]: https://img.shields.io/travis/exhibitjs/core.svg?style=flat-square

[depstat-url]: https://david-dm.org/exhibitjs/core
[depstat-image]: https://img.shields.io/david/exhibitjs/core.svg?style=flat-square
