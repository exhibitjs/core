/**
 * Error class for any error coming from a builder.
 *
 * originalError is the real error. Often this will be a SourceError or something else thrown by the builder. Or it may be an error thrown by Exhibit because the builder returned something invalid.
 *
 * The point of this 'wrapper' error class is to provide a consistent API for finding out which builder had the error, and which file it was building at the time.
 */

export default class BuilderError extends Error {
  constructor(message, {builder, buildPath, originalError = null}) {
    super(message);

    Object.defineProperties(this, {
      code          : {value: 'BUILDER_ERROR'},
      builder       : {value: builder},
      buildPath     : {value: buildPath},
      originalError : {value: originalError},
    });
  }
}
