/**
 * Error class for when a plugin returns something dodgy OR when it throws/emits an error (in the latter case, the emitted/thrown error will be set as `originalError`).
 */

export default class PluginError extends Error {
  constructor({message, pluginIndex, actionFilename, originalError = null}) {
    super(message);

    // super(
    //   `${message} from plugin ${pluginIndex + 1} of ${numPlugins} (${plugin.name || 'anonymous'})` +
    //   ` when processing instruction: ${actionFile.type} ${actionFile.filename}`
    // );

    Object.defineProperties(this, {
      code: {value: 'PLUGIN_ERROR', writable: false},
      pluginIndex: {value: pluginIndex, writable: false},
      actionFilename: {value: actionFilename, writable: false},
      originalError: {value: originalError, writable: false},
    });
  }
}
