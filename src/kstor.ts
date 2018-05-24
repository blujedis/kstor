
import { homedir } from 'os';
import { readFileSync } from 'graceful-fs';
import * as writeAtomic from 'write-file-atomic';
import * as makedir from 'make-dir';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { basename, parse, resolve, join, dirname } from 'path';
import { get, set, del, has, isPlainObject, isBoolean, isString, isError, clone, isFunction, isValue, keys, containsAny, isObject, isBuffer, isUndefined, isRegExp, isEmpty, toArray, toMap, isDate, isSymbol, contains, extend } from 'chek';
import { IMap, IKStoreOptions, KStorIterable } from './';


const ENCRYPTION_ALGORITHIM = 'aes-256-cbc';
const IV_LEN = 16;
const HASH_ALGORITHIM = 'sha256';

// DEFAULTS

const DEFAULTS: IKStoreOptions = {
  name: null,              // custom name, defaults to directory name.
  dir: null,               // custom dir to save to, defaults to $HOME/kstor/name.json
  entrypoint: null,        // enables passing object then mapping to specific key.
  encryptionKey: null,     // optional key for encrypting stores.
  transform: null          // optional transform to run data through on load.
};

// EVENTS

// loaded      (newValue, oldValue)
// persisted   (newValue, oldValue)
// changed     (newValue, oldValue)
// deleted     (oldValue)

const createObj = () => Object.create(null);

export class KStor<C> extends EventEmitter {

  private _loaded: boolean;    // indicates the db has loaded from file system.
  private _dirty: boolean;     // indicates data is dirty and should be reloaded.
  private _writing: boolean;   // Kstor is persisting data.
  private _loaded_defaults: boolean;  // flag indicating if defaults have been set.
  private _cache: any = {};    // cached local top level data.

  path: string;                        // filepath for persisting.
  options: IKStoreOptions;             // KStor options.

  constructor();
  constructor(options: IKStoreOptions, defaults?: IMap<any>);
  constructor(name?: string | IKStoreOptions, defaults?: IMap<any>, options?: IKStoreOptions)
  constructor(name?: string | IKStoreOptions, defaults?: IMap<any>, options?: IKStoreOptions) {
    super();

    if (isPlainObject(name)) {
      options = <IKStoreOptions>name;
      name = undefined;
    }

    options = options || {};
    if (name)
      options.name = <string>name;

    this.options = Object.assign({}, DEFAULTS, options);
    this.path = this.getPath(this.options);

    process.on('exit', this.exitHandler.bind(this, 'exit'));
    process.on('uncaughtException', this.exitHandler.bind(this, 'error'));

    this.defaults(defaults);

  }

  /**
   * Iterator
   */
  *[Symbol.iterator]() {
    let { db } = this;
    if (this.options.entrypoint)
      db = get<any>(db, this.options.entrypoint);
    for (const k of Object.keys(db)) {
      yield { key: k, item: db[k] };
    }
  }

  /**
   * Exit Handler
   * Ensures write finishes before exit.
   *
   * @param type the type of exit.
   * @param codeOrErr the code or error upon exit.
   */
  private exitHandler(type: string, codeOrErr) {

    process.removeListener('exit', this.exitHandler);
    process.removeListener('uncaughtException', this.exitHandler);

    process.stdin.resume();

    const handleExit = () => {
      if (this._writing)
        return handleExit();
      if (type === 'error')
        throw codeOrErr;
      process.exit(codeOrErr);
    };

    handleExit();

  }

  private createHash() {
    return crypto
      .createHash(HASH_ALGORITHIM)
      .update(this.options.encryptionKey)
      .digest();
  }

  /**
   * Ensure Dir
   * Ensures the directory exists.
   */
  private ensureDir() {
    makedir.sync(dirname(this.path));
    return this;
  }

  /**
   * Normalize Key
   * Normalizes key prefixing with superkey if exists.
   *
   * @param key the key to be normalized.
   */
  private normalizeKey(key: string): string {
    if (this.options.entrypoint)
      key = `${this.options.entrypoint}.${key}`;
    return key;
  }

  /**
   * Has Listener
   * Checks if the Event Emitter contains a listener for the given key.
   *
   * @param key the key to inspect eventNames for.
   */
  private hasListener(key: string) {
    const names = this.eventNames();
    return ~names.indexOf(key);
  }

  /**
   * Ensure Default
   * Ensures a default value.
   *
   * @param val the value to be inpsected.
   * @param def the default value if val is undefined.
   */
  private ensureDefault(val: any, def: any = null) {
    if (isUndefined(val))
      return def;
    return val;
  }

  /**
   * Transform
   * Runs transform from options.
   *
   * @param data the data to be transformed.
   */
  private transform(data) {

    if (!this.options.transform || !isFunction(this.options.transform))
      return data;

    let collection = data;

    if (this.options.entrypoint)
      collection = get(data, this.options.entrypoint);

    for (const k in collection) {
      collection[k] = this.options.transform(k, collection[k]);
    }

    if (this.options.entrypoint)
      set(data, this.options.entrypoint, collection);
    else
      data = collection;

    return data;

  }

  // GETTERS //

  get db(): C {

    try {

      if (!this._dirty && this._loaded)
        return this._cache;

      const oldValue = this._cache;

      let decrypted: any = readFileSync(this.path, 'utf8') || '';

      if (this.options.encryptionKey) {
        const arr = decrypted.split(':');
        const iv = new Buffer(arr[0], 'hex');
        decrypted = new Buffer(arr[1], 'hex');
        const hash = this.createHash();
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHIM, hash, iv);
        decrypted =
          Buffer.concat([decipher.update(decrypted), decipher.final()]).toString();
      }

      decrypted = JSON.parse(decrypted);

      let cache = decrypted;
      cache = Object.assign(createObj(), cache);

      // Transform values.

      if (this._loaded_defaults &&
        this.options.transform &&
        isFunction(this.options.transform)) {
        cache = this.transform(cache);
      }

      this._dirty = false; // superdata updated from db.
      this._loaded = true; // indicated we've loaded once from db.
      this.emit('loaded', this.ensureDefault(cache), this.ensureDefault(oldValue));

      return cache;

    }

    catch (err) {

      this._dirty = true;

      // Directory doesn't exist.
      if (err.code === 'ENOENT') {
        this.ensureDir();
        return createObj() as C;
      }

      // No access to file.
      if (err.code === 'EACCES')
        err.message = `${err.message} (ACCESS DENIED)`;

      // Invalid JSON.
      if (err.name === 'SyntaxError') {
        return createObj() as C;
      }

      // We're hosed throw error.
      throw err;

    }

  }

  set db(data: C) {

    try {

      this.ensureDir();

      data = data || {} as C;
      const oldValue = this._cache;

      this.ensureDir();

      let encrypted: any = JSON.stringify(data, null, '\t');

      if (this.options.encryptionKey) {
        const iv = crypto.randomBytes(IV_LEN);
        const hash = this.createHash();
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHIM, hash, iv);
        encrypted = Buffer.concat([cipher.update(encrypted), cipher.final()]);
        encrypted = `${iv.toString('hex')}:${encrypted.toString('hex')}`;
      }

      writeAtomic.sync(this.path, encrypted || ''); // persist to file system.
      this._cache = data; // update cache.

      this.emit('persisted', this.ensureDefault(data), this.ensureDefault(oldValue));

      this._dirty = true;
      this._writing = false;

    }
    catch (err) {
      this._dirty = true;
      this._writing = false;
      if (err.code === 'EACCES')
        err.message = `${err.message} (ACCESS DENIED)`;
      throw err;
    }

  }

  /**
   * For Each
   * Sames as [...instance] here for convenience.
   */
  get iterable() {
    return [...this];
  }

  /**
   * Size
   * Gets the size of keys using iterable.
   */
  get size() {
    return [...this].length;
  }

  // HELPER METHODS //

  /**
   * Get Path
   * Creates path for persisting data.
   *
   * @param options options to be used for generating path.
   */
  getPath(options?: IKStoreOptions) {

    options = options || {};

    const isUserDir = isValue(options.dir);
    let name = options.name || basename(process.cwd());

    if (!/\..+$/.test(<string>name))
      name += '.json';

    // Ensure the directory
    const dir = options.dir || homedir();

    // Define store path for persistence.
    const path = !isUserDir ?
      join(<string>dir, '.kstor', 'configs', <string>name) :
      join(<string>dir, <string>name);

    return path;
  }

  /**
   * Defaults
   * Ensures defaults in store.
   *
   * @param args array of default sources.
   */
  defaults(data: any) {

    let cache = this.db;
    const hasEntry = has(data, this.options.entrypoint);

    // data is at path NOT superdata.
    if (this.options.entrypoint && !hasEntry)
      data = set(createObj(), this.options.entrypoint, data);

    const result = Object.assign(createObj(), data, cache);
    this.db = this.transform(result);

    this._loaded_defaults = true;

    return this;

  }

  // DB METHODS //

  /**
   * Has Key
   * Checks if store has the specified key.
   *
   * @param key the key to inspect.
   */
  has(key: string) {
    return has(this.db, this.normalizeKey(key));
  }

  /**
   * Get
   * : Gets value for the provided key.
   *
   * @param key the key for looking up store value.
   * @param def a default value.
   */
  get<T>(key: string, def?: any): T {
    return get<T>(this.db, this.normalizeKey(key));
  }

  /**
   * Set
   * Sets a value for key.
   *
   * @param key the key to set.
   * @param value the value to set for specified key.
   */
  set(key: string | IMap<any>, value?: any) {

    const cache = this.db;

    const setData = (k, newValue) => {
      const origKey = k;
      k = this.normalizeKey(<string>k);
      const oldValue = get(cache, k);
      set(cache, <string>k, newValue);
      if (this.hasListener(origKey as string)) {
        this.emit(`${origKey}`, this.ensureDefault(newValue), this.ensureDefault(oldValue));
      }
      this.emit('changed', this.ensureDefault(newValue), this.ensureDefault(oldValue));
    };

    if (isPlainObject(key)) {
      for (const k in key as IMap<C>) {
        setData(k, key[k]);
      }
    }
    else {
      setData(key, value);
    }

    this.db = cache;

    return this;

  }

  /**
   * Del
   * : Removes a key from the store.
   *
   * @param key the key to be removed.
   */
  del(key: string) {
    const origKey = key;
    const cache = this.db;
    key = this.normalizeKey(key);
    const oldValue = get(cache, key);
    del(cache, key);
    this.db = cache;
    this.emit('deleted', this.ensureDefault(oldValue));
    return this;
  }

  // QUERY METHODS //

  /**
   * Query Value
   * Validates if value matches query expression.
   *
   * @param operator the operator used to validate value.
   * @param filter the comparator value used in validation.
   * @param value the current value to evaluate.
   */
  private queryValue(operator: any, filter: any, value: any) {

    if (isDate(value)) // convert dates to epoch for comparing.
      value = value.getTime();

    if (isDate(filter))
      filter = filter.getTime();

    let valid;

    switch (operator) {

      case '$eq':
        valid = value === filter;
        break;

      case '$ne':
        valid = value !== filter;
        break;

      case '$gt':
        valid = value > filter;
        break;

      case '$lt':
        valid = value < filter;
        break;

      case '$gte':
        valid = value >= filter;
        break;

      case '$lte':
        valid = value <= filter;
        break;

      case '$in':
        if (!Array.isArray(filter))
          filter = [filter];
        if (isString(value) || Array.isArray(value)) {
          if (isString(value))
            value = value.split('');
          return containsAny(value, filter);
        }
        break;

      case '$nin':
        if (!Array.isArray(filter))
          filter = [filter];
        if (isString(value) || Array.isArray(value)) {
          if (isString(value))
            value = value.split('');
          return !containsAny(value, filter);
        }
        break;

      case '$not':
        if (isRegExp(filter))
          valid = !filter.test(value);
        else
          valid = value !== filter;
        break;

      case '$exists':
        if (filter === false)
          valid = !isValue(value);
        else
          valid = isValue(value);
        break;

      case '$regexp':
        if (!isRegExp(filter))
          filter = new RegExp(filter, 'i'); // default to case insensitive.
        valid = filter.test(value);
        break;

      case '$like':
        if (!isRegExp(filter))
          filter = new RegExp('.*' + filter + '.*', 'i');
        valid = filter.test(value);
        break;

      default:
        valid = false;

    }

    return valid;

  }

  /**
   * Normalize Query
   * Normalizes the query merging $and, $or.
   *
   * @param query
   */
  private queryNormalize(query: any) {

    const normalized: any = {};

    if (!isPlainObject(query))
      throw new Error(`Normalize query expected type of object but got type ${typeof query}.`);

    const mergeNormalized = (key, obj, logical?) => { // add normalized object.

      if (!isPlainObject(obj))
        obj = { $eq: obj };

      for (const k in obj) { // break out each operator to sep object.

        const tmp: any = {
          operator: k,
          comparator: obj[k]
        };

        tmp.logical = logical || '$and';

        if (!normalized[key])
          normalized[key] = [];

        normalized[key].push(tmp);

      }

    };

    const mergeNested = (obj) => { // helper method to merge into normalized.
      for (const n in obj) {
        if (!normalized[n])
          normalized[n] = obj[n];
        else
          normalized[n] = normalized[n].concat(obj[n]);
      }
    };

    // example $and: [ { price: { $gt: 100 } }, { price: { $lt: 300} } ]

    const logicals = ['$and', '$or', '$nor'];

    for (const k in query) {

      const exps = query[k]; // [ { price: { $gt: 100 } }, ... ] or { $lt: 100 }

      if (contains(logicals, k)) { // is logical.

        if (!Array.isArray(exps))
          throw new Error(`Logical query expected array but got type ${typeof exps}.`);

        exps.forEach(exp => { // { price: { $gt: 100 } }

          if (exp.$and || exp.$or) { // is nest $and, $or
            mergeNested(this.queryNormalize(exp));
          }

          else {
            const prop = keys(exp)[0]; // price
            let obj = exp[prop]; //  { $gt: 100 }
            mergeNormalized(prop, obj, k);

          }

        });

      }

      else {

        const obj = query[k];
        if (contains(logicals, k)) {
          const nested = this.queryNormalize(obj);
        }
        else {
          mergeNormalized(k, query[k]);
        }

      }

    }

    return normalized;

  }

  /**
   * Query Row
   * Queries a row in the collection.
   *
   * @param row the row to be inspected.
   * @param query the expressions used to query the row.
   */
  private queryRow(key: string, row: IMap<any>, query: any) {

    if (!isValue(row) || isEmpty(row))
      return false;

    query = this.queryNormalize(query);

    let validAnd;
    let validOr;
    let validNor;


    for (const prop in query) {

      const arr = query[prop]; // [ { operator: $eq: comparator: 100 }, ... ];

      for (const exp of arr) {

        const isOr = exp.logical === '$or';
        const isNor = exp.logical === '$nor';
        const isAnd = exp.logical === '$and';

        if (isOr && validOr) // already has match include in colleciton.
          continue;

        if (isAnd && validAnd === false) // don't eval already failed exclude from collection.
          continue;

        if (isNor && validNor) // already found valid nor match.
          continue;

        const value = get(row, prop);
        let isMatch = this.queryValue(exp.operator, exp.comparator, value);

        if (isOr) validOr = isMatch;
        else if (isAnd) validAnd = isMatch;
        else if (isNor) validNor = isMatch;

      }

    }

    // if $and operators are valid (default) or an $or
    // operator expression is true and no $nor matches
    // are found then the row is included.
    return (validAnd || validOr) && !validNor;

  }

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
  query<T>(key: string, query?: IMap<any>, skip?: number, take?: number): { [key: string]: T } {

    let result: any = {};

    let collection;

    if (this.options.entrypoint) {
      collection = (key === '*') ?
        get(this._cache, this.options.entrypoint) :
        get(this._cache, this.normalizeKey(key));
    }
    else {
      collection = key === '*' ? this._cache : this.get(key);
    }

    if (!collection || !isObject(collection)) // must be object.
      return result;

    let _skipped = 0;
    let _taken = 0;

    for (const k in collection) { // iterate each row.

      if (isValue(skip)) {
        _skipped++;
        if (_skipped <= skip) // skipping this row.
          continue;
      }

      const row = collection[k];

      if (!isPlainObject(query)) { // return all rows less skip/take.

        const tmp = {};
        tmp[k] = row;
        Object.assign(result, tmp);
        _taken++;

      }
      else {

        const match = this.queryRow(k, row, query);

        if (match) {
          const tmp = {};
          tmp[k] = row;
          Object.assign(result, tmp);
          _taken++;
        }

      }

      if (isValue(take) && _taken >= take) // max records taken exit.
        break;

    }

    return result;

  }

  // UTILITIES //

  /**
   * Clear
   * Clears the store basically {}
   */
  clear() {
    const obj = createObj();
    this.db = obj as C;
    this.emit('cleared', obj);
    return this;
  }

  /**
   * Snapshot
   * Gets a snapshot of the store's state.
   */
  snapshot(): C {
    return clone<C>(this.db);
  }

}

/**
 * Create Store
 * Helper method which creates store of anonymous types.
 */
export function createStore();

/**
 * Create Store
 * Helper method which creates store of anonymous types.
 *
 * @param options configuration options.
 * @param defaults default values to populate the database with.
 */
export function createStore(options: IKStoreOptions, defaults?: IMap<any>);

/**
 * Create Store
 * Helper method which creates store of anonymous types.
 *
 * @param name the name to use for the filename when persisted.
 * @param defaults default values to populate the database with.
 * @param options configuration options.
 */
export function createStore(name?: string, defaults?: IMap<any>, options?: IKStoreOptions);

export function createStore(name?: string | IKStoreOptions, defaults?: IMap<any>, options?: IKStoreOptions): KStor<any> {
  return new KStor<any>(name, defaults, options);
}



