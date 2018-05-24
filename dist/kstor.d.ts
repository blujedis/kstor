/// <reference types="node" />
import { EventEmitter } from 'events';
import { IMap, IKStoreOptions } from './';
export declare class KStor<C> extends EventEmitter {
    private _loaded;
    private _dirty;
    private _writing;
    private _loaded_defaults;
    private _cache;
    path: string;
    options: IKStoreOptions;
    constructor();
    constructor(options: IKStoreOptions, defaults?: IMap<any>);
    constructor(name?: string | IKStoreOptions, defaults?: IMap<any>, options?: IKStoreOptions);
    /**
     * Iterator
     */
    [Symbol.iterator](): IterableIterator<{
        key: string;
        value: any;
    }>;
    /**
     * Exit Handler
     * Ensures write finishes before exit.
     *
     * @param type the type of exit.
     * @param codeOrErr the code or error upon exit.
     */
    private exitHandler(type, codeOrErr);
    private createHash();
    /**
     * Ensure Dir
     * Ensures the directory exists.
     */
    private ensureDir();
    /**
     * Normalize Key
     * Normalizes key prefixing with superkey if exists.
     *
     * @param key the key to be normalized.
     */
    private normalizeKey(key);
    /**
     * Has Listener
     * Checks if the Event Emitter contains a listener for the given key.
     *
     * @param key the key to inspect eventNames for.
     */
    private hasListener(key);
    /**
     * Ensure Default
     * Ensures a default value.
     *
     * @param val the value to be inpsected.
     * @param def the default value if val is undefined.
     */
    private ensureDefault(val, def?);
    /**
     * Transform
     * Runs transform from options.
     *
     * @param data the data to be transformed.
     */
    private transform(data);
    db: C;
    /**
     * For Each
     * Sames as [...instance] here for convenience.
     */
    readonly iterable: {
        key: string;
        value: any;
    }[];
    /**
     * Size
     * Gets the size of keys using iterable.
     */
    readonly size: number;
    /**
     * Get Path
     * Creates path for persisting data.
     *
     * @param options options to be used for generating path.
     */
    getPath(options?: IKStoreOptions): string;
    /**
     * Defaults
     * Ensures defaults in store.
     *
     * @param args array of default sources.
     */
    defaults(data: any): this;
    /**
     * Has Key
     * Checks if store has the specified key.
     *
     * @param key the key to inspect.
     */
    has(key: string): boolean;
    /**
     * Get
     * : Gets value for the provided key.
     *
     * @param key the key for looking up store value.
     * @param def a default value.
     */
    get<T>(key: string, def?: any): T;
    /**
     * Set
     * Sets a value for key.
     *
     * @param key the key to set.
     * @param value the value to set for specified key.
     */
    set(key: string | IMap<any>, value?: any): this;
    /**
     * Del
     * : Removes a key from the store.
     *
     * @param key the key to be removed.
     */
    del(key: string): this;
    /**
     * Query Value
     * Validates if value matches query expression.
     *
     * @param operator the operator used to validate value.
     * @param filter the comparator value used in validation.
     * @param value the current value to evaluate.
     */
    private queryValue(operator, filter, value);
    /**
     * Normalize Query
     * Normalizes the query merging $and, $or.
     *
     * @param query
     */
    private queryNormalize(query);
    /**
     * Query Row
     * Queries a row in the collection.
     *
     * @param row the row to be inspected.
     * @param query the expressions used to query the row.
     */
    private queryRow(key, row, query);
    /**
     * Query
     * Allow for querying a nosql styled collection.
     *
     * @example
     * store.query('users', { age: { $gte: 21 }, active: { $eq: true }})
     *
     * @param key top leve key of the desired collection.
     * @param query object containing the query expression.
     * @param skip skips the number of rows specified.
     * @param take returns rows once found count matches number.
     */
    query<T>(key: string, query?: IMap<any>, skip?: number, take?: number): {
        [key: string]: T;
    };
    /**
     * Clear
     * Clears the store basically {}
     */
    clear(): this;
    /**
     * Snapshot
     * Gets a snapshot of the store's state.
     */
    snapshot(): C;
}
