import Promise from 'bluebird';
import Engine from '../lib/engine';

export default async function engineTest() {
  const engine = new Engine({
    phases: [
      // pass all changes straight through
      (files) => {
        return files;
      },

      // asynchronously filter out .txt files
      (files) => {
        return Promise.delay(200).then(() => {
          return files.filter(file => !/\.txt$/.test(file.filename));
        });
      },

      // read in a file that wasn't there
      // TODO

      // asynchronously modify files
      async (files) => {
        await Promise.delay(100);

        return files.map(file => {
          return Promise.delay(50).then(() => {
            if (file.type === 'delete') return file;
            return {
              filename: file.filename,
              contents: file.contents + '\n\n<extra>',
            };
          });
        });
      },

      // add an extra file
      (files) => {
        return files.concat([
          {
            filename: 'extra.txt',
            contents: 'added dynamically',
          },
        ]);
      },
    ],
  });

  // run a batch
  const inFiles = [
    {
      filename: 'foo.txt',
      contents: 'foo foo foo',
    },
    {
      filename: 'bar.html',
      contents: 'bar bar bar',
    },
    {
      filename: 'one.css',
      contents: new Buffer('one one one'),
    },
  ];

  const outFiles = await engine.batch(inFiles);

  console.log('OUTFILES1', outFiles.map(file => {
    return file.filename + ' ' + file.contents;
  }));

  const outFiles2 = await engine.batch([
    {
      filename: 'foo.txt',
      contents: 'foo foo foo',
    },
    {
      filename: 'bar.html',
      contents: 'bar bar bard',
    },
    {
      filename: 'one.css',
      contents: 'one one one',
    },
  ]);

  console.log('OUTFILES 2', outFiles2.map(file => {
    return file.filename + ' ' + file.contents;
  }));

  const outFiles3 = await engine.batch([
    {
      filename: 'one.css',
      contents: 'changeddddd',
    },
    {
      filename: 'bar.html',
      contents: null,
    },
  ]);

  console.log('OUTFILES 3', outFiles3.map(file => {
    return file.filename + ' ' + file.contents;
  }));
}
