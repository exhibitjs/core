/**
 * Error class for when a plugin returns something dodgy OR when it throws/emits an error (in the latter case, the emitted/thrown error will be set as `originalError`).
 */

export default class PluginError extends Error {
  constructor(message, {plugin, buildPath, originalError = null}) {
    super(message);

    Object.defineProperties(this, {
      code: {value: 'PLUGIN_ERROR'},
      plugin: {value: plugin},
      buildPath: {value: buildPath},
      originalError: {value: originalError},
    });
  }
}
