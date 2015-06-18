import Promise from 'bluebird';
import {Engine} from '../lib';
import chalk from 'chalk';


export default async function engineTest() {
  const engine = new Engine({
    base: '/some/imaginary/path',

    verbose: true,

    importMissingFile: function () {
      fuck();
    },

    plugins: [
      // pass all changes straight through
      function doNothing(path, contents) {
        console.log('plugin 1:', path, JSON.stringify(contents.toString().substring(0, 20)));
        const results = {};
        results[path] = contents;
        return results;
      },

      // asynchronously filter out .txt files
      function filterOutBadExtensions(path, contents) {
        console.log('plugin 2:', path, JSON.stringify(contents.toString().substring(0, 20)));
        // throw new Error('fuck');
        return Promise.delay(200).then(() => {
          if (/\.(txt|css|html)$/.test(path)) {
            const results = {};
            results[path] = contents;
            return results;
          }
        });
      },

      // add a .map file for every file
      // TODO

      // asynchronously modify files
      function appendExtra(path, contents) {
        return (async function () {
          console.log('plugin 3:', path, JSON.stringify(contents.toString().substring(0, 20)));
          await Promise.delay(100);

          const results = {};
          results[path] = contents + '\n\n<extra>';
          return results;
        })();
      },

      // // add an extra file
      // (path, contents) => {
      //   return files.concat([
      //     {
      //       path: 'extra.txt',
      //       contents: 'added dynamically',
      //     },
      //   ]);
      // },
    ],
  });

  // run a batch
  const files = [
    {
      path: 'foo.txt',
      contents: 'foo foo foo',
    },
    {
      path: 'bar.html',
      contents: 'bar bar bar',
    },
    {
      path: 'one.css',
      contents: new Buffer('one one one'),
    },
  ];

  console.log(chalk.magenta('batch 1'));
  const outFiles = await engine.batch(files);

  console.log('OUTFILES1', outFiles.map(file => {
    return file.path + ' ' + file.contents;
  }));

  console.log(chalk.magenta('batch 2'));
  const outFiles2 = await engine.batch([
    {
      path: 'foo.txt',
      contents: 'foo foo foo',
    },
    {
      path: 'bar.html',
      contents: 'bar bar bard',
    },
    {
      path: 'one.css',
      contents: 'one one one',
    },
    {
      path: 'notallowed.bum',
      contents: 'extension is bad',
    },
  ]);

  console.log('OUTFILES 2', outFiles2.map(file => {
    return file.path + ' ' + file.contents;
  }));

  console.log(chalk.magenta('batch 3'));
  const outFiles3 = await engine.batch([
    {
      path: 'one.css',
      contents: 'changeddddd',
    },
    {
      path: 'bar.html',
      contents: null,
    },
  ]);

  console.log('OUTFILES 3', outFiles3.map(file => {
    return file.path + ' ' + file.contents;
  }));
}
