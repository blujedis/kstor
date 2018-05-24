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
        if (chek_1.isPlainObject(name)) {
            options = name;
            name = undefined;
        }
        options = options || {};
        if (name)
            options.name = name;
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
            process.exit(codeOrErr);
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
        const isUserDir = chek_1.isValue(options.dir);
        let name = options.name || path_1.basename(process.cwd());
        if (!/\..+$/.test(name))
            name += '.json';
        // Ensure the directory
        const dir = options.dir || os_1.homedir();
        // Define store path for persistence.
        const path = !isUserDir ?
            path_1.join(dir, '.kstor', 'configs', name) :
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
     * Get
     * : Gets value for the provided key.
     *
     * @param key the key for looking up store value.
     * @param def a default value.
     */
    get(key, def) {
        return chek_1.get(this.db, this.normalizeKey(key));
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
    // QUERY METHODS //
    /**
     * Query Value
     * Validates if value matches query expression.
     *
     * @param operator the operator used to validate value.
     * @param filter the comparator value used in validation.
     * @param value the current value to evaluate.
     */
    queryValue(operator, filter, value) {
        if (chek_1.isDate(value)) // convert dates to epoch for comparing.
            value = value.getTime();
        if (chek_1.isDate(filter))
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
                if (chek_1.isString(value) || Array.isArray(value)) {
                    if (chek_1.isString(value))
                        value = value.split('');
                    return chek_1.containsAny(value, filter);
                }
                break;
            case '$nin':
                if (!Array.isArray(filter))
                    filter = [filter];
                if (chek_1.isString(value) || Array.isArray(value)) {
                    if (chek_1.isString(value))
                        value = value.split('');
                    return !chek_1.containsAny(value, filter);
                }
                break;
            case '$not':
                if (chek_1.isRegExp(filter))
                    valid = !filter.test(value);
                else
                    valid = value !== filter;
                break;
            case '$exists':
                if (filter === false)
                    valid = !chek_1.isValue(value);
                else
                    valid = chek_1.isValue(value);
                break;
            case '$regexp':
                if (!chek_1.isRegExp(filter))
                    filter = new RegExp(filter, 'i'); // default to case insensitive.
                valid = filter.test(value);
                break;
            case '$like':
                if (!chek_1.isRegExp(filter))
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
    queryNormalize(query) {
        const normalized = {};
        if (!chek_1.isPlainObject(query))
            throw new Error(`Normalize query expected type of object but got type ${typeof query}.`);
        const mergeNormalized = (key, obj, logical) => {
            if (!chek_1.isPlainObject(obj))
                obj = { $eq: obj };
            for (const k in obj) { // break out each operator to sep object.
                const tmp = {
                    operator: k,
                    comparator: obj[k]
                };
                tmp.logical = logical || '$and';
                if (!normalized[key])
                    normalized[key] = [];
                normalized[key].push(tmp);
            }
        };
        const mergeNested = (obj) => {
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
            if (chek_1.contains(logicals, k)) { // is logical.
                if (!Array.isArray(exps))
                    throw new Error(`Logical query expected array but got type ${typeof exps}.`);
                exps.forEach(exp => {
                    if (exp.$and || exp.$or) { // is nest $and, $or
                        mergeNested(this.queryNormalize(exp));
                    }
                    else {
                        const prop = chek_1.keys(exp)[0]; // price
                        let obj = exp[prop]; //  { $gt: 100 }
                        mergeNormalized(prop, obj, k);
                    }
                });
            }
            else {
                const obj = query[k];
                if (chek_1.contains(logicals, k)) {
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
    queryRow(key, row, query) {
        if (!chek_1.isValue(row) || chek_1.isEmpty(row))
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
                const value = chek_1.get(row, prop);
                let isMatch = this.queryValue(exp.operator, exp.comparator, value);
                if (isOr)
                    validOr = isMatch;
                else if (isAnd)
                    validAnd = isMatch;
                else if (isNor)
                    validNor = isMatch;
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
    query(key, query, skip, take) {
        let result = {};
        let collection;
        if (this.options.entrypoint) {
            collection = (key === '*') ?
                chek_1.get(this._cache, this.options.entrypoint) :
                chek_1.get(this._cache, this.normalizeKey(key));
        }
        else {
            collection = key === '*' ? this._cache : this.get(key);
        }
        if (!collection || !chek_1.isObject(collection)) // must be object.
            return result;
        let _skipped = 0;
        let _taken = 0;
        for (const k in collection) { // iterate each row.
            if (chek_1.isValue(skip)) {
                _skipped++;
                if (_skipped <= skip) // skipping this row.
                    continue;
            }
            const row = collection[k];
            if (!chek_1.isPlainObject(query)) { // return all rows less skip/take.
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
            if (chek_1.isValue(take) && _taken >= take) // max records taken exit.
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