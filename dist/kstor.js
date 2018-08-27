"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = require("os");
const graceful_fs_1 = require("graceful-fs");
const writeAtomic = require("write-file-atomic");
const makedir = require("make-dir");
const crypto = require("crypto");
const events_1 = require("events");
const path_1 = require("path");
const chek_1 = require("chek");
const ENCRYPTION_ALGORITHIM = 'aes-256-cbc';
const IV_LEN = 16;
const HASH_ALGORITHIM = 'sha256';
// DEFAULTS
const DEFAULTS = {
    name: null,
    dir: null,
    entrypoint: null,
    encryptionKey: null,
    transform: null // optional transform to run data through on load.
};
// EVENTS
// loaded      (newValue, oldValue)
// persisted   (newValue, oldValue)
// changed     (newValue, oldValue)
// deleted     (oldValue)
const createObj = () => Object.create(null);
class KStor extends events_1.EventEmitter {
    constructor(name, defaults, options) {
        super();
        this._cache = {}; // cached local top level data.
        this._pkg = {}; // the package.json file.
        this._cwd = process.cwd(); // the current working directory.
        if (chek_1.isPlainObject(name)) {
            options = name;
            name = undefined;
        }
        options = options || {};
        if (name)
            options.name = name;
        this.options = Object.assign({}, DEFAULTS, options);
        // Read package.json.
        chek_1.tryWrap(() => {
            this._pkg = JSON.parse(graceful_fs_1.readFileSync(path_1.resolve(this._cwd, 'package.json')).toString());
        })({
            name: path_1.basename(this._cwd)
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
            db = chek_1.get(db, this.options.entrypoint);
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
    exitHandler(type, codeOrErr) {
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
    createHash() {
        return crypto
            .createHash(HASH_ALGORITHIM)
            .update(this.options.encryptionKey)
            .digest();
    }
    /**
     * Ensure Dir
     * Ensures the directory exists.
     */
    ensureDir() {
        makedir.sync(path_1.dirname(this.path));
        return this;
    }
    /**
     * Normalize Key
     * Normalizes key prefixing with superkey if exists.
     *
     * @param key the key to be normalized.
     */
    normalizeKey(key) {
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
    hasListener(key) {
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
    ensureDefault(val, def = null) {
        if (chek_1.isUndefined(val))
            return def;
        return val;
    }
    /**
     * Transform
     * Runs transform from options.
     *
     * @param data the data to be transformed.
     */
    transform(data) {
        if (!this.options.transform || !chek_1.isFunction(this.options.transform))
            return data;
        let collection = data;
        if (this.options.entrypoint)
            collection = chek_1.get(data, this.options.entrypoint);
        for (const k in collection) {
            collection[k] = this.options.transform(k, collection[k]);
        }
        if (this.options.entrypoint)
            chek_1.set(data, this.options.entrypoint, collection);
        else
            data = collection;
        return data;
    }
    // GETTERS //
    get db() {
        try {
            if (!this._dirty && this._loaded)
                return this._cache;
            const oldValue = this._cache;
            let decrypted = graceful_fs_1.readFileSync(this.path, 'utf8') || '';
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
                chek_1.isFunction(this.options.transform)) {
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
                return createObj();
            }
            // No access to file.
            if (err.code === 'EACCES')
                err.message = `${err.message} (ACCESS DENIED)`;
            // Invalid JSON.
            if (err.name === 'SyntaxError') {
                return createObj();
            }
            // We're hosed throw error.
            throw err;
        }
    }
    set db(data) {
        try {
            this.ensureDir();
            data = data || {};
            const oldValue = this._cache;
            this.ensureDir();
            let encrypted = JSON.stringify(data, null, '\t');
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
    getPath(options) {
        options = options || {};
        let isUserDir = chek_1.isValue(options.dir);
        let name = options.name || 'config.json';
        let folder = this._pkg.name || path_1.basename(this._cwd);
        let dir;
        if (!/\..+$/.test(name))
            name += '.json';
        // Parse name check for dir.
        const parsedName = path_1.parse(name);
        // User defined filename contains dir.
        if (parsedName.dir) {
            name = parsedName.base;
            folder = parsedName.dir;
        }
        if (options.dir && !parsedName.dir)
            folder = '';
        // Ensure the directory
        dir = dir || options.dir || os_1.homedir();
        // Merge folder and name
        name = path_1.join(folder, name);
        // Define store path for persistence.
        const path = !isUserDir ?
            path_1.join(dir, '.kstor', name) :
            path_1.join(dir, name);
        return path;
    }
    /**
     * Defaults
     * Ensures defaults in store.
     *
     * @param args array of default sources.
     */
    defaults(data) {
        let cache = this.db;
        const hasEntry = chek_1.has(data, this.options.entrypoint);
        // data is at path NOT superdata.
        if (this.options.entrypoint && !hasEntry)
            data = chek_1.set(createObj(), this.options.entrypoint, data);
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
    has(key) {
        return chek_1.has(this.db, this.normalizeKey(key));
    }
    /**
     * Gets value for the provided key.
     *
     * @param key the key for looking up store value.
     * @param def a default value.
     */
    get(key, def) {
        const result = chek_1.get(this.db, this.normalizeKey(key));
        if (chek_1.isValue(result))
            return result;
        if (chek_1.isValue(def)) {
            this.set(key, def);
            return def;
        }
        return undefined;
    }
    /**
     * Set
     * Sets a value for key.
     *
     * @param key the key to set.
     * @param value the value to set for specified key.
     */
    set(key, value) {
        const cache = this.db;
        const setData = (k, newValue) => {
            const origKey = k;
            k = this.normalizeKey(k);
            const oldValue = chek_1.get(cache, k);
            chek_1.set(cache, k, newValue);
            if (this.hasListener(origKey)) {
                this.emit(`${origKey}`, this.ensureDefault(newValue), this.ensureDefault(oldValue));
            }
            this.emit('changed', this.ensureDefault(newValue), this.ensureDefault(oldValue));
        };
        if (chek_1.isPlainObject(key)) {
            for (const k in key) {
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
    del(key) {
        const origKey = key;
        const cache = this.db;
        key = this.normalizeKey(key);
        const oldValue = chek_1.get(cache, key);
        chek_1.del(cache, key);
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
        this.db = obj;
        this.emit('cleared', obj);
        return this;
    }
    /**
     * Snapshot
     * Gets a snapshot of the store's state.
     */
    snapshot() {
        return chek_1.clone(this.db);
    }
}
exports.KStor = KStor;
//# sourceMappingURL=kstor.js.map