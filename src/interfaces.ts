

export type KStorTransform = (key: string, value: any) => any;

// TODO: create types/interfaces
// for query constratins.
export type KStorOperatorsGroup =
  '$eq' | '$gt' | 'gte' | '$lt' | '$lte' | '$ne' | '$not' | '$in' | '$nin' | '$exists' | '$like' | '$regexp' | '$set' | '$and' | '$or' | '$nor';

export interface IMap<T> {
  [key: string]: T;
}

export interface IKStoreOptions {

  /**
   * Name
   * The filename when persisting data store.
   */
  name?: string;

  /**
   * Dir
   * The directory to persist data store to.
   */
  dir?: string;

  /**
   * Entrypoint
   * Allows passing parent object but mapping
   * to a child key for the store.
   */
  entrypoint?: string;

  /**
   * Encrption Key
   * When a value is provided the store will be encrypted.
   */
  encryptionKey?: string;

  /**
   * Transform
   * Optional method to transform data on laoding from JSON.
   */
  transform?: KStorTransform;

}

export interface KStorIterableItem<T> {
  key: string;
  value: T;
}

export interface KStorIterable<T> {
  [Symbol.iterator](): IterableIterator<KStorIterableItem<T>>;
}


