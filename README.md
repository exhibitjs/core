# exhibit-core

## usage

```js
import Engine from 'exhibit-core';

const engine = new Engine({phases});

engine.batch(files).then(results => {
  // e.g. save results to disk

}).catch(err => console.error(err));

// (followed by further, incremental .batch() calls)
```
