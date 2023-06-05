/* eslint-disable max-len */
import { ConfigurationReceiver, FlipOptional, TypedClassType } from "@yab/protocol";
import { injectable } from "tsyringe";

/**
 * Lifecycle of a SequencerModule
 *
 * start(): Executed to execute any logic required to start the module
 */
export abstract class SequencerModule<Config> implements ConfigurationReceiver<Config> {
  private currentConfig?: Required<Config>;

  /**
   * Retrieves the configured config object.
   * This is only available in start(), using this in the constructor will throw an Exception
   */
  public get config(): Required<Config> {
    if (this.currentConfig === undefined) {
      throw new Error("Config has to be initialized before it is retrieved");
    }
    return this.currentConfig;
  }

  public set config(config: Required<Config>) {
    this.currentConfig = config;
  }

  /**
   * Start the module and all it's functionality.
   * The returned Promise has to resolve after initialization, since it will block in the sequencer init.
   * That means that you mustn't await server.start() for example.
   */
  public abstract start(): Promise<void>;

  // eslint-disable-next-line no-warning-comments
  // TODO: Shutdown

  /**
   * Returns the default configuration for all not-undefined fields inside Config
   * For more see ConfigurationReceiver
   */
  public abstract get defaultConfig(): FlipOptional<Config>;
}

export const isSequencerModulePropertyKey = "isSequencerModule";

/**
 * Marks the decorated class as a runtime module, while also
 * making it injectable with our dependency injection solution.
 */
export function sequencerModule() {
  return (target: TypedClassType<SequencerModule<unknown>>) => {
    if (!(target.prototype instanceof SequencerModule)) {
      throw new TypeError(
        `Error applying @runtimeModule() to ${target.name}, did you forget to extend RuntimeModule?`
      );
    }
    injectable()(target);

    Object.defineProperty(target, isSequencerModulePropertyKey, {
      value: true,
    });
  };
}