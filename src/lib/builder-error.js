/**
 * Error class for when a builder returns something dodgy OR when it throws/emits an error (in the latter case, the emitted/thrown error will be set as `originalError`)
 *
 * TODO restructure so these things are two distinct classes of error, not one class you have to duck-check to work out which kind it is
 */

export default class BuilderError extends Error {
  constructor(message, {builder, buildPath, originalError = null}) {
    super(message);

    Object.defineProperties(this, {
      code: {value: 'BUILDER_ERROR'},
      builder: {value: builder},
      buildPath: {value: buildPath},
      originalError: {value: originalError},
    });
  }
}
