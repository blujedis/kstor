
import { homedir } from 'os';
import { readFileSync } from 'graceful-fs';
import * as writeAtomic from 'write-file-atomic';
import * as makedir from 'make-dir';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { basename, parse, resolve, join, dirname } from 'path';
import { get, set, del, has, isPlainObject, isBoolean, isString, isError, clone, isFunction, isValue, keys, containsAny, isObject, isBuffer, isUndefined, isRegExp, isEmpty, toArray, toMap, isDate, isSymbol, contains, extend, tryWrap } from 'chek';
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

  private _loaded: boolean;                 // data has been initially loaded.
  private _dirty: boolean;                  // dirty data should reload..
  private _writing: boolean;                // Kstor is persisting data.
  private _loaded_defaults: boolean;        // flag indicating if defaults have been set.
  private _cache: any = {};                 // cached local top level data.
  private _pkg: any = {};                   // the package.json file.
  private _cwd: string = process.cwd();     // the current working directory.

  path: string;                             // filepath for persisting.
  options: IKStoreOptions;                  // KStor options.

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

    // Read package.json.
    tryWrap(() => {
      this._pkg = JSON.parse(readFileSync(resolve(this._cwd, 'package.json')).toString());
    })({
      name: basename(this._cwd)
    });

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
      yield { key: k, value: db[k] };
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
      // process.exit(codeOrErr);
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
  private getPath(options?: IKStoreOptions) {

    options = options || {};

    let isUserDir = isValue(options.dir);
    let name = options.name || 'config.json';
    let folder = this._pkg.name || basename(this._cwd);
    let dir;

    if (!/\..+$/.test(<string>name))
      name += '.json';

    // Parse name check for dir.
    const parsedName = parse(name);

    // User defined filename contains dir.
    if (parsedName.dir) {
      name = parsedName.base;
      folder = parsedName.dir;
    }

    if (options.dir && !parsedName.dir)
      folder = '';

    // Ensure the directory
    dir = dir || options.dir || homedir();

    // Merge folder and name
    name = join(folder, name);

    // Define store path for persistence.
    const path = !isUserDir ?
      join(<string>dir, '.kstor', <string>name) :
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


